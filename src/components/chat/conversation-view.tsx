"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ChevronLeft, Copy, CornerUpLeft, Pencil, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/shared/avatar";
import { HeartGlyph } from "@/components/shared/heart";
import { ErrorState, Spinner } from "@/components/shared/states";
import { Lightbox, type LightboxItem } from "@/components/shared/lightbox";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { berlinDateString, formatTime, relativeDay, timeAgo } from "@/lib/utils/dates";
import { REACTION_EMOJIS } from "@/lib/constants";
import type { Conversation, Message } from "@/types/app";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { previewText, type ChatMessage } from "./types";
import { useConversation } from "./use-conversation";

const GROUP_GAP_MS = 5 * 60 * 1000;

function TypingBubble({ name }: { name: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="mt-3 flex items-end gap-2" aria-live="polite">
      <div className="w-8" />
      <div className="flex items-center gap-1 rounded-[1.25rem] rounded-bl-[0.4rem] border border-border bg-card px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-typing rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
        <span className="sr-only">{name} tippt gerade…</span>
      </div>
    </motion.div>
  );
}

function ChatSearch({ conversationId, onPick, onClose }: { conversationId: string; onPick: (m: Message) => void; onClose: () => void }) {
  const { supabase, nameOf } = useApp();
  const [q, setQ] = React.useState("");
  const [found, setResults] = React.useState<Message[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const results = q.trim().length < 2 ? null : found;

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = window.setTimeout(async () => {
      setLoading(true);
      const escaped = term.replace(/[%_\\]/g, (c) => `\\${c}`);
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .ilike("body", `%${escaped}%`)
        .order("created_at", { ascending: false })
        .limit(50);
      setResults(data ?? []);
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, supabase, conversationId]);

  return (
    <div className="absolute inset-x-0 top-full z-30 border-b border-border bg-background/95 shadow-lift backdrop-blur">
      <div className="flex items-center gap-2 p-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <label htmlFor="chat-search" className="sr-only">Im Chat suchen</label>
        <Input id="chat-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Im Chat suchen…" className="h-10" />
        <button onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted" aria-label="Suche schließen">
          <X className="size-4" />
        </button>
      </div>
      {results !== null || loading ? (
        <ul data-lenis-prevent className="max-h-[50dvh] overflow-y-auto border-t border-border">
          {loading && !results ? <li className="p-4 text-sm text-muted-foreground">Suche…</li> : null}
          {results?.length === 0 ? <li className="p-4 text-sm text-muted-foreground">Nichts gefunden.</li> : null}
          {results?.map((m) => (
            <li key={m.id}>
              <button onClick={() => onPick(m)} className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left hover:bg-muted">
                <span className="text-xs text-muted-foreground">
                  {nameOf(m.sender_id)} · {relativeDay(m.created_at)} {formatTime(m.created_at)}
                </span>
                <span className="line-clamp-2 text-sm">{m.body}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ConversationView({ conversation, showBack }: { conversation: Conversation; showBack: boolean }) {
  const { supabase, me, partner, partnerOnline, typing, nameOf } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const c = useConversation(conversation.id);
  const scroller = React.useRef<HTMLDivElement>(null);
  const topSentinel = React.useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [editing, setEditing] = React.useState<ChatMessage | null>(null);
  const [actionsFor, setActionsFor] = React.useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [newBelow, setNewBelow] = React.useState(0);
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  const initialScrollDone = React.useRef(false);
  const partnerTyping = typing[conversation.id];

  const byId = React.useMemo(() => new Map(c.messages.map((m) => [m.id, m])), [c.messages]);

  const media = React.useMemo(
    () => c.messages.filter((m) => !m.deleted_at && !m._local && m.attachment_path && (m.kind === "image" || m.kind === "video")),
    [c.messages],
  );
  const lightboxItems: LightboxItem[] = media.map((m) => ({ type: "storage", path: m.attachment_path!, kind: m.kind as "image" | "video", caption: m.body ?? undefined }));

  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewBelow(0);
  }, []);

  // Initial scroll / jump target.
  React.useLayoutEffect(() => {
    if (c.loading || initialScrollDone.current) return;
    initialScrollDone.current = true;
    const target = params.get("m");
    if (target) {
      void jumpTo(target);
    } else {
      scrollToBottom(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.loading]);

  React.useEffect(() => {
    initialScrollDone.current = false;
  }, [conversation.id]);

  // Follow new messages when at bottom, otherwise show the "new" pill.
  const lastId = c.messages[c.messages.length - 1]?.id;
  const lastMine = c.messages[c.messages.length - 1]?.sender_id === me.id;
  React.useEffect(() => {
    if (!lastId || !initialScrollDone.current) return;
    if (atBottom || lastMine) requestAnimationFrame(() => scrollToBottom(true));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- counting messages that arrived while scrolled up
    else setNewBelow((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  React.useEffect(() => {
    if (partnerTyping && atBottom) requestAnimationFrame(() => scrollToBottom(true));
  }, [partnerTyping, atBottom, scrollToBottom]);

  // Infinite scroll upwards.
  React.useEffect(() => {
    const el = topSentinel.current;
    const root = scroller.current;
    if (!el || !root || !c.hasOlder) return;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || c.loadingOlder) return;
        const prevHeight = root.scrollHeight;
        const prevTop = root.scrollTop;
        const n = await c.loadOlder();
        if (n) requestAnimationFrame(() => (root.scrollTop = root.scrollHeight - prevHeight + prevTop));
      },
      { root, rootMargin: "200px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [c.hasOlder, c.loadingOlder, c]);

  async function jumpTo(id: string, msg?: { id: string; created_at: string }) {
    let target = byId.get(id) ?? msg;
    if (!target) {
      const { data } = await supabase.from("messages").select("id, created_at").eq("id", id).maybeSingle();
      if (!data) return toast("Diese Nachricht gibt es nicht mehr.");
      target = data as ChatMessage;
    }
    await c.loadAround(target);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.getElementById(`m-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        setHighlight(id);
        window.setTimeout(() => setHighlight(null), 1800);
      }),
    );
  }

  // Build render list with day separators, groups and unread divider.
  const items = React.useMemo(() => {
    const out: ({ type: "day"; key: string; label: string } | { type: "unread"; key: string } | { type: "msg"; key: string; m: ChatMessage; first: boolean; last: boolean })[] = [];
    let unreadPlaced = false;
    c.messages.forEach((m, i) => {
      const prev = c.messages[i - 1];
      const next = c.messages[i + 1];
      const day = berlinDateString(new Date(m.created_at));
      if (!prev || berlinDateString(new Date(prev.created_at)) !== day) out.push({ type: "day", key: `d-${day}`, label: relativeDay(m.created_at) });
      if (!unreadPlaced && c.myReadAt && m.sender_id !== me.id && !m._local && m.created_at > c.myReadAt && prev) {
        out.push({ type: "unread", key: "unread" });
        unreadPlaced = true;
      }
      const sameAsPrev = prev && prev.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS && berlinDateString(new Date(prev.created_at)) === day;
      const sameAsNext = next && next.sender_id === m.sender_id && new Date(next.created_at).getTime() - new Date(m.created_at).getTime() < GROUP_GAP_MS && berlinDateString(new Date(next.created_at)) === day;
      out.push({ type: "msg", key: m.id, m, first: !sameAsPrev, last: !sameAsNext });
    });
    return out;
  }, [c.messages, c.myReadAt, me.id]);

  const lastReadMineId = React.useMemo(() => {
    if (!c.partnerReadAt) return null;
    for (let i = c.messages.length - 1; i >= 0; i--) {
      const m = c.messages[i];
      if (m.sender_id === me.id && !m._local && m.created_at <= c.partnerReadAt) return m.id;
    }
    return null;
  }, [c.messages, c.partnerReadAt, me.id]);

  const onReply = React.useCallback((m: ChatMessage) => {
    setEditing(null);
    setReplyTo(m);
  }, []);
  const onActions = React.useCallback((m: ChatMessage) => setActionsFor(m), []);
  const onOpenMedia = React.useCallback((m: ChatMessage) => setLightbox(media.findIndex((x) => x.id === m.id)), [media]);
  const onReact = c.toggleReaction;

  const status = partnerTyping
    ? `${partner?.display_name ?? ""} tippt gerade…`
    : partnerOnline
      ? "online"
      : partner?.last_seen_at && partner.show_online
        ? `zuletzt online ${timeAgo(partner.last_seen_at)}`
        : "just us";

  return (
    <section aria-label={`Chat: ${conversation.title}`} className="relative flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <header className="glass relative z-20 flex items-center gap-2 border-b border-border px-2 pt-[calc(var(--safe-top)+0.4rem)] pb-2 sm:px-4 lg:pt-3">
        {showBack ? (
          <button onClick={() => router.push("/chat")} className="grid size-11 place-items-center rounded-full hover:bg-muted lg:hidden" aria-label="Zurück zur Übersicht">
            <ChevronLeft className="size-6" />
          </button>
        ) : null}
        <Avatar profile={partner} size="md" online={partnerOnline} />
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate font-medium">
            {conversation.is_default ? partner?.display_name ?? "just us" : conversation.title}{" "}
            {conversation.emoji ? <span aria-hidden>{conversation.emoji}</span> : null}
          </p>
          <p className={cn("truncate text-[12.5px]", partnerTyping ? "text-primary" : "text-muted-foreground")} aria-live="polite">
            {status}
          </p>
        </div>
        <button onClick={() => setSearchOpen((s) => !s)} className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Im Chat suchen" aria-expanded={searchOpen}>
          <Search className="size-5" />
        </button>
        {searchOpen ? (
          <ChatSearch
            conversationId={conversation.id}
            onClose={() => setSearchOpen(false)}
            onPick={(m) => {
              setSearchOpen(false);
              void jumpTo(m.id, m);
            }}
          />
        ) : null}
      </header>

      {/* Messages */}
      <div
        ref={scroller}
        data-lenis-prevent
        onScroll={(e) => {
          const el = e.currentTarget;
          const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          setAtBottom(bottom);
          if (bottom) setNewBelow(0);
        }}
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-3 sm:px-6"
      >
        <div ref={topSentinel} className="h-1" />
        {c.loadingOlder ? (
          <div className="flex justify-center py-3 text-muted-foreground">
            <Spinner />
          </div>
        ) : null}
        {c.loading ? (
          <div className="flex flex-col gap-3 py-6">
            {[60, 40, 70, 30, 55].map((w, i) => (
              <Skeleton key={i} className={cn("h-11 rounded-[1.2rem]", i % 2 ? "self-end" : "")} />
            ))}
          </div>
        ) : c.error ? (
          <ErrorState className="mt-10" message={c.error} onRetry={c.reload} />
        ) : c.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="relative">
              <Avatar profile={me} size="lg" ring />
              <Avatar profile={partner} size="lg" ring className="-ml-4" />
              <HeartGlyph className="absolute -top-2 left-1/2 size-6 -translate-x-1/2 animate-heartbeat text-primary" />
            </div>
            <p className="font-display text-4xl leading-none">hey love ♡</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Das ist der Anfang von {conversation.is_default ? "eurem Chat" : `„${conversation.title}“`}. Schreib {partner?.display_name ?? ""} die erste Nachricht.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col pt-2" aria-label="Nachrichten">
            {items.map((it) =>
              it.type === "day" ? (
                <li key={it.key} className="sticky top-2 z-10 my-3 flex justify-center">
                  <span className="glass rounded-full border border-border px-3 py-1 text-[11.5px] font-medium text-muted-foreground shadow-sm">{it.label}</span>
                </li>
              ) : it.type === "unread" ? (
                <li key={it.key} className="my-3 flex items-center gap-3 text-[11.5px] font-medium text-primary">
                  <span className="h-px flex-1 bg-primary/30" /> neue Nachrichten <span className="h-px flex-1 bg-primary/30" />
                </li>
              ) : (
                <li key={it.key}>
                  <MessageBubble
                    m={it.m}
                    mine={it.m.sender_id === me.id}
                    first={it.first}
                    last={it.last}
                    reactions={c.reactions[it.m.id] ?? []}
                    replyTo={it.m.reply_to_id ? (byId.get(it.m.reply_to_id) ?? null) : undefined}
                    read={!!c.partnerReadAt && it.m.created_at <= c.partnerReadAt}
                    showReadLabel={it.m.id === lastReadMineId}
                    highlighted={highlight === it.m.id}
                    onReply={onReply}
                    onActions={onActions}
                    onReact={onReact}
                    onOpenMedia={onOpenMedia}
                    onJumpTo={(id) => void jumpTo(id)}
                  />
                </li>
              ),
            )}
          </ol>
        )}
        <AnimatePresence>{partnerTyping ? <TypingBubble name={partner?.display_name ?? ""} /> : null}</AnimatePresence>
      </div>

      <AnimatePresence>
        {!atBottom && !c.loading ? (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => scrollToBottom(true)}
            className="absolute right-4 bottom-24 z-20 flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm shadow-lift"
            aria-label="Zu den neuesten Nachrichten"
          >
            {newBelow ? <span className="font-medium text-primary">{newBelow} neu</span> : null}
            <ArrowDown className="size-4" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <Composer
        conversationId={conversation.id}
        replyTo={replyTo}
        editing={editing}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
        onSendText={c.sendText}
        onSendFile={c.sendFile}
        onEdit={c.editMessage}
      />

      {/* Message actions */}
      <Dialog open={!!actionsFor} onOpenChange={(o) => !o && setActionsFor(null)}>
        <DialogContent variant="center" className="sm:w-[22rem]" hideClose>
          <DialogTitle className="sr-only">Nachricht</DialogTitle>
          <DialogBody className="pt-4">
            {actionsFor ? (
              <>
                <p className="mb-3 line-clamp-3 rounded-2xl bg-muted px-4 py-3 text-sm">{previewText(actionsFor)}</p>
                <div className="mb-3 flex justify-between gap-1 rounded-full border border-border bg-background p-1.5" role="group" aria-label="Reaktion">
                  {REACTION_EMOJIS.map((e) => {
                    const active = (c.reactions[actionsFor.id] ?? []).some((r) => r.user_id === me.id && r.emoji === e);
                    return (
                      <motion.button
                        key={e}
                        whileTap={{ scale: 1.4 }}
                        onClick={() => {
                          void c.toggleReaction(actionsFor, e);
                          setActionsFor(null);
                        }}
                        className={cn("grid size-10 place-items-center rounded-full text-xl transition-colors hover:bg-muted", active && "bg-primary-soft")}
                        aria-label={`Mit ${e} reagieren`}
                        aria-pressed={active}
                      >
                        {e}
                      </motion.button>
                    );
                  })}
                </div>
                <ul className="overflow-hidden rounded-2xl border border-border">
                  <ActionItem icon={<CornerUpLeft />} label="Antworten" onClick={() => { onReply(actionsFor); setActionsFor(null); }} />
                  {actionsFor.body ? (
                    <ActionItem
                      icon={<Copy />}
                      label="Kopieren"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(actionsFor.body ?? "");
                        toast.success("Kopiert");
                        setActionsFor(null);
                      }}
                    />
                  ) : null}
                  {actionsFor.sender_id === me.id && actionsFor.kind === "text" ? (
                    <ActionItem icon={<Pencil />} label="Bearbeiten" onClick={() => { setReplyTo(null); setEditing(actionsFor); setActionsFor(null); }} />
                  ) : null}
                  {actionsFor.sender_id === me.id ? (
                    <ActionItem
                      icon={<Trash2 />}
                      label="Löschen"
                      danger
                      onClick={() => {
                        void c.deleteMessage(actionsFor);
                        setActionsFor(null);
                      }}
                    />
                  ) : null}
                </ul>
                <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
                  {nameOf(actionsFor.sender_id)} · {relativeDay(actionsFor.created_at)}, {formatTime(actionsFor.created_at)}
                </p>
              </>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Lightbox items={lightboxItems} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}

function ActionItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <li className="border-b border-border last:border-0">
      <button onClick={onClick} className={cn("flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] hover:bg-muted [&_svg]:size-[18px]", danger && "text-danger")}>
        {icon}
        {label}
      </button>
    </li>
  );
}
