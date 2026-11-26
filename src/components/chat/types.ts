import type { Message, MessageMeta } from "@/types/app";

export type ChatMessage = Message & {
  _local?: { status: "sending" | "failed"; previewUrl?: string; file?: File | Blob; retry?: () => void };
};

export function metaOf(m: Message): MessageMeta {
  return (m.attachment_meta ?? {}) as MessageMeta;
}

export function previewText(m: Pick<Message, "kind" | "body" | "deleted_at">) {
  if (m.deleted_at) return "Nachricht gelöscht";
  if (m.kind === "text") return m.body ?? "";
  if (m.kind === "audio") return "🎙️ Sprachnachricht";
  if (m.kind === "snap") return "📸 Snap";
  if (m.kind === "video") return m.body ? `🎬 ${m.body}` : "🎬 Video";
  return m.body ? `📷 ${m.body}` : "📷 Foto";
}
