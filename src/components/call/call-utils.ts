import type { CallRow } from "@/types/app";

/** A call still "ringing" after two minutes was never answered (the caller's app went away). */
export function effectiveStatus(c: CallRow) {
  if ((c.status === "ringing" || c.status === "accepted") && Date.now() - new Date(c.created_at).getTime() > 120_000) {
    return c.status === "ringing" ? "missed" : "failed";
  }
  return c.status;
}

export function isMissedFor(c: CallRow, meId: string) {
  const s = effectiveStatus(c);
  return c.callee_id === meId && (s === "missed" || s === "cancelled");
}

export function callDuration(c: CallRow) {
  if (!c.connected_at || !c.ended_at) return null;
  const s = Math.max(0, Math.round((new Date(c.ended_at).getTime() - new Date(c.connected_at).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}
