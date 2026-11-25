"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useApp } from "@/components/providers/app-provider";
import { CallScreen } from "./call-screen";
import { createRinger, type Ringer } from "./ringtone";

/**
 * 1:1 calls with WebRTC (peer-to-peer, end-to-end encrypted by DTLS-SRTP).
 * Signaling (ring / accept / SDP / ICE) runs over a private Supabase Realtime
 * broadcast channel that only the two members can join.
 */

export type CallKind = "audio" | "video";
export type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

type Signal =
  | { type: "ring"; callId: string; from: string; kind: CallKind }
  | { type: "accept" | "decline" | "busy" | "cancel" | "hangup"; callId: string; from: string }
  | { type: "offer" | "answer"; callId: string; from: string; sdp: string }
  | { type: "ice"; callId: string; from: string; candidate: RTCIceCandidateInit };

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type OutSignal = DistOmit<Signal, "from">;

export type CallState = {
  status: CallStatus;
  kind: CallKind;
  callId: string | null;
  startedAt: number | null;
  endedReason: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  facing: "user" | "environment";
  quality: string | null;
};

const IDLE: CallState = {
  status: "idle",
  kind: "video",
  callId: null,
  startedAt: null,
  endedReason: null,
  localStream: null,
  remoteStream: null,
  micOn: true,
  camOn: true,
  facing: "user",
  quality: null,
};

type CallContextValue = {
  state: CallState;
  busy: boolean;
  startCall: (kind: CallKind) => void;
  accept: () => void;
  decline: () => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  flipCamera: () => void;
  dismiss: () => void;
};

const CallContext = React.createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = React.useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside <CallProvider>");
  return ctx;
}

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
  // Optional TURN relay for networks that block direct connections (see README).
  const turn = process.env.NEXT_PUBLIC_TURN_URLS;
  if (turn) {
    servers.push({
      urls: turn.split(",").map((u) => u.trim()).filter(Boolean),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

function mediaConstraints(kind: CallKind, facing: "user" | "environment"): MediaStreamConstraints {
  return {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 },
    video:
      kind === "video"
        ? { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } }
        : false,
  };
}

/**
 * SDP tuning: Opus at full-band quality (128 kbit/s, in-band FEC, no DTX) and a high
 * starting bitrate for video so the picture is sharp right away instead of ramping up.
 */
function tuneSdp(sdp: string) {
  let out = sdp;
  const opus = out.match(/a=rtpmap:(\d+) opus\/48000/i);
  if (opus) {
    const pt = opus[1];
    const fmtp = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
    out = out.replace(fmtp, (_l, rest: string) => `a=fmtp:${pt} ${rest};maxaveragebitrate=128000;stereo=0;useinbandfec=1;usedtx=0;maxplaybackrate=48000`);
  }
  for (const m of out.matchAll(/a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\/90000/gi)) {
    const pt = m[1];
    const fmtp = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
    const extra = "x-google-start-bitrate=2500;x-google-min-bitrate=800;x-google-max-bitrate=6000";
    out = fmtp.test(out)
      ? out.replace(fmtp, (_l, rest: string) => `a=fmtp:${pt} ${rest};${extra}`)
      : out.replace(m[0], `${m[0]}\r\na=fmtp:${pt} ${extra}`);
  }
  return out;
}

async function raiseBitrates(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    const p = sender.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    if (sender.track.kind === "video") {
      p.encodings[0].maxBitrate = 4_000_000;
      p.encodings[0].maxFramerate = 30;
      p.degradationPreference = "balanced";
    } else {
      p.encodings[0].maxBitrate = 128_000;
    }
    try {
      await sender.setParameters(p);
    } catch {
      /* some browsers refuse before negotiation is complete; defaults still apply */
    }
  }
}

