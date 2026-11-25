"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, Mic, Paperclip, Pencil, Trash2, X, CornerUpLeft } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { useHeartBurst } from "@/components/animations/heart-burst";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/utils/errors";
import { MAX_UPLOAD_BYTES, mediaKind } from "@/lib/supabase/media";
import { previewText, type ChatMessage } from "./types";
import { formatDuration, useVoiceRecorder } from "./voice";

export function Composer({
  conversationId,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSendText,
  onSendFile,
  onEdit,
}: {
  conversationId: string;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSendText: (text: string, replyToId: string | null) => Promise<void>;
  onSendFile: (file: File | Blob, opts: { replyToId: string | null; voice?: { duration: number; waveform: number[] } }) => Promise<void>;
  onEdit: (id: string, text: string) => Promise<void>;
}) {
  const { sendTyping, nameOf, partner } = useApp();
  const [text, setText] = React.useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(`ours-draft-${conversationId}`) ?? "";
    } catch {
      return "";
    }
  });
  // When a message is picked for editing, load its text (derived during render, no effect).
  const [editingId, setEditingId] = React.useState<string | null>(null);
  if ((editing?.id ?? null) !== editingId) {
    setEditingId(editing?.id ?? null);
    if (editing) setText(editing.body ?? "");
  }
  const ta = React.useRef<HTMLTextAreaElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const sendBtn = React.useRef<HTMLButtonElement>(null);
  const typingTimer = React.useRef<number | undefined>(undefined);
  const lastTypingSent = React.useRef(0);
  const voice = useVoiceRecorder();
  const { fire, node: hearts } = useHeartBurst();
  const draftKey = `ours-draft-${conversationId}`;

  React.useEffect(() => {
    if (editing) requestAnimationFrame(() => ta.current?.focus());
  }, [editing]);

  React.useEffect(() => {
    if (replyTo) ta.current?.focus();
  }, [replyTo]);

  // Auto-grow.
  React.useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const stopTyping = React.useCallback(() => {
    window.clearTimeout(typingTimer.current);
    if (lastTypingSent.current) {
      sendTyping(conversationId, false);
      lastTypingSent.current = 0;
    }
  }, [conversationId, sendTyping]);

  React.useEffect(() => stopTyping, [stopTyping]);

  const onChange = (v: string) => {
    setText(v);
    if (!editing) {
      try {
        if (v) localStorage.setItem(draftKey, v);
        else localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
    }
    if (!v) return stopTyping();
    const now = Date.now();
    if (now - lastTypingSent.current > 2500) {
      sendTyping(conversationId, true);
      lastTypingSent.current = now;
    }
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(stopTyping, 3500);
  };

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    if (editing) {
      await onEdit(editing.id, value);
      onCancelEdit();
      setText("");
      return;
    }
    const rect = sendBtn.current?.getBoundingClientRect();
    if (rect) fire(rect.left + rect.width / 2, rect.top);
    setText("");
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    stopTyping();
    const replyId = replyTo?.id ?? null;
    onCancelReply();
    await onSendText(value, replyId);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const replyId = replyTo?.id ?? null;
    onCancelReply();
    for (const file of Array.from(files).slice(0, 10)) {
      const kind = mediaKind(file.type);
      if (kind !== "image" && kind !== "video") {
        toast.error(`${file.name}: nur Fotos und Videos.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES && kind === "video") {
        toast.error(`${file.name} ist größer als 50 MB.`);
        continue;
      }
      void onSendFile(file, { replyToId: replyId });
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const startVoice = async () => {
    try {
      await voice.start();
    } catch (err) {
      toast.error(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Bitte erlaube den Zugriff aufs Mikrofon."
          : errorMessage(err),
      );
    }
  };

  const sendVoice = async () => {
    const rect = sendBtn.current?.getBoundingClientRect();
    const result = await voice.stop();
    if (!result) return;
    if (rect) fire(rect.left + rect.width / 2, rect.top);
    const replyId = replyTo?.id ?? null;
    onCancelReply();
    await onSendFile(result.blob, { replyToId: replyId, voice: { duration: result.duration, waveform: result.waveform } });
  };

  const isDesktop = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const recording = voice.state === "recording";
  const context = editing ?? replyTo;

  return (
    <div className="glass relative border-t border-border px-3 pt-2 pb-[max(var(--safe-bottom),0.6rem)] sm:px-4">
      {hearts}
      <AnimatePresence initial={false}>
        {context ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-3 rounded-xl border-l-[3px] border-primary bg-primary-soft/60 py-1.5 pr-1 pl-3">
              {editing ? <Pencil className="size-4 shrink-0 text-primary" /> : <CornerUpLeft className="size-4 shrink-0 text-primary" />}
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="font-medium text-primary-soft-foreground">{editing ? "Nachricht bearbeiten" : `Antwort an ${nameOf(context.sender_id)}`}</p>
                <p className="truncate text-muted-foreground">{previewText(context)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (editing) {
                    onCancelEdit();
                    setText("");
                  } else onCancelReply();
                }}
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-card"
                aria-label="Abbrechen"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {recording ? (
        <div className="flex h-12 items-center gap-3">
          <button type="button" onClick={voice.cancel} className="grid size-11 place-items-center rounded-full text-danger hover:bg-danger/10" aria-label="Aufnahme verwerfen">
            <Trash2 className="size-5" />
          </button>
          <div className="flex flex-1 items-center gap-3 rounded-full bg-muted px-4 py-2.5">
            <span className="size-2.5 animate-pulse rounded-full bg-danger" />
            <span className="text-sm tabular-nums">{formatDuration(voice.elapsed)}</span>
            <span className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className="w-[3px] rounded-full bg-primary/70 transition-[height] duration-100" style={{ height: `${15 + Math.min(85, voice.level * 160 * (0.5 + ((i * 7) % 5) / 8))}%` }} />
              ))}
            </span>
          </div>
          <button ref={sendBtn} type="button" onClick={sendVoice} className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft active:scale-90" aria-label="Sprachnachricht senden">
            <ArrowUp className="size-5" />
          </button>
        </div>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {!editing ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/mp4,video/quicktime,video/webm"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => onFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Foto oder Video senden"
              >
                <Paperclip className="size-5" />
              </button>
            </>
          ) : null}
          <label htmlFor={`composer-${conversationId}`} className="sr-only">Nachricht</label>
          <textarea
            id={`composer-${conversationId}`}
            ref={ta}
            rows={1}
            value={text}
            maxLength={4000}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && isDesktop && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
              if (e.key === "Escape") {
                if (editing) {
                  onCancelEdit();
                  setText("");
                } else onCancelReply();
              }
            }}
            onPaste={(e) => {
              const files = e.clipboardData.files;
              if (files.length && !editing) {
                e.preventDefault();
                void onFiles(files);
              }
            }}
            placeholder={`Nachricht an ${partner?.display_name ?? "dich"}…`}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-[1.4rem] border border-input bg-card px-4 py-[0.6rem] text-[16px] leading-snug outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-ring"
            enterKeyHint={isDesktop ? "send" : "enter"}
          />
          {text.trim() || editing || !voice.supported ? (
            <button
              ref={sendBtn}
              type="submit"
              disabled={!text.trim()}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft transition-transform active:scale-90 disabled:opacity-40",
              )}
              aria-label={editing ? "Änderung speichern" : "Senden"}
            >
              {editing ? <Check className="size-5" /> : <ArrowUp className="size-5" />}
            </button>
          ) : (
            <button
              ref={sendBtn}
              type="button"
              onClick={startVoice}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary transition-transform active:scale-90"
              aria-label="Sprachnachricht aufnehmen"
            >
              <Mic className="size-5" />
            </button>
          )}
        </form>
      )}
    </div>
  );
}
