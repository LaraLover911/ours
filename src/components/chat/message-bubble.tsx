"use client";

/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { motion, type PanInfo } from "motion/react";
import { AlertCircle, Check, CheckCheck, Clock, CornerUpLeft, MoreHorizontal, Play, SmilePlus } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/shared/avatar";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils/dates";
import type { Reaction } from "@/types/app";
import { metaOf, previewText, type ChatMessage } from "./types";
import { VoicePlayer } from "./voice";
import { SnapBubble } from "./snap";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline decoration-current/40 underline-offset-2 break-all">
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

function MediaThumb({ m, onOpen }: { m: ChatMessage; onOpen: () => void }) {
  const signed = useSignedUrl(m._local ? null : m.attachment_path);
  const url = m._local?.previewUrl ?? signed;
  const meta = metaOf(m);
  const ratio = meta.width && meta.height ? Math.min(1.6, Math.max(0.6, meta.width / meta.height)) : m.kind === "video" ? 16 / 9 : 4 / 5;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!!m._local}
      className="relative block w-[15rem] max-w-full overflow-hidden rounded-[1.1rem] bg-muted sm:w-[18rem]"
      style={{ aspectRatio: ratio }}
      aria-label={m.kind === "video" ? "Video öffnen" : "Foto öffnen"}
    >
      {url ? (
        m.kind === "video" ? (
          <video src={url} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
        ) : (
          <img src={url} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        )
      ) : (
        <span className="skeleton absolute inset-0" />
      )}
      {m.kind === "video" ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
      ) : null}
      {m._local?.status === "sending" ? (
        <span className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="size-8 animate-spin rounded-full border-2 border-white border-r-transparent" />
        </span>
      ) : null}
    </button>
  );
}

export function ReactionPills({ reactions, onToggle, mine }: { reactions: Reaction[]; onToggle: (emoji: string) => void; mine: boolean }) {
  const { me } = useApp();
  if (!reactions.length) return null;
  const grouped = reactions.reduce<Record<string, Reaction[]>>((acc, r) => ((acc[r.emoji] ??= []).push(r), acc), {});
  return (
    <div className={cn("relative z-10 -mt-2 flex flex-wrap gap-1", mine ? "justify-end pr-2" : "pl-2")}>
      {Object.entries(grouped).map(([emoji, list]) => {
        const reacted = list.some((r) => r.user_id === me.id);
        return (
          <motion.button
            key={emoji}
            layout
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 20 }}
            onClick={() => onToggle(emoji)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-full border px-1.5 text-[13px] shadow-sm",
              reacted ? "border-primary/40 bg-primary-soft" : "border-border bg-card",
            )}
            aria-label={`${emoji} ${list.length}`}
          >
            <span>{emoji}</span>
            {list.length > 1 ? <span className="text-[11px] text-muted-foreground">{list.length}</span> : null}
          </motion.button>
        );
      })}
    </div>
  );
}

