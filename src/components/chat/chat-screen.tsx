"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCirclePlus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/shared/avatar";
import { HeartGlyph } from "@/components/shared/heart";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { cn } from "@/lib/utils";
import { formatTime, relativeDay } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Conversation, Message } from "@/types/app";
import { ConversationView } from "./conversation-view";
import { previewText } from "./types";

type ConvWithLast = Conversation & { last?: Message | null };

function useConversations() {
  const { supabase } = useApp();
  const q = useQuery(async () => {
    const convs = must(await supabase.from("conversations").select("*").order("is_default", { ascending: false }).order("last_message_at", { ascending: false, nullsFirst: false }));
    const lasts = await Promise.all(
      convs.map((c) => supabase.from("messages").select("*").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle()),
    );
    return convs.map((c, i) => ({ ...c, last: lasts[i].data })) as ConvWithLast[];
  }, []);
  useRealtimeRefetch(["conversations", "messages"], q.refetch, "chat-list");
  return q;
}

function NewConversationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { supabase, me } = useApp();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim().slice(0, 60);
            const emoji = String(fd.get("emoji") ?? "").trim().slice(0, 8) || null;
            if (!title) return;
            setPending(true);
            const { data, error } = await supabase.from("conversations").insert({ title, emoji, created_by: me.id }).select().single();
            setPending(false);
            if (error) return toast.error(errorMessage(error));
            onOpenChange(false);
            router.push(`/chat/${data.id}`);
          }}
        >
          <DialogHeader>
            <DialogTitle>new little chat</DialogTitle>
            <DialogDescription>Ein eigener Thread, z. B. für Reisepläne, Geschenkideen oder Filmabende.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Titel" htmlFor="conv-title">
              <Input id="conv-title" name="title" required maxLength={60} placeholder="our next trip" />
            </Field>
            <Field label="Emoji (optional)" htmlFor="conv-emoji">
              <Input id="conv-emoji" name="emoji" maxLength={8} placeholder="✈️" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={pending}>Erstellen</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { supabase, nameOf } = useApp();
  const [q, setQ] = React.useState("");
  const [found, setResults] = React.useState<Message[] | null>(null);
  const results = q.trim().length < 2 ? null : found;
  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = window.setTimeout(async () => {
      const escaped = term.replace(/[%_\\]/g, (c) => `\\${c}`);
      const { data } = await supabase.from("messages").select("*").is("deleted_at", null).ilike("body", `%${escaped}%`).order("created_at", { ascending: false }).limit(40);
      setResults(data ?? []);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, supabase]);
  return (
    <div className="px-3 pb-2">
      <div className="flex items-center gap-2">
        <label htmlFor="global-search" className="sr-only">Alle Chats durchsuchen</label>
        <Input id="global-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Alle Nachrichten durchsuchen…" className="h-10" />
        <button onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted" aria-label="Suche schließen">
          <X className="size-4" />
        </button>
      </div>
      {results ? (
        <ul className="mt-2 grid gap-1">
          {results.length === 0 ? <li className="px-2 py-3 text-sm text-muted-foreground">Nichts gefunden.</li> : null}
          {results.map((m) => (
            <li key={m.id}>
              <Link href={`/chat/${m.conversation_id}?m=${m.id}`} className="block rounded-xl px-3 py-2 hover:bg-muted" onClick={onClose}>
                <span className="block text-xs text-muted-foreground">{nameOf(m.sender_id)} · {relativeDay(m.created_at)}</span>
                <span className="line-clamp-2 text-sm">{m.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ConversationList({ activeId, conversations, loading, error, onRetry }: { activeId: string | null; conversations: ConvWithLast[] | undefined; loading: boolean; error: string | null; onRetry: () => void }) {
  const { me, partner, partnerOnline, unread, typing } = useApp();
  const [newOpen, setNewOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-[calc(var(--safe-top)+1rem)] pb-3 lg:pt-6">
        <p className="eyebrow">hey {me.display_name} ♡</p>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="font-display text-5xl leading-none">miss you</h1>
          <div className="flex gap-1">
            <button onClick={() => setSearching((s) => !s)} className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Nachrichten suchen">
              <Search className="size-5" />
            </button>
            <button onClick={() => setNewOpen(true)} className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Neuer Chat">
              <MessageCirclePlus className="size-5" />
            </button>
          </div>
        </div>
      </div>
      {searching ? <GlobalSearch onClose={() => setSearching(false)} /> : null}

      <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-primary-soft/70 px-3 py-2.5">
        <Avatar profile={partner} size="md" online={partnerOnline} />
        <p className="text-[13px] leading-tight text-primary-soft-foreground">
          {partnerOnline ? <><strong>{partner?.display_name}</strong> ist gerade online ♡</> : <>{partner?.display_name ?? "…"} ist gerade nicht da, aber freut sich bestimmt über eine Nachricht.</>}
        </p>
      </div>

      <nav aria-label="Chats" data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+1rem)] lg:pb-4">
        {loading ? (
          <div className="grid gap-2 px-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : (
          <ul className="grid gap-0.5">
            {conversations?.map((c) => {
              const count = unread[c.id] ?? 0;
              const isTyping = typing[c.id];
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors", active ? "bg-card shadow-soft ring-1 ring-border" : "hover:bg-muted/70")}
                  >
                    {c.is_default ? (
                      <Avatar profile={partner} size="lg" online={partnerOnline} />
                    ) : (
                      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-2xl">{c.emoji ?? "♡"}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate", count ? "font-semibold" : "font-medium")}>
                          {c.is_default ? (
                            <>
                              {partner?.display_name ?? "just us"} <HeartGlyph className="inline size-3 text-primary" />
                            </>
                          ) : (
                            c.title
                          )}
                        </span>
                        {c.last ? <span className="shrink-0 text-[11.5px] text-muted-foreground">{relativeDay(c.last.created_at) === "Heute" ? formatTime(c.last.created_at) : relativeDay(c.last.created_at)}</span> : null}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={cn("truncate text-[13.5px]", isTyping ? "text-primary" : count ? "text-foreground" : "text-muted-foreground")}>
                          {isTyping ? "tippt gerade…" : c.last ? `${c.last.sender_id === me.id ? "Du: " : ""}${previewText(c.last)}` : "Noch keine Nachrichten"}
                        </span>
                        {count ? <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{count}</span> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

export function ChatScreen({ conversationId }: { conversationId?: string }) {
  const { data, loading, error, refetch } = useConversations();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const shell = React.useRef<HTMLDivElement>(null);
  const activeId = conversationId ?? (isDesktop ? (data?.find((c) => c.is_default)?.id ?? null) : null);
  const active = data?.find((c) => c.id === activeId) ?? null;
  const mobileConversation = !!conversationId && !isDesktop;
  useVisualViewport(shell, mobileConversation);

  React.useEffect(() => {
    if (!mobileConversation) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [mobileConversation]);

  return (
    <div
      ref={shell}
      className={cn(
        "flex bg-background",
        mobileConversation ? "fixed inset-x-0 top-0 z-50 h-dvh" : "h-dvh lg:h-dvh",
      )}
    >
      <aside className={cn("min-h-0 w-full border-border lg:w-[21rem] lg:shrink-0 lg:border-r xl:w-[23rem]", conversationId ? "hidden lg:block" : "block")}>
        <ConversationList activeId={activeId} conversations={data} loading={loading} error={error} onRetry={refetch} />
      </aside>
      <div className={cn("min-h-0 min-w-0 flex-1", !conversationId && "hidden lg:block")}>
        {active ? (
          <ConversationView key={active.id} conversation={active} showBack={!!conversationId} />
        ) : loading ? (
          <div className="grid h-full place-items-center"><HeartGlyph className="size-7 animate-heartbeat text-primary" /></div>
        ) : conversationId && data ? (
          <div className="grid h-full place-items-center p-6 text-center text-muted-foreground">
            <div>
              <p className="font-display text-4xl text-foreground">chat not found</p>
              <Link href="/chat" className="mt-3 inline-block underline">Zur Übersicht</Link>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <p className="font-display text-3xl">pick a chat ♡</p>
          </div>
        )}
      </div>
    </div>
  );
}
