/**
 * Listen Together clock. The room stores the playback position at a server
 * timestamp; every device derives "where we should be now" from it and the
 * measured server clock offset, then nudges its own player towards that.
 */
export type RoomClock = { status: string; base_pos_ms: number; base_at: string };

export const SEEK_THRESHOLD_MS = 900;

/** Target position in ms for the room at local time `nowMs` (offset = server − local). */
export function targetPosition(room: RoomClock, nowMs: number, offsetMs: number, durationMs?: number | null): number {
  const serverNow = nowMs + offsetMs;
  const pos = room.status === "playing" ? room.base_pos_ms + (serverNow - new Date(room.base_at).getTime()) : room.base_pos_ms;
  return Math.max(0, durationMs ? Math.min(pos, durationMs) : pos);
}

export type SyncAction = { type: "play" } | { type: "pause" } | { type: "seek"; ms: number } | { type: "ended" };

/**
 * What to do so the local player matches the room. `playing` is whether the local
 * player is playing right now; `position` its real position (null if unknown).
 */
export function decide(input: {
  room: RoomClock;
  target: number;
  position: number | null;
  playing: boolean;
  durationMs: number | null;
}): SyncAction[] {
  const { room, target, position, playing, durationMs } = input;
  const out: SyncAction[] = [];
  if (room.status === "playing") {
    if (durationMs && target >= durationMs - 250) return [{ type: "ended" }];
    if (position == null || Math.abs(position - target) > SEEK_THRESHOLD_MS) out.push({ type: "seek", ms: target });
    if (!playing) out.push({ type: "play" });
  } else {
    if (playing) out.push({ type: "pause" });
    if (position != null && Math.abs(position - target) > SEEK_THRESHOLD_MS) out.push({ type: "seek", ms: target });
  }
  return out;
}
