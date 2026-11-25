"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { TypedClient } from "@/lib/supabase/client";
import { freshChannel } from "@/lib/realtime";
import { createRinger, type Ringer } from "./ringtone";

/**
 * 1:1 calls with WebRTC (peer-to-peer, encrypted with DTLS-SRTP).
 *
 * Signaling runs over ONE long-lived private Supabase Realtime broadcast channel
 * ("ours:call"). Every message carries the sending device, important messages are
 * acknowledged and re-sent until the other device confirms them, duplicates are
 * dropped. SDP negotiation follows the "perfect negotiation" pattern, so ICE
 * restarts (reconnects) and glare are handled without races.
 *
 * Every phase has a timeout: a call can never hang in "connecting".
 */

export type CallKind = "audio" | "video";
export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "reconnecting" | "ended";
export type MediaFlags = { mic: boolean; cam: boolean; screen: boolean };
type CandCount = { host: number; srflx: number; relay: number; prflx: number };

export type CallQuality = { label: string | null; rttMs: number | null; lossPct: number | null; level: "gut" | "okay" | "schwach" };

export type CallDebug = {
  signaling: string;
  connection: string;
  ice: string;
  gathering: string;
  signalingState: string;
  localCands: CandCount;
  remoteCands: CandCount;
  pair: string | null;
  turn: string;
  log: { t: number; msg: string }[];
};

export type CallSnapshot = {
  phase: CallPhase;
  kind: CallKind;
  callId: string | null;
  direction: "in" | "out" | null;
  /** The ring reached at least one of the partner's devices. */
  delivered: boolean;
  connectedAt: number | null;
  endedReason: string | null;
  error: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  facing: "user" | "environment";
  remoteMedia: MediaFlags;
  remoteVideoLive: boolean;
  quality: CallQuality | null;
  minimized: boolean;
  signalingReady: boolean;
  debug: CallDebug;
};

type MsgType = "ring" | "ringing" | "accept" | "decline" | "busy" | "cancel" | "hangup" | "desc" | "ice" | "media" | "ack";
type Msg = {
  v: 1;
  mid: string;
  t: MsgType;
  callId: string;
  from: string;
  dev: string;
  to?: string;
  rel?: boolean;
  kind?: CallKind;
  desc?: { type: RTCSdpType; sdp?: string };
  cands?: RTCIceCandidateInit[];
  media?: MediaFlags;
  reason?: string;
  ack?: string;
};
type OutMsg = Omit<Msg, "v" | "mid" | "from" | "dev" | "rel">;

const ZERO: CandCount = { host: 0, srflx: 0, relay: 0, prflx: 0 };
const DEBUG0: CallDebug = {
  signaling: "–",
  connection: "–",
  ice: "–",
  gathering: "–",
  signalingState: "–",
  localCands: ZERO,
  remoteCands: ZERO,
  pair: null,
  turn: "noch nicht geprüft",
  log: [],
};

export const IDLE_SNAPSHOT: CallSnapshot = {
  phase: "idle",
  kind: "audio",
  callId: null,
  direction: null,
  delivered: false,
  connectedAt: null,
  endedReason: null,
  error: null,
  localStream: null,
  remoteStream: null,
  micOn: true,
  camOn: false,
  screenOn: false,
  facing: "user",
  remoteMedia: { mic: true, cam: false, screen: false },
  remoteVideoLive: false,
  quality: null,
  minimized: false,
  signalingReady: false,
  debug: DEBUG0,
};

const ALLOWED: Record<CallPhase, CallPhase[]> = {
  idle: ["outgoing", "incoming"],
  outgoing: ["connecting", "incoming", "ended", "idle"],
  incoming: ["connecting", "ended", "idle"],
  connecting: ["active", "ended", "idle"],
  active: ["reconnecting", "ended", "idle"],
  reconnecting: ["active", "ended", "idle"],
  ended: ["idle", "outgoing", "incoming"],
};

const DEFAULT_STUN: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
type IceConfig = { servers: RTCIceServer[]; relay: string | null; error?: string; at: number };

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
const camera = (facing: "user" | "environment"): MediaTrackConstraints => ({
  facingMode: facing,
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 30 },
});

export function mediaError(err: unknown) {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Kamera/Mikrofon wurde nicht erlaubt. Du kannst es in den Browser-Einstellungen für diese Seite freigeben.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Keine Kamera bzw. kein Mikrofon gefunden.";
  if (name === "NotReadableError" || name === "AbortError") return "Kamera oder Mikrofon wird gerade von einer anderen App benutzt.";
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) return "Anrufe brauchen eine sichere Verbindung (https) und einen aktuellen Browser.";
  return "Kamera/Mikrofon konnte nicht gestartet werden.";
}

/** Ask the other side's encoder for full-band Opus (we only touch the received SDP). */
function tuneRemoteSdp(sdp: string | undefined) {
  if (!sdp) return sdp;
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
  if (!m) return sdp;
  const re = new RegExp(`a=fmtp:${m[1]} ([^\\r\\n]*)`);
  return sdp.replace(re, (_l, rest: string) => {
    const extra = ["maxaveragebitrate=128000", "useinbandfec=1", "stereo=0"].filter((p) => !rest.includes(p.split("=")[0]));
    return `a=fmtp:${m[1]} ${[rest, ...extra].filter(Boolean).join(";")}`;
  });
}

function candType(c: { candidate?: string; type?: string | null } | RTCIceCandidateInit): keyof CandCount | null {
  const t = ("type" in c && c.type) || c.candidate?.match(/ typ (\w+)/)?.[1];
  return t === "host" || t === "srflx" || t === "relay" || t === "prflx" ? t : null;
}

