/**
 * Thin adapters around the official players: YouTube IFrame Player API, Spotify
 * Embed iFrame API and Spotify Web Playback SDK. Each reports its real position;
 * nothing here pretends to play.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PlayerState = "loading" | "ready" | "playing" | "paused" | "ended" | "blocked" | "error";

export interface Player {
  readonly kind: "youtube" | "spotify-embed" | "spotify-sdk";
  load(ref: string, startMs: number, play: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(ms: number): Promise<void>;
  /** Current position in ms, or null if unknown. */
  position(): number | null;
  duration(): number | null;
  state(): PlayerState;
  /** For the Spotify embed: true while it only plays a 30 s preview. */
  previewOnly?(): boolean;
  destroy(): void;
}

type Listener = () => void;

function loadScript(src: string, globalReady: string): Promise<any> {
  const w = window as any;
  w.__oursScripts ??= {};
  if (w.__oursScripts[src]) return w.__oursScripts[src];
  w.__oursScripts[src] = new Promise((resolve, reject) => {
    const prev = w[globalReady];
    w[globalReady] = (...args: unknown[]) => {
      prev?.(...args);
      resolve(args[0] ?? true);
    };
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onerror = () => {
      delete w.__oursScripts[src];
      reject(new Error("Player konnte nicht geladen werden (Netzwerk oder Blocker?)"));
    };
    document.head.appendChild(s);
  });
  return w.__oursScripts[src];
}

/* ---------------- YouTube ---------------- */
export class YouTubePlayer implements Player {
  readonly kind = "youtube" as const;
  private yt: any = null;
  private st: PlayerState = "loading";
  private ready: Promise<void>;
  private currentRef: string | null = null;

  constructor(el: HTMLElement, private onChange: Listener) {
    this.ready = loadScript("https://www.youtube.com/iframe_api", "onYouTubeIframeAPIReady").then(
      () =>
        new Promise<void>((resolve) => {
          const YT = (window as any).YT;
          this.yt = new YT.Player(el, {
            width: "100%",
            height: "100%",
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1 },
            events: {
              onReady: () => {
                this.st = "ready";
                resolve();
                this.onChange();
              },
              onStateChange: (e: { data: number }) => {
                this.st = ({ 0: "ended", 1: "playing", 2: "paused", 3: this.st, 5: "ready" } as Record<number, PlayerState>)[e.data] ?? this.st;
                this.onChange();
              },
              onError: () => {
                this.st = "error";
                this.onChange();
              },
              onAutoplayBlocked: () => {
                this.st = "blocked";
                this.onChange();
              },
            },
          });
        }),
    );
  }
  async load(ref: string, startMs: number, play: boolean) {
    await this.ready;
    this.currentRef = ref;
    const opts = { videoId: ref, startSeconds: startMs / 1000 };
    if (play) this.yt.loadVideoById(opts);
    else this.yt.cueVideoById(opts);
  }
  async play() {
    await this.ready;
    this.yt.playVideo();
    // Browsers block sound without a tap: detect that instead of pretending.
    window.setTimeout(() => {
      if (this.yt?.getPlayerState?.() !== 1 && this.st !== "playing" && this.st !== "ended" && this.st !== "error") {
        this.st = "blocked";
        this.onChange();
      }
    }, 1500);
  }
  async pause() {
    await this.ready;
    this.yt.pauseVideo();
  }
  async seek(ms: number) {
    await this.ready;
    this.yt.seekTo(ms / 1000, true);
  }
  position() {
    const t = this.yt?.getCurrentTime?.();
    return typeof t === "number" && this.currentRef ? Math.round(t * 1000) : null;
  }
  duration() {
    const d = this.yt?.getDuration?.();
    return typeof d === "number" && d > 0 ? Math.round(d * 1000) : null;
  }
  state() {
    return this.st;
  }
  destroy() {
    try {
      this.yt?.destroy?.();
    } catch {
      /* already gone */
    }
  }
}

/* ---------------- Spotify Embed (no account connection needed) ---------------- */
export class SpotifyEmbedPlayer implements Player {
  readonly kind = "spotify-embed" as const;
  private ctrl: any = null;
  private st: PlayerState = "loading";
  private pos: number | null = null;
  private posAt = 0;
  private dur: number | null = null;
  private paused = true;
  private ready: Promise<void>;
  private el: HTMLElement;