function mediaError(err: unknown) {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError") return "Kamera/Mikrofon wurde nicht erlaubt.";
  if (name === "NotFoundError") return "Keine Kamera oder kein Mikrofon gefunden.";
  if (name === "NotReadableError") return "Kamera oder Mikrofon wird gerade von einer anderen App benutzt.";
  return "Kamera/Mikrofon konnte nicht gestartet werden.";
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { supabase, me, partner } = useApp();
  const [state, setState] = React.useState<CallState>(IDLE);
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const channel = React.useRef<RealtimeChannel | null>(null);
  const pc = React.useRef<RTCPeerConnection | null>(null);
  const pendingIce = React.useRef<RTCIceCandidateInit[]>([]);
  const timeout = React.useRef<number | undefined>(undefined);
  const ringer = React.useRef<Ringer | null>(null);
  const statsTimer = React.useRef<number | undefined>(undefined);
  const meId = me.id;

  const send = React.useCallback(
    (signal: OutSignal) => {
      void channel.current?.send({ type: "broadcast", event: "call", payload: { ...signal, from: meId } });
    },
    [meId],
  );

  const stopRinging = () => {
    ringer.current?.stop();
    ringer.current = null;
  };

  const cleanup = React.useCallback((reason: string | null) => {
    window.clearTimeout(timeout.current);
    window.clearInterval(statsTimer.current);
    ringer.current?.stop();
    ringer.current = null;
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    pc.current = null;
    pendingIce.current = [];
    setState((s) => {
      s.localStream?.getTracks().forEach((t) => t.stop());
      return { ...s, status: "ended", endedReason: reason, localStream: null, remoteStream: null };
    });
    // Close the "ended" card on its own after a moment.
    window.setTimeout(() => setState((s) => (s.status === "ended" ? IDLE : s)), 2500);
  }, []);

  const createPeer = React.useCallback(
    (stream: MediaStream, callId: string) => {
      const peer = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: "max-bundle" });
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));
      const remote = new MediaStream();
      peer.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
        if (!e.streams[0]) remote.addTrack(e.track);
        setState((s) => ({ ...s, remoteStream: remote }));
      };
      peer.onicecandidate = (e) => {
        if (e.candidate) send({ type: "ice", callId, candidate: e.candidate.toJSON() });
      };
      peer.onconnectionstatechange = () => {
        const cs = peer.connectionState;
        if (cs === "connected") {
          window.clearTimeout(timeout.current);
          setState((s) => (s.status === "active" ? s : { ...s, status: "active", startedAt: Date.now() }));
          void raiseBitrates(peer);
          // Show the real negotiated quality (resolution / fps of what we receive).
          window.clearInterval(statsTimer.current);
          statsTimer.current = window.setInterval(async () => {
            const stats = await peer.getStats();
            let q: string | null = null;
            stats.forEach((r) => {
              if (r.type === "inbound-rtp" && r.kind === "video" && r.frameHeight) q = `${r.frameHeight}p · ${Math.round(r.framesPerSecond ?? 0)} fps`;
            });
            setState((s) => (s.quality === q ? s : { ...s, quality: q }));
          }, 2000);
        }
        if (cs === "failed") {
          send({ type: "hangup", callId });
          cleanup("Verbindung fehlgeschlagen. Euer Netzwerk blockiert vermutlich direkte Verbindungen (siehe README: TURN).");
        }
      };
      pc.current = peer;
      return peer;
    },
    [send, cleanup],
  );

  const flushIce = async () => {
    const peer = pc.current;
    if (!peer?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) {
      try {
        await peer.addIceCandidate(c);
      } catch {
        /* stale candidate */
      }
    }
  };

  // Signaling channel.
  React.useEffect(() => {
    if (!partner) return;
    let cancelled = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      const ch = supabase.channel("ours:call", { config: { private: true, broadcast: { self: false, ack: false } } });
      ch.on("broadcast", { event: "call" }, async ({ payload }) => {
        const sig = payload as Signal;
        if (sig.from === meId) return;
        const cur = stateRef.current;

        if (sig.type === "ring") {
          if (cur.status !== "idle" && cur.status !== "ended") {
            send({ type: "busy", callId: sig.callId });
            return;
          }
          setState({ ...IDLE, status: "incoming", kind: sig.kind, callId: sig.callId, camOn: sig.kind === "video" });
          ringer.current?.stop();
          ringer.current = createRinger("incoming");
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("ours. ♡", { body: sig.kind === "video" ? "📹 Videoanruf" : "📞 Anruf", tag: "ours-call", icon: "/icon" });
            } catch {
              /* notifications need a service worker on some phones */
            }
          }
          window.clearTimeout(timeout.current);
          timeout.current = window.setTimeout(() => {
            if (stateRef.current.status === "incoming") cleanup("Verpasster Anruf");
          }, 45_000);
          return;
        }

        if (sig.callId !== cur.callId) return;

        switch (sig.type) {
          case "accept": {
            if (cur.status !== "outgoing" || !cur.localStream) return;
            stopRinging();
            setState((s) => ({ ...s, status: "connecting" }));
            const peer = createPeer(cur.localStream, sig.callId);
            const offer = await peer.createOffer();
            offer.sdp = tuneSdp(offer.sdp ?? "");
            await peer.setLocalDescription(offer);
            send({ type: "offer", callId: sig.callId, sdp: offer.sdp ?? "" });
            break;
          }
          case "offer": {
            const peer = pc.current;
            if (!peer) return;
            await peer.setRemoteDescription({ type: "offer", sdp: sig.sdp });
            await flushIce();
            const answer = await peer.createAnswer();
            answer.sdp = tuneSdp(answer.sdp ?? "");
            await peer.setLocalDescription(answer);
            send({ type: "answer", callId: sig.callId, sdp: answer.sdp ?? "" });
            break;
          }
          case "answer": {
            await pc.current?.setRemoteDescription({ type: "answer", sdp: sig.sdp });
            await flushIce();
            break;
          }
          case "ice": {
            if (pc.current?.remoteDescription) {
              try {
                await pc.current.addIceCandidate(sig.candidate);
              } catch {
                /* ignore */
              }
            } else pendingIce.current.push(sig.candidate);
            break;
          }
          case "decline":
            cleanup("Abgelehnt");
            break;
          case "busy":
            cleanup("Gerade besetzt");
            break;
          case "cancel":
            cleanup("Verpasster Anruf");
            break;
          case "hangup":
            cleanup("Anruf beendet");
            break;
        }
      });
      ch.subscribe();
      channel.current = ch;
    })();
    return () => {
      cancelled = true;
      if (channel.current) void supabase.removeChannel(channel.current);
      channel.current = null;
    };
  }, [supabase, partner, meId, send, createPeer, cleanup]);

  // Hang up cleanly when the tab is closed.
  React.useEffect(() => {
    const onUnload = () => {
      const s = stateRef.current;
      if (s.callId && s.status !== "idle" && s.status !== "ended") {
        send({ type: s.status === "outgoing" ? "cancel" : s.status === "incoming" ? "decline" : "hangup", callId: s.callId });
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [send]);

  const startCall = React.useCallback(
    async (kind: CallKind) => {
      if (!partner || (stateRef.current.status !== "idle" && stateRef.current.status !== "ended")) return;
      const callId = crypto.randomUUID();
      setState({ ...IDLE, status: "outgoing", kind, callId, camOn: kind === "video" });
      ringer.current = createRinger("outgoing");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(kind, "user"));
      } catch (err) {
        cleanup(mediaError(err));
        return;
      }
      if (stateRef.current.callId !== callId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setState((s) => ({ ...s, localStream: stream }));
      send({ type: "ring", callId, kind });
      timeout.current = window.setTimeout(() => {
        if (stateRef.current.status === "outgoing") {
          send({ type: "cancel", callId });
          cleanup(`${partner.display_name} hat nicht abgenommen`);
        }
      }, 45_000);
    },
    [partner, send, cleanup],
  );

  const accept = React.useCallback(async () => {
    const cur = stateRef.current;
    if (cur.status !== "incoming" || !cur.callId) return;
    stopRinging();
    window.clearTimeout(timeout.current);
    setState((s) => ({ ...s, status: "connecting" }));
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(cur.kind, "user"));
    } catch (err) {
      send({ type: "decline", callId: cur.callId });
      cleanup(mediaError(err));
      return;
    }
    setState((s) => ({ ...s, localStream: stream }));
    createPeer(stream, cur.callId);
    send({ type: "accept", callId: cur.callId });
    timeout.current = window.setTimeout(() => {
      if (stateRef.current.status === "connecting") {
        send({ type: "hangup", callId: cur.callId! });
        cleanup("Verbindung konnte nicht aufgebaut werden.");
      }
    }, 30_000);
  }, [send, createPeer, cleanup]);

  const decline = React.useCallback(() => {
    const cur = stateRef.current;
    if (cur.callId) send({ type: "decline", callId: cur.callId });
    cleanup(null);
    setState(IDLE);
  }, [send, cleanup]);

  const hangup = React.useCallback(() => {
    const cur = stateRef.current;
    if (cur.callId) send({ type: cur.status === "outgoing" ? "cancel" : "hangup", callId: cur.callId });
    cleanup("Anruf beendet");
  }, [send, cleanup]);

  const toggleMic = React.useCallback(() => {
    setState((s) => {
      const on = !s.micOn;
      s.localStream?.getAudioTracks().forEach((t) => (t.enabled = on));
      return { ...s, micOn: on };
    });
  }, []);

  const toggleCam = React.useCallback(() => {
    setState((s) => {
      const on = !s.camOn;
      s.localStream?.getVideoTracks().forEach((t) => (t.enabled = on));
      return { ...s, camOn: on };
    });
  }, []);

  const flipCamera = React.useCallback(async () => {
    const cur = stateRef.current;
    if (cur.kind !== "video" || !cur.localStream) return;
    const facing = cur.facing === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: (mediaConstraints("video", facing).video as MediaTrackConstraints) });
      const track = fresh.getVideoTracks()[0];
      const old = cur.localStream.getVideoTracks()[0];
      const sender = pc.current?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(track);
      if (old) {
        cur.localStream.removeTrack(old);
        old.stop();
      }
      track.enabled = cur.camOn;
      cur.localStream.addTrack(track);
      setState((s) => ({ ...s, facing, localStream: new MediaStream(cur.localStream!.getTracks()) }));
    } catch {
      /* single camera devices */
    }
  }, []);

  const dismiss = React.useCallback(() => setState(IDLE), []);

  const busy = state.status !== "idle" && state.status !== "ended";
  const value: CallContextValue = { state, busy, startCall, accept, decline, hangup, toggleMic, toggleCam, flipCamera, dismiss };

  return (
    <CallContext.Provider value={value}>
      {children}
      {state.status !== "idle" ? <CallScreen /> : null}
    </CallContext.Provider>
  );
}