type Options = {
  supabase: TypedClient;
  meId: string;
  partnerId: string;
  deviceId: string;
  notice: (msg: string) => void;
};

export class CallEngine {
  private snap: CallSnapshot = IDLE_SNAPSHOT;
  private listeners = new Set<() => void>();
  private o: Options;

  // signaling
  private ch: RealtimeChannel | null = null;
  private chSince = 0;
  private running = false;
  private watchdog: number | undefined;
  private outbox = new Map<string, { msg: Msg; tries: number; next: number; created: number }>();
  private seen = new Map<string, number>();
  private pumpTimer: number | undefined;

  // call
  private token = 0;
  private pc: RTCPeerConnection | null = null;
  private polite = false;
  private makingOffer = false;
  private ignoreOffer = false;
  private pendingCands: RTCIceCandidateInit[] = [];
  private iceBatch: RTCIceCandidateInit[] = [];
  private iceTimer: number | undefined;
  private audioTx: RTCRtpTransceiver | null = null;
  private videoTx: RTCRtpTransceiver | null = null;
  private local: MediaStream | null = null;
  private camTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private remoteTracks: MediaStreamTrack[] = [];
  private peerDev: string | null = null;
  private ringer: Ringer | null = null;
  private ringLoop: number | undefined;
  private timers = new Map<string, number>();
  private endTimer: number | undefined;
  private statsTimer: number | undefined;
  private lastLoss = { lost: 0, recv: 0 };
  private wakeLock: { release: () => Promise<void> } | null = null;
  private ice: IceConfig | null = null;
  private restarts = 0;
  private db: PromiseLike<unknown> = Promise.resolve();

  private partnerName = "Dein Schatz";

  constructor(o: Options) {
    this.o = o;
  }

  setPartnerName(name: string) {
    this.partnerName = name;
  }