export const MessageBubble = React.memo(function MessageBubble({
  m,
  mine,
  first,
  last,
  reactions,
  replyTo,
  read,
  showReadLabel,
  highlighted,
  onReply,
  onActions,
  onReact,
  onOpenMedia,
  onOpenSnap,
  onJumpTo,
}: {
  m: ChatMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  reactions: Reaction[];
  replyTo: ChatMessage | null | undefined;
  read: boolean;
  showReadLabel: boolean;
  highlighted: boolean;
  onReply: (m: ChatMessage) => void;
  onActions: (m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onOpenMedia: (m: ChatMessage) => void;
  onOpenSnap?: (m: ChatMessage) => void;
  onJumpTo: (id: string) => void;
}) {
  const { profiles, nameOf } = useApp();
  const sender = profiles[m.sender_id];
  const meta = metaOf(m);
  const deleted = !!m.deleted_at;
  const pressTimer = React.useRef<number | undefined>(undefined);

  const startPress = () => {
    if (deleted || m._local) return;
    pressTimer.current = window.setTimeout(() => {
      navigator.vibrate?.(12);
      onActions(m);
    }, 450);
  };
  const endPress = () => window.clearTimeout(pressTimer.current);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 56 && !deleted && !m._local) {
      navigator.vibrate?.(8);
      onReply(m);
    }
  };

  const bubbleShape = mine
    ? cn("rounded-[1.25rem]", !first && "rounded-tr-md", !last && "rounded-br-md", last && "rounded-br-[0.4rem]")
    : cn("rounded-[1.25rem]", !first && "rounded-tl-md", !last && "rounded-bl-md", last && "rounded-bl-[0.4rem]");

  const isMedia = (m.kind === "image" || m.kind === "video") && !deleted;

  return (
    <div id={`m-${m.id}`} data-message-id={m.id} className={cn("group/msg flex w-full items-end gap-2", mine ? "justify-end" : "justify-start", first ? "mt-3" : "mt-0.5")}>
      {!mine ? <div className="w-8 shrink-0">{last ? <Avatar profile={sender} size="sm" /> : null}</div> : null}

      <div className={cn("flex max-w-[82%] flex-col sm:max-w-[68%]", mine ? "items-end" : "items-start")}>
        <div className={cn("flex items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
          <motion.div
            drag={deleted || m._local ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.35 }}
            dragSnapToOrigin
            onDragEnd={onDragEnd}
            initial={m._local ? { opacity: 0, y: 10, scale: 0.96 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            onPointerCancel={endPress}
            onContextMenu={(e) => {
              if (deleted || m._local) return;
              e.preventDefault();
              onActions(m);
            }}
            onDoubleClick={() => !deleted && !m._local && onReact(m, "❤️")}
            className={cn(
              "relative select-text [-webkit-touch-callout:none]",
              highlighted && "rounded-[1.3rem] ring-4 ring-primary/30",
            )}
          >
            {replyTo !== undefined && m.reply_to_id ? (
              <button
                type="button"
                onClick={() => replyTo && onJumpTo(replyTo.id)}
                className={cn(
                  "mb-[-0.6rem] block max-w-full rounded-[1rem] border border-border bg-muted/80 px-3 pt-1.5 pb-3 text-left text-[12.5px] text-muted-foreground",
                  mine ? "ml-auto" : "",
                )}
              >
                <span className="flex items-center gap-1 font-medium text-foreground/70">
                  <CornerUpLeft className="size-3" /> {replyTo ? nameOf(replyTo.sender_id) : "Nachricht"}
                </span>
                <span className="line-clamp-2">{replyTo ? previewText(replyTo) : "nicht geladen"}</span>
              </button>
            ) : null}

            {deleted ? (
              <div className={cn("border border-dashed border-border-strong px-3.5 py-2 text-[14px] text-muted-foreground italic", bubbleShape)}>
                Nachricht gelöscht
              </div>
            ) : m.kind === "snap" ? (
              <SnapBubble m={m} mine={mine} onOpen={(x) => onOpenSnap?.(x)} />
            ) : isMedia ? (
              <div className={cn("relative overflow-hidden", bubbleShape)}>
                <MediaThumb m={m} onOpen={() => onOpenMedia(m)} />
                {m.body ? (
                  <p className={cn("px-3.5 py-2 text-[15px] whitespace-pre-wrap", mine ? "bg-primary text-primary-foreground" : "bg-card")}>
                    <Linkified text={m.body} />
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                className={cn(
                  "relative px-3.5 py-2 text-[15.5px] leading-snug break-words whitespace-pre-wrap shadow-[0_1px_1px_rgb(0_0_0/0.04)]",
                  bubbleShape,
                  mine ? "bg-primary text-primary-foreground" : "border border-border bg-card text-card-foreground",
                )}
              >
                {m.kind === "audio" && m.attachment_path && !m._local ? (
                  <VoicePlayer path={m.attachment_path} duration={meta.duration} waveform={meta.waveform} mine={mine} />
                ) : m.kind === "audio" ? (
                  <span className="flex items-center gap-2 py-2 text-sm opacity-80">
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> Sprachnachricht wird gesendet…
                  </span>
                ) : (
                  <Linkified text={m.body ?? ""} />
                )}
              </div>
            )}
          </motion.div>

          {!deleted && !m._local ? (
            <div className="hidden shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 md:flex">
              <button type="button" onClick={() => onActions(m)} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Reagieren">
                <SmilePlus className="size-4" />
              </button>
              <button type="button" onClick={() => onReply(m)} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Antworten">
                <CornerUpLeft className="size-4" />
              </button>
              <button type="button" onClick={() => onActions(m)} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Mehr Aktionen">
                <MoreHorizontal className="size-4" />
              </button>
            </div>
          ) : null}
        </div>

        {!deleted ? <ReactionPills reactions={reactions} mine={mine} onToggle={(e) => onReact(m, e)} /> : null}

        {last || m._local ? (
          <p className={cn("mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground", mine ? "justify-end" : "")}>
            {m.edited_at && !deleted ? <span>bearbeitet ·</span> : null}
            <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
            {mine && !deleted ? (
              m._local?.status === "failed" ? (
                <button type="button" onClick={m._local.retry} className="flex items-center gap-1 text-danger">
                  <AlertCircle className="size-3" /> nicht gesendet · erneut
                </button>
              ) : m._local ? (
                <Clock className="size-3" aria-label="wird gesendet" />
              ) : read ? (
                <>
                  <CheckCheck className="size-3.5 text-primary" aria-label="gelesen" />
                  {showReadLabel ? <span>Gelesen</span> : null}
                </>
              ) : (
                <Check className="size-3.5" aria-label="gesendet" />
              )
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
});
