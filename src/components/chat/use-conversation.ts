"use client";

import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { removeMedia, uploadMedia } from "@/lib/supabase/media";
import { errorMessage } from "@/lib/utils/errors";
import type { Reaction } from "@/types/app";
import type { ChatMessage } from "./types";

const PAGE = 40;

export function useConversation(conversationId: string) {
  const { supabase, me, partner, refreshUnread, setActiveConversation } = useApp();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [reactions, setReactions] = React.useState<Record<string, Reaction[]>>({});
  const [partnerReadAt, setPartnerReadAt] = React.useState<string | null>(null);
  const [myReadAt, setMyReadAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [hasOlder, setHasOlder] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [incoming, setIncoming] = React.useState(0);
  const messagesRef = React.useRef<ChatMessage[]>([]);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadReactions = React.useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const { data } = await supabase.from("message_reactions").select("*").in("message_id", ids);
      if (!data) return;
      setReactions((prev) => {
        const next = { ...prev };
        ids.forEach((id) => (next[id] = []));
        data.forEach((r) => (next[r.message_id] ??= []).push(r));
        return next;
      });
    },
    [supabase],
  );

  const loadLatest = React.useCallback(async () => {
    setError(null);
    const [msgs, reads] = await Promise.all([
      supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(PAGE),
      supabase.from("conversation_reads").select("*").eq("conversation_id", conversationId),
    ]);
    if (msgs.error) {
      setError(errorMessage(msgs.error));
      setLoading(false);
      return;
    }
    const list = (msgs.data ?? []).reverse();
    setMessages(list);
    setHasOlder((msgs.data ?? []).length === PAGE);
    setPartnerReadAt(reads.data?.find((r) => r.user_id !== me.id)?.last_read_at ?? null);
    setMyReadAt((prev) => prev ?? reads.data?.find((r) => r.user_id === me.id)?.last_read_at ?? "1970-01-01T00:00:00Z");
    setLoading(false);
    void loadReactions(list.map((m) => m.id));
  }, [supabase, conversationId, me.id, loadReactions]);

  const loadOlder = React.useCallback(async () => {
    const oldest = messagesRef.current.find((m) => !m._local);
    if (!oldest || loadingOlder) return 0;
    setLoadingOlder(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    setLoadingOlder(false);
    const older = (data ?? []).reverse();
    setHasOlder((data ?? []).length === PAGE);
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    void loadReactions(older.map((m) => m.id));
    return older.length;
  }, [supabase, conversationId, loadingOlder, loadReactions]);

  /** Loads the window around a message (for search results / reply jumps). */
  const loadAround = React.useCallback(
    async (target: { id: string; created_at: string }) => {
      if (messagesRef.current.some((m) => m.id === target.id)) return true;
      const [before, after] = await Promise.all([
        supabase.from("messages").select("*").eq("conversation_id", conversationId).lt("created_at", target.created_at).order("created_at", { ascending: false }).limit(15),
        supabase.from("messages").select("*").eq("conversation_id", conversationId).gte("created_at", target.created_at).order("created_at", { ascending: true }).limit(600),
      ]);
      if (before.error || after.error) return false;
      const list = [...(before.data ?? []).reverse(), ...(after.data ?? [])];
      setMessages(list);
      setHasOlder((before.data ?? []).length === 15);
      void loadReactions(list.map((m) => m.id));
      return true;
    },
    [supabase, conversationId, loadReactions],
  );

  // Mark as read (throttled) while the conversation is visible.
  const lastMark = React.useRef(0);
  const markRead = React.useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastMark.current < 1500) return;
    lastMark.current = now;
    await supabase.from("conversation_reads").upsert({ conversation_id: conversationId, user_id: me.id, last_read_at: new Date().toISOString() });
    void refreshUnread();
  }, [supabase, conversationId, me.id, refreshUnread]);

  React.useEffect(() => {
    // The view is keyed by conversation id, so state starts fresh for each conversation.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load; state is set when the request resolves
    void loadLatest().then(markRead);
    setActiveConversation(conversationId);

    const channel = supabase
      .channel(`ours:chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, ({ new: row }) => {
        const msg = row as ChatMessage;
        setMessages((prev) => {
          const idx = prev.findIndex((p) => p.id === msg.id);
          if (idx >= 0) {
            const copy = prev.slice();
            const local = copy[idx]._local;
            if (local?.previewUrl) URL.revokeObjectURL(local.previewUrl);
            copy[idx] = msg;
            return copy;
          }
          return [...prev, msg];
        });
        if (msg.sender_id !== me.id) {
          setIncoming((n) => n + 1);
          void markRead();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, ({ new: row }) => {
        const msg = row as ChatMessage;
        setMessages((prev) => prev.map((p) => (p.id === msg.id ? msg : p)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, ({ old }) => {
        setMessages((prev) => prev.filter((p) => p.id !== (old as { id: string }).id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, ({ new: row }) => {
        const r = row as Reaction;
        if (!messagesRef.current.some((m) => m.id === r.message_id)) return;
        setReactions((prev) => {
          const list = prev[r.message_id] ?? [];
          if (list.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) return prev;
          return { ...prev, [r.message_id]: [...list, r] };
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, ({ old }) => {
        const r = old as Reaction;
        setReactions((prev) => {
          const list = prev[r.message_id];
          if (!list) return prev;
          return { ...prev, [r.message_id]: list.filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)) };
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `conversation_id=eq.${conversationId}` }, ({ new: row }) => {
        const r = row as { user_id: string; last_read_at: string };
        if (r?.user_id && r.user_id !== me.id) setPartnerReadAt(r.last_read_at);
      })
      .subscribe((status) => {
        // After a reconnect, re-sync anything we may have missed.
        if (status === "SUBSCRIBED" && messagesRef.current.length) void loadLatest();
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") void markRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      setActiveConversation(null);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, me.id, loadLatest, markRead, setActiveConversation]);

  /* ---------------- actions ---------------- */

  const insertMessage = React.useCallback(
    async (msg: ChatMessage) => {
      const { _local, ...row } = msg;
      void _local;
      const { data, error } = await supabase
        .from("messages")
        .insert({
          id: row.id,
          conversation_id: row.conversation_id,
          kind: row.kind,
          body: row.body,
          attachment_path: row.attachment_path,
          attachment_meta: row.attachment_meta,
          reply_to_id: row.reply_to_id,
          sender_id: me.id,
        })
        .select()
        .single();
      if (error) throw error;
      setMessages((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    },
    [supabase, me.id],
  );

  const optimistic = (partial: Partial<ChatMessage>): ChatMessage => ({
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    sender_id: me.id,
    kind: "text",
    body: null,
    attachment_path: null,
    attachment_meta: {},
    reply_to_id: null,
    edited_at: null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    ...partial,
    _local: { status: "sending", ...partial._local },
  });

  const markFailed = (id: string, retry: () => void) =>
    setMessages((prev) => prev.map((p) => (p.id === id ? { ...p, _local: { ...p._local, status: "failed", retry } } : p)));

  const sendText = React.useCallback(
    async (text: string, replyToId: string | null) => {
      const body = text.trim().slice(0, 4000);
      if (!body) return;
      const msg = optimistic({ kind: "text", body, reply_to_id: replyToId });
      setMessages((prev) => [...prev, msg]);
      const attempt = async () => {
        setMessages((prev) => prev.map((p) => (p.id === msg.id ? { ...p, _local: { status: "sending" } } : p)));
        try {
          await insertMessage(msg);
        } catch (err) {
          markFailed(msg.id, attempt);
          toast.error(errorMessage(err));
        }
      };
      await attempt();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insertMessage, conversationId, me.id],
  );

  const sendFile = React.useCallback(
    async (file: File | Blob, opts: { replyToId: string | null; caption?: string; voice?: { duration: number; waveform: number[] } }) => {
      const isVoice = !!opts.voice;
      const kindGuess = isVoice ? "audio" : file.type.startsWith("video") ? "video" : "image";
      const previewUrl = isVoice ? undefined : URL.createObjectURL(file);
      const msg = optimistic({
        kind: kindGuess,
        body: opts.caption?.trim() || null,
        reply_to_id: opts.replyToId,
        attachment_meta: opts.voice ? { duration: opts.voice.duration, waveform: opts.voice.waveform } : {},
        _local: { status: "sending", previewUrl, file },
      });
      setMessages((prev) => [...prev, msg]);
      const attempt = async () => {
        setMessages((prev) => prev.map((p) => (p.id === msg.id ? { ...p, _local: { ...p._local, status: "sending" } } : p)));
        try {
          const up = await uploadMedia(file, "chat");
          const meta = { ...(msg.attachment_meta as object), mime: up.mime, size: up.size, width: up.width, height: up.height };
          await insertMessage({ ...msg, kind: up.kind, attachment_path: up.path, attachment_meta: meta });
        } catch (err) {
          markFailed(msg.id, attempt);
          toast.error(errorMessage(err));
        }
      };
      await attempt();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insertMessage, conversationId, me.id],
  );

  const editMessage = React.useCallback(
    async (id: string, body: string) => {
      const text = body.trim();
      if (!text) return;
      const { data, error } = await supabase.from("messages").update({ body: text }).eq("id", id).select().single();
      if (error) {
        toast.error(errorMessage(error));
        return;
      }
      setMessages((prev) => prev.map((p) => (p.id === id ? data : p)));
    },
    [supabase],
  );

  const deleteMessage = React.useCallback(
    async (m: ChatMessage) => {
      const { data, error } = await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id).select().single();
      if (error) {
        toast.error(errorMessage(error));
        return;
      }
      setMessages((prev) => prev.map((p) => (p.id === m.id ? data : p)));
      if (m.attachment_path) void removeMedia([m.attachment_path]);
    },
    [supabase],
  );

  const toggleReaction = React.useCallback(
    async (m: ChatMessage, emoji: string) => {
      const mineExisting = (reactions[m.id] ?? []).find((r) => r.user_id === me.id && r.emoji === emoji);
      if (mineExisting) {
        setReactions((prev) => ({ ...prev, [m.id]: (prev[m.id] ?? []).filter((r) => r !== mineExisting) }));
        const { error } = await supabase.from("message_reactions").delete().match({ message_id: m.id, user_id: me.id, emoji });
        if (error) toast.error(errorMessage(error));
      } else {
        const r: Reaction = { message_id: m.id, user_id: me.id, emoji, created_at: new Date().toISOString() };
        setReactions((prev) => ({ ...prev, [m.id]: [...(prev[m.id] ?? []), r] }));
        const { error } = await supabase.from("message_reactions").insert({ message_id: m.id, emoji });
        if (error && !/duplicate/i.test(error.message)) toast.error(errorMessage(error));
      }
    },
    [supabase, me.id, reactions],
  );

  const canSeeReceipts = Boolean(partner?.read_receipts && me.read_receipts);

  return {
    messages,
    reactions,
    partnerReadAt: canSeeReceipts ? partnerReadAt : null,
    myReadAt,
    loading,
    error,
    hasOlder,
    loadingOlder,
    incoming,
    reload: loadLatest,
    loadOlder,
    loadAround,
    sendText,
    sendFile,
    editMessage,
    deleteMessage,
    toggleReaction,
  };
}