  // ---------------------------------------------------------------- store
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<CallSnapshot>) {
    if (patch.phase && patch.phase !== this.snap.phase && !ALLOWED[this.snap.phase].includes(patch.phase)) {
      this.log(`Ungültiger Übergang ${this.snap.phase} → ${patch.phase} verworfen`);
      const rest = { ...patch };
      delete rest.phase;
      patch = rest;
    }
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }
  private dbg(patch: Partial<CallDebug>) {
    this.set({ debug: { ...this.snap.debug, ...patch } });
  }
  private log(msg: string) {
    const log = [...this.snap.debug.log.slice(-79), { t: Date.now(), msg }];
    this.snap = { ...this.snap, debug: { ...this.snap.debug, log } };
    this.listeners.forEach((l) => l());
    if (process.env.NODE_ENV === "development") console.debug("[call]", msg);
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    if (this.running) return;
    this.running = true;
    void this.connect();
    this.watchdog = window.setInterval(() => {
      if (!this.snap.signalingReady && Date.now() - this.chSince > 10_000) this.reconnectChannel("Watchdog");
      const cutoff = Date.now() - 120_000;
      for (const [k, t] of this.seen) if (t < cutoff) this.seen.delete(k);
    }, 4000);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("pagehide", this.onPageHide);
    document.addEventListener("visibilitychange", this.onVisible);
  }

  stop() {
    this.running = false;
    window.clearInterval(this.watchdog);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("pagehide", this.onPageHide);
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.snap.callId && this.isLive()) this.hangup();
    this.finish(null, { silent: true });
    window.clearInterval(this.pumpTimer);
    this.pumpTimer = undefined;
    const ch = this.ch;
    this.ch = null;
    if (ch) void this.o.supabase.removeChannel(ch);
  }

  private onOnline = () => {
    this.log("Netzwerk wieder da");
    if (!this.snap.signalingReady) this.reconnectChannel("online");
    if (this.pc && this.snap.phase !== "active") this.restartIce(true);
  };
  private onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (!this.snap.signalingReady) this.reconnectChannel("sichtbar");
    if (this.isLive() && this.snap.phase !== "incoming" && this.snap.phase !== "outgoing") void this.lockScreen();
  };
  private onPageHide = () => {
    const s = this.snap;
    if (!s.callId || !this.isLive()) return;
    const t: MsgType = s.phase === "outgoing" ? "cancel" : s.phase === "incoming" ? "decline" : "hangup";
    this.raw(this.envelope({ t, callId: s.callId, to: s.phase === "outgoing" ? undefined : (this.peerDev ?? undefined), reason: "Seite geschlossen" }));
  };

  private isLive() {
    const p = this.snap.phase;
    return p !== "idle" && p !== "ended";
  }

  // ---------------------------------------------------------------- signaling
  private async connect() {
    if (!this.running) return;
    this.chSince = Date.now();
    this.set({ signalingReady: false });
    this.dbg({ signaling: "verbinde" });
    try {
      await this.o.supabase.realtime.setAuth();
    } catch {
      /* token refresh happens on the next attempt */
    }
    if (!this.running) return;
    const ch = await freshChannel(this.o.supabase, "ours:call", { config: { private: true, broadcast: { self: false, ack: false } } });
    if (!this.running) {
      void this.o.supabase.removeChannel(ch);
      return;
    }
    this.ch = ch;
    ch.on("broadcast", { event: "call" }, ({ payload }) => this.receive(payload as Msg));
    ch.subscribe((status) => {
      if (this.ch !== ch) return;
      this.dbg({ signaling: status });
      if (status === "SUBSCRIBED") {
        this.set({ signalingReady: true });
        this.log("Signaling verbunden");
        this.pump(true);
      } else {
        this.set({ signalingReady: false });
        this.log(`Signaling: ${status}`);
        if (status === "CLOSED" && this.running) this.reconnectChannel("geschlossen");
      }
    });
  }

  private reconnectChannel(why: string) {
    if (!this.running) return;
    this.log(`Signaling neu verbinden (${why})`);
    const old = this.ch;
    this.ch = null;
    this.chSince = Date.now();
    if (old) void this.o.supabase.removeChannel(old);
    void this.connect();
  }

  private waitForSignaling(ms: number) {
    if (this.snap.signalingReady) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const t0 = Date.now();
      const id = window.setInterval(() => {
        if (this.snap.signalingReady || Date.now() - t0 > ms) {
          window.clearInterval(id);
          resolve(this.snap.signalingReady);
        }
      }, 100);
    });
  }

  private envelope(m: OutMsg, reliable = false): Msg {
    return { ...m, v: 1, mid: crypto.randomUUID(), from: this.o.meId, dev: this.o.deviceId, ...(reliable ? { rel: true } : {}) };
  }

  private raw(msg: Msg) {
    if (!this.ch || !this.snap.signalingReady) return false;
    this.ch.send({ type: "broadcast", event: "call", payload: msg }).catch(() => {});
    return true;
  }

  /** Reliable messages are re-sent until the other device acknowledges them. */
  private send(m: OutMsg, reliable = true) {
    const msg = this.envelope(m, reliable);
    if (!reliable) return this.raw(msg);
    this.outbox.set(msg.mid, { msg, tries: 0, next: 0, created: Date.now() });
    this.pump();
    return true;
  }

  private pump(force = false) {
    const now = Date.now();
    for (const [mid, e] of this.outbox) {
      if (now - e.created > 30_000 || e.tries >= 12) {
        this.outbox.delete(mid);
        this.log(`„${e.msg.t}“ wurde nicht bestätigt`);
        continue;
      }
      if (!force && now < e.next) continue;
      if (this.raw(e.msg)) {
        e.tries++;
        e.next = now + Math.min(500 * 2 ** (e.tries - 1), 2000);
      }
    }
    if (this.outbox.size && !this.pumpTimer) this.pumpTimer = window.setInterval(() => this.pump(), 250);
    if (!this.outbox.size && this.pumpTimer) {
      window.clearInterval(this.pumpTimer);
      this.pumpTimer = undefined;
    }
  }

  private receive(m: Msg) {
    if (!m || m.v !== 1 || !m.callId || !m.t) return;
    if (m.dev === this.o.deviceId) return;
    const s = this.snap;

    // Another of MY devices answered or declined the call that is ringing here.
    if (m.from === this.o.meId) {
      if ((m.t === "accept" || m.t === "decline") && s.phase === "incoming" && s.callId === m.callId) {
        this.log("Auf einem anderen Gerät beantwortet");
        this.finish(null, { silent: true });
      }
      return;
    }
    if (m.from !== this.o.partnerId) return;
    if (m.t === "ack") {
      if (m.to === this.o.deviceId && m.ack) this.outbox.delete(m.ack);
      return;
    }
    if (m.to && m.to !== this.o.deviceId) return;
    if (m.rel) {
      this.raw(this.envelope({ t: "ack", callId: m.callId, ack: m.mid, to: m.dev }));
      if (this.seen.has(m.mid)) return;
      this.seen.set(m.mid, Date.now());
    }
    this.handle(m).catch((err: unknown) => {
      this.log(`Fehler bei „${m.t}“: ${err instanceof Error ? err.message : String(err)}`);
      if (m.t === "desc" && this.isLive()) this.fail("Die Verbindungsdaten konnten nicht verarbeitet werden. Bitte nochmal anrufen.");
    });
  }

  private async handle(m: Msg) {
    const s = this.snap;
    if (m.t === "ring") return this.onRing(m);
    if (m.callId !== s.callId) return;
    switch (m.t) {
      case "ringing":
        if (s.phase === "outgoing" && !s.delivered) this.set({ delivered: true });
        return;
      case "accept":
        return this.onAccept(m);
      case "desc":
        return this.onDesc(m);
      case "ice":
        return this.onIce(m);
      case "media":
        if (m.media) {
          this.set({ remoteMedia: m.media });
          this.updateRemoteVideo();
        }
        return;
      case "decline":
        if (s.phase === "outgoing") {
          this.dbStatus(s.callId, "declined");
          this.finish(m.reason === "Medien" ? `${this.partnerName} konnte Kamera/Mikrofon nicht starten` : `${this.partnerName} hat abgelehnt`);
        }
        return;
      case "busy":
        if (s.phase === "outgoing") {
          this.dbStatus(s.callId, "busy");
          this.finish(`${this.partnerName} ist gerade in einem anderen Anruf`);
        }
        return;
      case "cancel":
        if (s.phase === "incoming" || s.phase === "connecting") this.finish(m.reason === "glare" ? null : "Verpasster Anruf", { silent: m.reason === "glare" });
        return;
      case "hangup":
        if (this.isLive()) {
          if (m.reason === "elsewhere") return this.finish(null, { silent: true });
          this.finish(m.reason === "failed" ? "Verbindung konnte nicht aufgebaut werden" : "Anruf beendet");
        }
        return;
    }
  }

  // ---------------------------------------------------------------- ringing
  private async onRing(m: Msg) {
    const s = this.snap;
    if (s.callId === m.callId) {
      if (s.phase === "incoming") {
        this.raw(this.envelope({ t: "ringing", callId: m.callId, to: m.dev }));
        this.timer("ring-alive", 7000, () => this.snap.phase === "incoming" && this.finish("Verpasster Anruf"));
      }
      return;
    }
    if (s.phase === "idle" || s.phase === "ended") {
      this.reset();
      this.peerDev = m.dev;
      const kind = m.kind === "video" ? "video" : "audio";
      this.set({ ...this.fresh(), phase: "incoming", kind, callId: m.callId, direction: "in", camOn: kind === "video", remoteMedia: { mic: true, cam: kind === "video", screen: false } });
      this.log(`Eingehender ${kind === "video" ? "Video" : "Audio"}anruf`);
      this.raw(this.envelope({ t: "ringing", callId: m.callId, to: m.dev }));
      this.ringer = createRinger("incoming");
      this.notify(kind);
      // The caller repeats the ring every 2 s, so silence means they stopped.
      this.timer("ring-alive", 7000, () => this.snap.phase === "incoming" && this.finish("Verpasster Anruf"));
      this.timer("ring-max", 50_000, () => this.snap.phase === "incoming" && this.finish("Verpasster Anruf"));
      return;
    }
    if (s.phase === "outgoing" && s.callId && m.callId < s.callId) {
      // Both called at the same moment: the lower call id wins, we pick up theirs.
      this.log("Gleichzeitiger Anruf: nehme den Anruf an");
      const mine = s.callId;
      this.send({ t: "cancel", callId: mine, reason: "glare" });
      this.dbStatus(mine, "cancelled", "gleichzeitiger Anruf");
      window.clearInterval(this.ringLoop);
      this.ringer?.stop();
      this.ringer = null;
      this.clearTimers();
      this.token++; // a still-running startCall() must not continue
      this.peerDev = m.dev;
      const kind = m.kind === "video" ? "video" : "audio";
      this.set({ phase: "incoming", callId: m.callId, kind, direction: "in", delivered: false, remoteMedia: { mic: true, cam: kind === "video", screen: false } });
      await this.accept();
      return;
    }
    if (s.phase === "outgoing") return; // our call wins, they will pick ours up
    this.raw(this.envelope({ t: "busy", callId: m.callId, to: m.dev }));
  }

  private async onAccept(m: Msg) {
    const s = this.snap;
    if (s.phase !== "outgoing") {
      // Picked up on two devices at once: the first one wins.
      if (this.isLive() && this.peerDev && m.dev !== this.peerDev) this.send({ t: "hangup", callId: m.callId, to: m.dev, reason: "elsewhere" });
      return;
    }
    if (!this.local) return;
    this.peerDev = m.dev;
    window.clearInterval(this.ringLoop);
    this.ringer?.stop();
    this.ringer = null;
    this.clearTimers();
    this.set({ phase: "connecting", delivered: true });
    this.log("Angenommen, baue Verbindung auf");
    const token = this.token;
    const ice = await this.loadIce();
    if (token !== this.token) return;
    this.createPeer(false, ice);
    this.connectTimers();
    void this.lockScreen();
  }

  private notify(kind: CallKind) {
    if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
    const body = kind === "video" ? `📹 ${this.partnerName} ruft per Video an` : `📞 ${this.partnerName} ruft an`;
    const opts: NotificationOptions = { body, tag: "ours-call", icon: "/icon", requireInteraction: true } as NotificationOptions;
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg) return reg.showNotification("ours. ♡", { ...opts, data: { url: "/" } });
      new Notification("ours. ♡", opts);
    }).catch(() => {});
  }

  // ---------------------------------------------------------------- public API
  async startCall(kind: CallKind) {
    if (this.isLive()) return;
    this.reset();
    const callId = crypto.randomUUID();
    const token = this.token;
    this.set({ ...this.fresh(), phase: "outgoing", kind, callId, direction: "out", camOn: kind === "video", remoteMedia: { mic: true, cam: kind === "video", screen: false } });
    this.log(`Rufe an (${kind})`);
    this.ringer = createRinger("outgoing");

    const [media, ready] = await Promise.all([this.getMedia(kind).then((s) => ({ s }), (err: unknown) => ({ err })), this.waitForSignaling(6000)]);
    void this.loadIce();
    if (token !== this.token) {
      if ("s" in media) media.s.getTracks().forEach((t) => t.stop());
      return;
    }
    if ("err" in media) return this.fail(mediaError(media.err));
    this.useLocal(media.s);
    if (!ready) return this.fail("Keine Verbindung zum Server. Prüfe dein Internet und versuche es nochmal.");

    this.db = this.o.supabase
      .from("calls")
      .insert({ id: callId, callee_id: this.o.partnerId, kind })
      .then(({ error }) => error && this.log(`Verlauf: ${error.message}`));

    const ring = () => this.send({ t: "ring", callId, kind }, false);
    ring();
    this.ringLoop = window.setInterval(ring, 2000);
    this.timer("ring-max", 45_000, () => {
      if (this.snap.phase !== "outgoing") return;
      this.send({ t: "cancel", callId, reason: "timeout" });
      this.dbStatus(callId, "missed");
      this.finish(this.snap.delivered ? `${this.partnerName} hat nicht abgenommen` : `${this.partnerName} ist gerade nicht erreichbar`);
    });
  }

  async accept() {
    const s = this.snap;
    if (s.phase !== "incoming" || !s.callId) return;
    const callId = s.callId;
    const token = this.token;
    this.ringer?.stop();
    this.ringer = null;
    this.clearTimers();
    this.set({ phase: "connecting" });
    this.log("Angenommen");
    let stream: MediaStream;
    try {
      const reuse = this.local && (s.kind === "audio" || this.camTrack) ? this.local : null;
      stream = reuse ?? (await this.getMedia(s.kind));
    } catch (err) {
      if (token !== this.token) return;
      this.send({ t: "decline", callId, to: this.peerDev ?? undefined, reason: "Medien" });
      this.dbStatus(callId, "declined", "Kamera/Mikrofon nicht verfügbar");
      return this.fail(mediaError(err));
    }
    const ice = await this.loadIce();
    if (token !== this.token) {
      if (stream !== this.local) stream.getTracks().forEach((t) => t.stop());
      return;
    }
    if (stream !== this.local) this.useLocal(stream);
    this.createPeer(true, ice);
    this.send({ t: "accept", callId, to: this.peerDev ?? undefined });
    this.dbStatus(callId, "accepted");
    this.connectTimers();
    void this.lockScreen();
  }

  decline() {
    const s = this.snap;
    if (s.phase !== "incoming" || !s.callId) return;
    this.send({ t: "decline", callId: s.callId, to: this.peerDev ?? undefined });
    this.dbStatus(s.callId, "declined");
    this.finish(null, { silent: true });
  }

  hangup() {
    const s = this.snap;
    if (!s.callId || !this.isLive()) return;
    if (s.phase === "incoming") return this.decline();
    if (s.phase === "outgoing") {
      this.send({ t: "cancel", callId: s.callId, reason: "aufgelegt" });
      this.dbStatus(s.callId, "cancelled");
    } else {
      this.send({ t: "hangup", callId: s.callId, to: this.peerDev ?? undefined });
      this.dbStatus(s.callId, "ended");
    }
    this.finish("Anruf beendet");
  }

  dismiss() {
    if (this.snap.phase === "ended") {
      window.clearTimeout(this.endTimer);
      this.set({ ...this.fresh(), phase: "idle" });
    }
  }

  setMinimized(minimized: boolean) {
    this.set({ minimized });
  }

  toggleMic() {
    const on = !this.snap.micOn;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.set({ micOn: on });
    this.sendMedia();
  }

  /** Camera off really stops the camera (the light goes out), on asks for it again. */
  async toggleCam() {
    const s = this.snap;
    if (!this.local) return;
    if (s.camOn) {
      const t = this.camTrack;
      this.camTrack = null;
      if (t) {
        this.local.removeTrack(t);
        t.stop();
      }
      if (!s.screenOn) await this.videoTx?.sender.replaceTrack(null).catch(() => {});
      this.set({ camOn: false, localStream: new MediaStream(this.local.getTracks()) });
    } else {
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({ video: camera(s.facing) });
        const t = fresh.getVideoTracks()[0];
        if (!this.isLive() || !this.local) return t.stop();
        this.camTrack = t;
        this.local.addTrack(t);
        if (!this.snap.screenOn) await this.videoTx?.sender.replaceTrack(t).catch(() => {});
        this.set({ camOn: true, localStream: new MediaStream(this.local.getTracks()) });
        void this.tuneSenders();
      } catch (err) {
        this.o.notice(mediaError(err));
      }
    }
    this.sendMedia();
  }

  async flipCamera() {
    const s = this.snap;
    if (!s.camOn || !this.local || !this.camTrack) return;
    const facing = s.facing === "user" ? "environment" : "user";
    try {
      // Some phones can only open one camera at a time.
      this.camTrack.stop();
      const fresh = await navigator.mediaDevices.getUserMedia({ video: camera(facing) });
      const t = fresh.getVideoTracks()[0];
      const old = this.camTrack;
      this.local.removeTrack(old);
      this.camTrack = t;
      this.local.addTrack(t);
      if (!this.snap.screenOn) await this.videoTx?.sender.replaceTrack(t);
      this.set({ facing, localStream: new MediaStream(this.local.getTracks()) });
    } catch {
      this.o.notice("Dieses Gerät hat nur eine Kamera.");
      // bring the previous camera back
      try {
        const back = await navigator.mediaDevices.getUserMedia({ video: camera(s.facing) });
        const t = back.getVideoTracks()[0];
        if (this.camTrack) this.local.removeTrack(this.camTrack);
        this.camTrack = t;
        this.local.addTrack(t);
        if (!this.snap.screenOn) await this.videoTx?.sender.replaceTrack(t);
        this.set({ localStream: new MediaStream(this.local.getTracks()) });
      } catch {
        /* camera stays off */
      }
    }
  }

  static canShareScreen() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices;
  }

  async toggleScreen() {
    const s = this.snap;
    if (s.phase !== "active" && s.phase !== "reconnecting") return;
    if (s.screenOn) return this.stopScreen();
    if (!CallEngine.canShareScreen()) return this.o.notice("Bildschirm teilen geht auf diesem Gerät nicht (z. B. iPhone/iPad).");
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: false });
      const t = display.getVideoTracks()[0];
      if (!this.isLive()) return t.stop();
      t.contentHint = "detail";
      t.addEventListener("ended", () => void this.stopScreen());
      this.screenTrack = t;
      await this.videoTx?.sender.replaceTrack(t);
      this.set({ screenOn: true });
      void this.tuneSenders();
      this.sendMedia();
      this.log("Bildschirm wird geteilt");
    } catch (err) {
      if ((err as { name?: string })?.name !== "NotAllowedError") this.o.notice("Bildschirm teilen konnte nicht gestartet werden.");
    }
  }

  private async stopScreen() {
    const t = this.screenTrack;
    if (!t) return;
    this.screenTrack = null;
    t.stop();
    await this.videoTx?.sender.replaceTrack(this.snap.camOn ? this.camTrack : null).catch(() => {});
    this.set({ screenOn: false });
    void this.tuneSenders();
    this.sendMedia();
  }

  // ---------------------------------------------------------------- media + peer
  private async getMedia(kind: CallKind) {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no mediaDevices"), { name: "NotSupported" });
    return navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: kind === "video" ? camera("user") : false });
  }

  private useLocal(stream: MediaStream) {
    this.local = stream;
    this.camTrack = stream.getVideoTracks()[0] ?? null;
    this.set({ localStream: stream, camOn: !!this.camTrack });
  }

  async loadIce(): Promise<IceConfig> {
    if (this.ice && Date.now() - this.ice.at < 30 * 60_000) return this.ice;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 3500);
    try {
      const res = await fetch("/api/turn", { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { iceServers: RTCIceServer[]; relay: string | null; error?: string };
      this.ice = { servers: body.iceServers?.length ? body.iceServers : DEFAULT_STUN, relay: body.relay, error: body.error, at: Date.now() };
    } catch (err) {
      this.ice = { servers: DEFAULT_STUN, relay: null, error: err instanceof Error ? err.message : "nicht erreichbar", at: Date.now() - 29 * 60_000 };
    } finally {
      window.clearTimeout(t);
    }
    this.dbg({ turn: this.ice.relay ? `TURN aktiv (${this.ice.relay})` : this.ice.error ? `kein TURN (${this.ice.error})` : "kein TURN konfiguriert" });
    return this.ice;
  }

  private createPeer(polite: boolean, ice: IceConfig) {
    const pc = new RTCPeerConnection({ iceServers: ice.servers, bundlePolicy: "max-bundle" });
    this.pc = pc;
    this.polite = polite;
    this.remoteTracks = [];
    const local = this.local!;
    if (!polite) {
      const audio = local.getAudioTracks()[0];
      this.audioTx = pc.addTransceiver(audio ?? "audio", { direction: "sendrecv", streams: [local] });
      // Always negotiate a video line, so camera or screen can be switched on later without renegotiation.
      this.videoTx = pc.addTransceiver(this.camTrack ?? "video", { direction: "sendrecv", streams: [local] });
    }
    pc.ontrack = (e) => {
      if (!this.remoteTracks.includes(e.track)) this.remoteTracks.push(e.track);
      e.track.addEventListener("mute", () => this.updateRemoteVideo());
      e.track.addEventListener("unmute", () => this.updateRemoteVideo());
      this.set({ remoteStream: new MediaStream(this.remoteTracks) });
      this.updateRemoteVideo();
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return this.log("ICE-Kandidaten vollständig gesammelt");
      const type = candType(e.candidate);
      if (type) this.dbg({ localCands: { ...this.snap.debug.localCands, [type]: this.snap.debug.localCands[type] + 1 } });
      this.iceBatch.push(e.candidate.toJSON());
      if (!this.iceTimer) {
        this.iceTimer = window.setTimeout(() => {
          this.iceTimer = undefined;
          const cands = this.iceBatch.splice(0);
          if (cands.length && this.snap.callId) this.send({ t: "ice", callId: this.snap.callId, to: this.peerDev ?? undefined, cands });
        }, 60);
      }
    };
    pc.onicegatheringstatechange = () => this.dbg({ gathering: pc.iceGatheringState });
    pc.onsignalingstatechange = () => this.dbg({ signalingState: pc.signalingState });
    pc.oniceconnectionstatechange = () => {
      this.dbg({ ice: pc.iceConnectionState });
      // Older Safari has no connectionState.
      if ((pc as { connectionState?: string }).connectionState === undefined) {
        const st = pc.iceConnectionState;
        this.onConnection(st === "completed" ? "connected" : (st as RTCPeerConnectionState));
      }
    };
    pc.onconnectionstatechange = () => this.onConnection(pc.connectionState);
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        this.sendDesc(pc);
      } catch (err) {
        this.log(`Offer fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        this.makingOffer = false;
      }
    };
    this.dbg({ connection: pc.connectionState, ice: pc.iceConnectionState, gathering: pc.iceGatheringState, signalingState: pc.signalingState });
  }

  private sendDesc(pc: RTCPeerConnection) {
    const d = pc.localDescription;
    if (!d || !this.snap.callId) return;
    this.log(`Sende ${d.type}`);
    this.send({ t: "desc", callId: this.snap.callId, to: this.peerDev ?? undefined, desc: { type: d.type, sdp: d.sdp } });
  }

  private async onDesc(m: Msg) {
    const pc = this.pc;
    const desc = m.desc;
    if (!pc || !desc) return;
    this.log(`Empfange ${desc.type}`);
    if (desc.type === "answer" && pc.signalingState !== "have-local-offer") return this.log("Veraltete Antwort ignoriert");
    const collision = desc.type === "offer" && (this.makingOffer || pc.signalingState !== "stable");
    this.ignoreOffer = !this.polite && collision;
    if (this.ignoreOffer) return this.log("Offer-Kollision: ignoriert (wir sind dran)");
    try {
      await pc.setRemoteDescription({ type: desc.type, sdp: tuneRemoteSdp(desc.sdp) });
    } catch (err) {
      this.log(`Angepasstes SDP abgelehnt (${err instanceof Error ? err.message : String(err)}), nutze Original`);
      await pc.setRemoteDescription({ type: desc.type, sdp: desc.sdp });
    }
    if (desc.type === "offer") {
      await this.attachLocalTracks(pc);
      await pc.setLocalDescription();
      this.sendDesc(pc);
    }
    for (const c of this.pendingCands.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  }

  /** The callee puts its microphone/camera on the transceivers the caller offered. */
  private async attachLocalTracks(pc: RTCPeerConnection) {
    for (const t of pc.getTransceivers()) {
      const kind = t.receiver.track.kind;
      if (kind === "audio" && !this.audioTx) {
        this.audioTx = t;
        t.direction = "sendrecv";
        await t.sender.replaceTrack(this.local?.getAudioTracks()[0] ?? null);
      } else if (kind === "video" && !this.videoTx) {
        this.videoTx = t;
        t.direction = "sendrecv";
        await t.sender.replaceTrack(this.screenTrack ?? this.camTrack ?? null);
      } else continue;
      if (this.local) t.sender.setStreams?.(this.local);
    }
  }

  private async onIce(m: Msg) {
    for (const c of m.cands ?? []) {
      const type = candType(c);
      if (type) this.dbg({ remoteCands: { ...this.snap.debug.remoteCands, [type]: this.snap.debug.remoteCands[type] + 1 } });
      if (!this.pc || !this.pc.remoteDescription) this.pendingCands.push(c);
      else
        await this.pc.addIceCandidate(c).catch((err: unknown) => {
          if (!this.ignoreOffer) this.log(`ICE-Kandidat abgelehnt: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
  }

  private onConnection(state: RTCPeerConnectionState) {
    this.dbg({ connection: state });
    const s = this.snap;
    if (!this.isLive()) return;
    if (state === "connected") {
      this.clearTimer("connect-restart");
      this.clearTimer("connect-fail");
      this.clearTimer("reconnect-restart");
      this.clearTimer("giveup");
      this.restarts = 0;
      if (s.phase === "connecting" || s.phase === "reconnecting") {
        const first = !s.connectedAt;
        this.set({ phase: "active", connectedAt: s.connectedAt ?? Date.now() });
        this.log(first ? "Verbunden" : "Wieder verbunden");
        if (first && s.callId) this.dbStatus(s.callId, "connected");
        void this.tuneSenders();
        this.startStats();
        this.sendMedia();
      }
      return;
    }
    if (state === "disconnected" || state === "failed") {
      if (s.phase === "active") {
        this.set({ phase: "reconnecting" });
        this.log(state === "failed" ? "Verbindung abgebrochen" : "Verbindung wackelt");
      }
      if (state === "failed") this.restartIce(true);
      else this.timer("reconnect-restart", 2500, () => this.restartIce(false));
      if (this.snap.phase === "reconnecting" && !this.timers.has("giveup")) {
        this.timer("giveup", 30_000, () => {
          if (this.snap.phase !== "reconnecting") return;
          if (this.snap.callId) {
            this.send({ t: "hangup", callId: this.snap.callId, to: this.peerDev ?? undefined, reason: "lost" });
            this.dbStatus(this.snap.callId, "ended", "Verbindung verloren");
          }
          this.fail("Die Verbindung ist abgebrochen und kam nicht zurück.");
        });
      }
    }
  }

  private restartIce(force: boolean) {
    const pc = this.pc;
    if (!pc || pc.connectionState === "connected" || pc.connectionState === "closed") return;
    // The caller restarts on wobbles; on a hard failure both may (perfect negotiation resolves it).
    if (this.polite && !force) return;
    if (this.restarts >= 4) return;
    this.restarts++;
    this.log(`ICE-Neustart (${this.restarts})`);
    pc.restartIce();
  }

  private connectTimers() {
    this.timer("connect-restart", 12_000, () => this.snap.phase === "connecting" && this.restartIce(true));
    this.timer("connect-fail", 30_000, () => {
      if (this.snap.phase !== "connecting" || !this.snap.callId) return;
      const reason = this.diagnose();
      this.send({ t: "hangup", callId: this.snap.callId, to: this.peerDev ?? undefined, reason: "failed" });
      this.dbStatus(this.snap.callId, "failed", reason);
      this.fail(reason);
    });
  }

  private diagnose() {
    const d = this.snap.debug;
    const remote = d.remoteCands.host + d.remoteCands.srflx + d.remoteCands.relay + d.remoteCands.prflx;
    if (!this.pc?.remoteDescription) return "Das andere Gerät hat nicht geantwortet. Prüft beide eure Internetverbindung und versucht es nochmal.";
    if (remote === 0) return "Vom anderen Gerät kamen keine Verbindungswege an. Bitte nochmal versuchen.";
    if (!this.ice?.relay)
      return "Eure Geräte finden keinen direkten Weg zueinander (typisch bei mobilem Internet oder strenger Firewall). Dafür braucht es einen TURN-Server – siehe Einstellungen › Integrationen.";
    return "Die Verbindung kam auch über den TURN-Server nicht zustande. Bitte nochmal versuchen.";
  }

  private async tuneSenders() {
    const set = async (sender: RTCRtpSender | undefined, bitrate: number, pref?: string) => {
      if (!sender?.track) return;
      const p = sender.getParameters();
      if (!p.encodings?.length) return; // not negotiated yet
      p.encodings[0].maxBitrate = bitrate;
      if (pref) Object.assign(p, { degradationPreference: pref });
      await sender.setParameters(p).catch(() => {});
    };
    await set(this.audioTx?.sender, 128_000);
    await set(this.videoTx?.sender, this.screenTrack ? 3_000_000 : 4_000_000, this.screenTrack ? "maintain-resolution" : "balanced");
  }

  private sendMedia() {
    const s = this.snap;
    if (!s.callId || !this.pc || !this.peerDev) return;
    this.send({ t: "media", callId: s.callId, to: this.peerDev, media: { mic: s.micOn, cam: s.camOn, screen: s.screenOn } });
  }

  private updateRemoteVideo() {
    const v = this.remoteTracks.find((t) => t.kind === "video");
    const live = !!v && !v.muted && v.readyState === "live" && (this.snap.remoteMedia.cam || this.snap.remoteMedia.screen);
    if (live !== this.snap.remoteVideoLive) this.set({ remoteVideoLive: live });
  }

  private startStats() {
    window.clearInterval(this.statsTimer);
    this.lastLoss = { lost: 0, recv: 0 };
    this.statsTimer = window.setInterval(async () => {
      const pc = this.pc;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let label: string | null = null;
        let rtt: number | null = null;
        let lost = 0;
        let recv = 0;
        let pairId: string | undefined;
        stats.forEach((r) => {
          if (r.type === "inbound-rtp" && r.kind === "video" && r.frameHeight) label = `${r.frameHeight}p · ${Math.round(r.framesPerSecond ?? 0)} fps`;
          if (r.type === "inbound-rtp" && r.kind === "audio") {
            lost += r.packetsLost ?? 0;
            recv += r.packetsReceived ?? 0;
          }
          if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
        });
        if (!pairId) stats.forEach((r) => r.type === "candidate-pair" && r.nominated && r.state === "succeeded" && (pairId = r.id));
        const pair = pairId ? stats.get(pairId) : undefined;
        if (pair?.currentRoundTripTime != null) rtt = Math.round(pair.currentRoundTripTime * 1000);
        const dl = lost - this.lastLoss.lost;
        const dr = recv - this.lastLoss.recv;
        this.lastLoss = { lost, recv };
        const loss = dl + dr > 0 ? Math.round((dl / (dl + dr)) * 1000) / 10 : null;
        const level: CallQuality["level"] =
          (rtt ?? 0) > 400 || (loss ?? 0) > 8 ? "schwach" : (rtt ?? 0) > 200 || (loss ?? 0) > 3 ? "okay" : "gut";
        let pairText: string | null = null;
        if (pair) {
          const l = stats.get(pair.localCandidateId);
          const r = stats.get(pair.remoteCandidateId);
          // Only the kind of path, never addresses.
          pairText = `${l?.candidateType ?? "?"}/${l?.protocol ?? "?"}${l?.relayProtocol ? `(${l.relayProtocol})` : ""} ↔ ${r?.candidateType ?? "?"}`;
        }
        this.set({ quality: { label, rttMs: rtt, lossPct: loss, level } });
        if (pairText !== this.snap.debug.pair) this.dbg({ pair: pairText });
      } catch {
        /* stats are best effort */
      }
    }, 2000);
  }

  private async lockScreen() {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl && !this.wakeLock) this.wakeLock = await wl.request("screen");
    } catch {
      /* not supported or not allowed */
    }
  }

  // ---------------------------------------------------------------- ending
  private fresh(): CallSnapshot {
    return { ...IDLE_SNAPSHOT, signalingReady: this.snap.signalingReady, debug: { ...DEBUG0, signaling: this.snap.debug.signaling, turn: this.snap.debug.turn, log: this.snap.debug.log } };
  }

  private reset() {
    window.clearTimeout(this.endTimer);
    this.token++;
  }

  private fail(message: string) {
    this.log(`Fehler: ${message}`);
    this.finish(message, { error: true });
  }

  private finish(reason: string | null, opts: { error?: boolean; silent?: boolean } = {}) {
    this.token++;
    this.clearTimers();
    window.clearInterval(this.ringLoop);
    window.clearInterval(this.statsTimer);
    window.clearTimeout(this.iceTimer);
    this.iceTimer = undefined;
    this.ringer?.stop();
    this.ringer = null;
    const pc = this.pc;
    this.pc = null;
    if (pc) {
      pc.ontrack = pc.onicecandidate = pc.onconnectionstatechange = pc.oniceconnectionstatechange = pc.onnegotiationneeded = null;
      pc.onicegatheringstatechange = pc.onsignalingstatechange = null;
      pc.getSenders().forEach((s) => s.track?.stop());
      pc.close();
    }
    // Nothing may keep the camera or microphone open after a call.
    this.local?.getTracks().forEach((t) => t.stop());
    this.camTrack?.stop();
    this.screenTrack?.stop();
    this.local = this.camTrack = this.screenTrack = null;
    this.audioTx = this.videoTx = null;
    this.remoteTracks = [];
    this.pendingCands = [];
    this.iceBatch = [];
    this.makingOffer = this.ignoreOffer = false;
    this.peerDev = null;
    this.restarts = 0;
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    if (!this.isLive() && this.snap.phase !== "ended") return;
    if (opts.silent) {
      this.set({ ...this.fresh(), phase: "idle" });
      return;
    }
    this.set({
      phase: "ended",
      endedReason: reason ?? "Anruf beendet",
      error: opts.error ? reason : null,
      localStream: null,
      remoteStream: null,
      remoteVideoLive: false,
      screenOn: false,
      minimized: false,
      quality: null,
    });
    window.clearTimeout(this.endTimer);
    if (!opts.error) this.endTimer = window.setTimeout(() => this.dismiss(), 2600);
  }

  private dbStatus(callId: string | null, status: string, reason?: string) {
    if (!callId) return;
    this.db = this.db.then(() =>
      this.o.supabase.rpc("call_set_status", { call_id: callId, next_status: status, reason }).then(({ error }) => error && this.log(`Verlauf: ${error.message}`)),
    );
  }

  private timer(name: string, ms: number, fn: () => void) {
    this.clearTimer(name);
    this.timers.set(
      name,
      window.setTimeout(() => {
        this.timers.delete(name);
        fn();
      }, ms),
    );
  }
  private clearTimer(name: string) {
    window.clearTimeout(this.timers.get(name));
    this.timers.delete(name);
  }
  private clearTimers() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers.clear();
  }
}
