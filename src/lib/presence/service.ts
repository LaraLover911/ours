"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { TypedClient } from "@/lib/supabase/client";
import { freshChannel } from "@/lib/realtime";
import { collectDeviceInfo } from "./device-info";

/**
 * Presence engine.
 *
 * - Realtime Presence (one entry per DEVICE) says who is here right now. The
 *   server drops an entry by itself when a socket goes silent, so "offline" is
 *   timeout based and never depends on beforeunload.
 * - A database heartbeat (server timestamps) keeps "last seen" and the device
 *   list fresh, and lets a device learn that it was signed out remotely.
 * - Visibility, focus, Page Lifecycle (freeze/resume) and user input decide
 *   between active, idle and away.
 */

export type ActivityKind = "chat" | "call" | "game" | "listen";
export type DeviceState = "active" | "idle" | "away";

export type DevicePresence = {
  user_id: string;
  device_id: string;
  device_type: string;
  state: DeviceState;
  focused: boolean;
  activity: ActivityKind | null;
  place: string | null;
  since: number;
};

export type PresenceSnapshot = {
  connection: "connecting" | "connected" | "offline";
  devices: DevicePresence[];
  lastSync: number | null;
  /** server time minus local time, from the last heartbeat */
  clockOffset: number;
};

const IDLE_AFTER = 2 * 60_000;
const BEAT_VISIBLE = 25_000;
const BEAT_HIDDEN = 60_000;

type Options = {
  supabase: TypedClient;
  meId: string;
  deviceId: string;
  /** called when this device was signed out from another device */
  onEnded: () => void;
};

export class PresenceService {
  private o: Options;
  private snap: PresenceSnapshot = { connection: "connecting", devices: [], lastSync: null, clockOffset: 0 };
  private listeners = new Set<() => void>();
  private broadcastHandlers = new Map<string, Set<(payload: unknown) => void>>();
  private ch: RealtimeChannel | null = null;
  private chSince = 0;
  private running = false;
  private visible = true;
  private focused = true;
  private frozen = false;
  private lastInput = Date.now();
  private activities: ActivityKind[] = [];
  private place: string | null = null;
  private shareOnline = true;
  private shareActivity = true;
  private deviceType = "unknown";
  private tracked = "";
  private trackTimer: number | undefined;
  private tickTimer: number | undefined;
  private beatTimer: number | undefined;
  private lastBeat = 0;
  private beating = false;

