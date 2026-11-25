"use client";

import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { getDeviceId } from "@/lib/device";
import { CallEngine, IDLE_SNAPSHOT, type CallKind, type CallSnapshot } from "./engine";
import { CallScreen } from "./call-screen";
import { MissedCalls } from "./missed-calls";

export type { CallKind, CallSnapshot } from "./engine";

type CallContextValue = {
  state: CallSnapshot;
  busy: boolean;
  debug: boolean;
  canShareScreen: boolean;
  startCall: (kind: CallKind) => void;
  accept: () => void;
  decline: () => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleScreen: () => void;
  flipCamera: () => void;
  setMinimized: (v: boolean) => void;
  dismiss: () => void;
};

const CallContext = React.createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = React.useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside <CallProvider>");
  return ctx;
}

const noopSubscribe = () => () => {};
const idle = () => IDLE_SNAPSHOT;

/** Debug info is only for developers: dev builds, or a local flag in this browser (localStorage "ours-debug" = "1"). */
function readDebugFlag() {
  if (process.env.NODE_ENV === "development") return true;
  try {
    return localStorage.getItem("ours-debug") === "1";
  } catch {
    return false;
  }
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { supabase, me, partner } = useApp();
  const partnerId = partner?.id ?? null;

  // One engine per (me, partner). It owns ONE long-lived signaling channel, so profile
  // updates (heartbeat, page changes) no longer tear down signaling mid-call.
  const engine = React.useMemo(
    () =>
      partnerId && typeof window !== "undefined"
        ? new CallEngine({
            supabase,
            meId: me.id,
            partnerId,
            deviceId: getDeviceId(),
            notice: (m) => toast(m),
          })
        : null,
    [supabase, me.id, partnerId],
  );
  const partnerName = partner?.display_name ?? "Dein Schatz";
  React.useEffect(() => {
    engine?.setPartnerName(partnerName);
  }, [engine, partnerName]);
  React.useEffect(() => {
    engine?.start();
    // Test hook for the two-browser E2E tests; never present in production builds.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __oursCall?: CallEngine | null }).__oursCall = engine;
    return () => engine?.stop();
  }, [engine]);

  const state = React.useSyncExternalStore(engine?.subscribe ?? noopSubscribe, engine?.getSnapshot ?? idle, idle);
  const debug = React.useSyncExternalStore(noopSubscribe, readDebugFlag, () => false);
  const canShareScreen = React.useSyncExternalStore(noopSubscribe, CallEngine.canShareScreen, () => false);

  const value = React.useMemo<CallContextValue>(
    () => ({
      state,
      busy: state.phase !== "idle" && state.phase !== "ended",
      debug,
      canShareScreen,
      startCall: (kind) => void engine?.startCall(kind),
      accept: () => void engine?.accept(),
      decline: () => engine?.decline(),
      hangup: () => engine?.hangup(),
      toggleMic: () => engine?.toggleMic(),
      toggleCam: () => void engine?.toggleCam(),
      toggleScreen: () => void engine?.toggleScreen(),
      flipCamera: () => void engine?.flipCamera(),
      setMinimized: (v) => engine?.setMinimized(v),
      dismiss: () => engine?.dismiss(),
    }),
    [state, debug, canShareScreen, engine],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {state.phase !== "idle" ? <CallScreen /> : null}
      <MissedCalls />
    </CallContext.Provider>
  );
}