  constructor(host: HTMLElement, private onChange: Listener, firstUri: string) {
    this.el = document.createElement("div");
    host.appendChild(this.el);
    this.ready = loadScript("https://open.spotify.com/embed/iframe-api/v1", "onSpotifyIframeApiReady").then(
      (api: any) =>
        new Promise<void>((resolve) => {
          api.createController(this.el, { uri: firstUri, width: "100%", height: 152 }, (c: any) => {
            this.ctrl = c;
            c.addListener("ready", () => {
              this.st = "ready";
              resolve();
              this.onChange();
            });
            c.addListener("playback_update", (e: { data: { isPaused: boolean; isBuffering: boolean; duration: number; position: number } }) => {
              this.pos = e.data.position;
              this.posAt = performance.now();
              this.dur = e.data.duration || null;
              this.paused = e.data.isPaused;
              this.st = e.data.isPaused ? (this.pos > 0 && this.dur && this.pos >= this.dur - 300 ? "ended" : "paused") : "playing";
              this.onChange();
            });
          });
        }),
    );
  }
  async load(ref: string, startMs: number, play: boolean) {
    await this.ready;
    this.ctrl.loadUri(ref, false, Math.floor(startMs / 1000));
    if (play) this.ctrl.play();
  }
  async play() {
    await this.ready;
    this.ctrl.resume();
    window.setTimeout(() => {
      if (this.paused && this.st !== "ended") {
        this.st = "blocked";
        this.onChange();
      }
    }, 1800);
  }
  async pause() {
    await this.ready;
    this.ctrl.pause();
  }
  async seek(ms: number) {
    await this.ready;
    this.ctrl.seek(ms / 1000);
  }
  position() {
    if (this.pos == null) return null;
    return this.paused ? this.pos : this.pos + (performance.now() - this.posAt);
  }
  duration() {
    return this.dur;
  }
  previewOnly() {
    return this.dur != null && this.dur <= 30_500;
  }
  state() {
    return this.st;
  }
  destroy() {
    try {
      this.ctrl?.destroy?.();
    } catch {
      /* gone */
    }
    this.el.remove();
  }
}

/* ---------------- Spotify Web Playback SDK (Premium, connected account) ---------------- */
export class SpotifySdkPlayer implements Player {
  readonly kind = "spotify-sdk" as const;
  private player: any = null;
  private deviceId: string | null = null;
  private st: PlayerState = "loading";
  private last: { position: number; duration: number; paused: boolean; at: number } | null = null;
  private ready: Promise<void>;

  constructor(private onChange: Listener) {
    this.ready = loadScript("https://sdk.scdn.co/spotify-player.js", "onSpotifyWebPlaybackSDKReady").then(
      () =>
        new Promise<void>((resolve, reject) => {
          const Spotify = (window as any).Spotify;
          this.player = new Spotify.Player({
            name: "ours. Listen Together",
            volume: 0.8,
            getOAuthToken: (cb: (t: string) => void) => {
              void this.token().then(cb).catch(() => {
                this.st = "error";
                this.onChange();
              });
            },
          });
          this.player.addListener("ready", ({ device_id }: { device_id: string }) => {
            this.deviceId = device_id;
            this.st = "ready";
            resolve();
            this.onChange();
          });
          for (const ev of ["initialization_error", "authentication_error", "account_error"]) {
            this.player.addListener(ev, ({ message }: { message: string }) => {
              this.st = "error";
              this.onChange();
              reject(new Error(message));
            });
          }
          this.player.addListener("autoplay_failed", () => {
            this.st = "blocked";
            this.onChange();
          });
          this.player.addListener("player_state_changed", (s: any) => {
            if (!s) return;
            this.last = { position: s.position, duration: s.duration, paused: s.paused, at: performance.now() };
            this.st = s.paused ? "paused" : "playing";
            this.onChange();
          });
          void this.player.connect();
        }),
    );
  }
  private async token() {
    const r = await fetch("/api/integrations/spotify/token", { cache: "no-store" });
    if (!r.ok) throw new Error("Kein Spotify-Token");
    return ((await r.json()) as { access_token: string }).access_token;
  }
  async load(ref: string, startMs: number, play: boolean) {
    await this.ready;
    await this.player.activateElement?.();
    const token = await this.token();
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(this.deviceId!)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [ref], position_ms: Math.max(0, Math.round(startMs)) }),
    });
    if (!res.ok && res.status !== 204) {
      this.st = "error";
      this.onChange();
      throw new Error(`Spotify antwortet mit ${res.status}`);
    }
    if (!play) await this.player.pause();
  }
  async play() {
    await this.ready;
    await this.player.resume();
  }
  async pause() {
    await this.ready;
    await this.player.pause();
  }
  async seek(ms: number) {
    await this.ready;
    await this.player.seek(Math.round(ms));
  }
  position() {
    if (!this.last) return null;
    return this.last.paused ? this.last.position : this.last.position + (performance.now() - this.last.at);
  }
  duration() {
    return this.last?.duration ?? null;
  }
  state() {
    return this.st;
  }
  destroy() {
    try {
      this.player?.disconnect();
    } catch {
      /* gone */
    }
  }
}