  constructor(o: Options) {
    this.o = o;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private set(patch: Partial<PresenceSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ------------------------------------------------------------ lifecycle
  start() {
    if (this.running) return;
    this.running = true;
    this.visible = document.visibilityState === "visible";
    this.focused = document.hasFocus();
    void this.connect();
    const opts = { passive: true } as const;
    for (const ev of ["pointerdown", "keydown", "touchstart", "wheel", "scroll"]) window.addEventListener(ev, this.onInput, opts);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pageshow", this.onResume);
    document.addEventListener("resume", this.onResume);
    document.addEventListener("freeze", this.onFreeze);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    this.tickTimer = window.setInterval(() => this.tick(), 5000);
    void this.beat();
  }

  stop() {
    this.running = false;
    for (const ev of ["pointerdown", "keydown", "touchstart", "wheel", "scroll"]) window.removeEventListener(ev, this.onInput);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pageshow", this.onResume);
    document.removeEventListener("resume", this.onResume);
    document.removeEventListener("freeze", this.onFreeze);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    window.clearInterval(this.tickTimer);
    window.clearTimeout(this.beatTimer);
    window.clearTimeout(this.trackTimer);
    const ch = this.ch;
    this.ch = null;
    if (ch) void this.o.supabase.removeChannel(ch);
  }

  // ------------------------------------------------------------ inputs
  private onInput = () => {
    const wasIdle = this.myState() === "idle";
    this.lastInput = Date.now();
    if (wasIdle) this.scheduleTrack();
  };
  private onVisibility = () => {
    this.visible = document.visibilityState === "visible";
    if (this.visible) {
      this.lastInput = Date.now();
      this.ensureChannel("sichtbar");
      void this.beat();
    }
    this.scheduleTrack(0);
  };
  private onFocus = () => {
    this.focused = true;
    this.lastInput = Date.now();
    this.scheduleTrack();
  };
  private onBlur = () => {
    this.focused = false;
    this.scheduleTrack();
  };
  private onFreeze = () => {
    this.frozen = true;
  };
  private onResume = () => {
    this.frozen = false;
    this.visible = document.visibilityState === "visible";
    this.ensureChannel("fortgesetzt");
    void this.beat();
    this.scheduleTrack(0);
  };
  private onOnline = () => {
    this.ensureChannel("online");
    void this.beat();
  };
  private onOffline = () => {
    this.set({ connection: "offline" });
  };

  setActivity(kind: ActivityKind, on: boolean) {
    if (on) this.activities.push(kind);
    else {
      const i = this.activities.lastIndexOf(kind);
      if (i >= 0) this.activities.splice(i, 1);
    }
    this.scheduleTrack(0);
  }
  setPlace(place: string | null) {
    this.place = place;
    this.scheduleTrack();
  }
  setSharing(online: boolean, activity: boolean) {
    if (online === this.shareOnline && activity === this.shareActivity) return;
    this.shareOnline = online;
    this.shareActivity = activity;
    this.tracked = "";
    this.scheduleTrack(0);
  }

  // ------------------------------------------------------------ broadcast (typing etc.)
  onBroadcast(event: string, fn: (payload: unknown) => void) {
    let set = this.broadcastHandlers.get(event);
    if (!set) this.broadcastHandlers.set(event, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  broadcast(event: string, payload: unknown) {
    if (this.snap.connection !== "connected") return;
    this.ch?.send({ type: "broadcast", event, payload }).catch(() => {});
  }

  // ------------------------------------------------------------ state
  private myState(): DeviceState {
    if (!this.visible || this.frozen) return "away";
    if (Date.now() - this.lastInput > IDLE_AFTER) return "idle";
    return "active";
  }

  private meta(): DevicePresence {
    const priority: ActivityKind[] = ["call", "listen", "game", "chat"];
    const activity = this.shareActivity ? (priority.find((k) => this.activities.includes(k)) ?? null) : null;
    return {
      user_id: this.o.meId,
      device_id: this.o.deviceId,
      device_type: this.deviceType,
      state: this.myState(),
      focused: this.visible && this.focused,
      activity,
      place: this.shareActivity ? this.place : null,
      since: Date.now(),
    };
  }

  private tick() {
    if (!this.running) return;
    // idle detection + watchdog
    this.scheduleTrack();
    this.ensureChannel();
    const interval = this.visible ? BEAT_VISIBLE : BEAT_HIDDEN;
    if (Date.now() - this.lastBeat > interval) void this.beat();
  }

  private scheduleTrack(delay = 400) {
    window.clearTimeout(this.trackTimer);
    this.trackTimer = window.setTimeout(() => void this.track(), delay);
  }

  private async track() {
    const ch = this.ch;
    if (!ch || this.snap.connection !== "connected") return;
    if (!this.shareOnline) {
      if (this.tracked !== "off") {
        this.tracked = "off";
        await ch.untrack().catch(() => {});
      }
      return;
    }
    const m = this.meta();
    const key = JSON.stringify({ ...m, since: 0 });
    if (key === this.tracked) return;
    this.tracked = key;
    await ch.track(m).catch(() => {
      this.tracked = "";
    });
  }

  // ------------------------------------------------------------ channel
  private ensureChannel(why?: string) {
    if (!this.running) return;
    if (this.snap.connection === "connected" && why !== "online") return;
    if (this.snap.connection !== "connected" && Date.now() - this.chSince > 10_000) this.reconnect(why ?? "Watchdog");
  }

  private reconnect(why: string) {
    if (process.env.NODE_ENV === "development") console.debug("[presence] reconnect", why);
    const old = this.ch;
    this.ch = null;
    if (old) void this.o.supabase.removeChannel(old);
    void this.connect();
  }

  private async connect() {
    if (!this.running) return;
    this.chSince = Date.now();
    this.set({ connection: "connecting" });
    try {
      await this.o.supabase.realtime.setAuth();
    } catch {
      /* retried by the watchdog */
    }
    if (!this.running) return;
    const ch = await freshChannel(this.o.supabase, "ours:presence", { config: { private: true, presence: { key: this.o.deviceId } } });
    if (!this.running) {
      void this.o.supabase.removeChannel(ch);
      return;
    }
    this.ch = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<DevicePresence>();
      const devices: DevicePresence[] = [];
      for (const metas of Object.values(state)) for (const m of metas) if (m.user_id && m.device_id) devices.push(m);
      this.set({ devices });
    });
    ch.on("broadcast", { event: "*" }, ({ event, payload }) => {
      this.broadcastHandlers.get(event)?.forEach((fn) => fn(payload));
    });
    ch.subscribe((status) => {
      if (this.ch !== ch) return;
      if (status === "SUBSCRIBED") {
        this.set({ connection: "connected" });
        this.tracked = "";
        void this.track();
      } else {
        this.set({ connection: navigator.onLine ? "connecting" : "offline" });
        if (status === "CLOSED" && this.running) this.reconnect("geschlossen");
      }
    });
  }

  // ------------------------------------------------------------ heartbeat
  async beat() {
    if (!this.running || this.beating) return;
    this.beating = true;
    this.lastBeat = Date.now();
    try {
      const info = await collectDeviceInfo(this.o.deviceId);
      if (this.deviceType !== info.device_type) {
        this.deviceType = info.device_type;
        this.scheduleTrack(0);
      }
      const t0 = Date.now();
      const { data, error } = await this.o.supabase.rpc("device_heartbeat", { info });
      if (error || !data) return;
      const res = data as { ended?: boolean; server_time?: string };
      if (res.ended) {
        this.o.onEnded();
        return;
      }
      const serverTime = res.server_time ? new Date(res.server_time).getTime() : null;
      const local = (t0 + Date.now()) / 2;
      this.set({ lastSync: Date.now(), clockOffset: serverTime ? serverTime - local : this.snap.clockOffset });
    } catch {
      /* next tick retries */
    } finally {
      this.beating = false;
    }
  }
}

// ------------------------------------------------------------ derived partner state
export type PartnerPresence = {
  online: boolean;
  state: "online" | "idle" | "away" | "offline";
  focused: boolean;
  activity: ActivityKind | null;
  place: string | null;
  devices: number;
};

export function summarize(devices: DevicePresence[], userId: string | null | undefined): PartnerPresence {
  const mine = userId ? devices.filter((d) => d.user_id === userId) : [];
  if (!mine.length) return { online: false, state: "offline", focused: false, activity: null, place: null, devices: 0 };
  const active = mine.filter((d) => d.state === "active");
  const idle = mine.filter((d) => d.state === "idle");
  const best = active[0] ?? idle[0] ?? mine[0];
  const priority: ActivityKind[] = ["call", "listen", "game", "chat"];
  const activity = priority.find((k) => mine.some((d) => d.activity === k)) ?? null;
  return {
    online: true,
    state: active.length ? "online" : idle.length ? "idle" : "away",
    focused: mine.some((d) => d.focused),
    activity,
    place: best.place,
    devices: new Set(mine.map((d) => d.device_id)).size,
  };
}
