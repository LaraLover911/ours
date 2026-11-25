"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient, type TypedClient } from "@/lib/supabase/client";
import type { CoupleSettings, Profile, Update } from "@/types/app";
import { activityFor } from "@/lib/activity";
import { uniqueTopic } from "@/lib/realtime";
import { getDeviceId, resetDeviceId } from "@/lib/device";
import { PresenceService, summarize, type ActivityKind, type PartnerPresence, type PresenceSnapshot } from "@/lib/presence/service";

type TypingState = Record<string, { userId: string; at: number } | undefined>;

type AppContextValue = {
  supabase: TypedClient;
  me: Profile;
  partner: Profile | null;
  profiles: Record<string, Profile>;
  settings: CoupleSettings;
  online: Set<string>;
  partnerOnline: boolean;
  /** Live state of the partner (online / idle / away / offline, activity, devices). */
  partnerPresence: PartnerPresence;
  presence: PresenceSnapshot;
  presenceService: PresenceService | null;
  typing: TypingState;
  unread: Record<string, number>;
  unreadTotal: number;
  setActiveConversation: (id: string | null) => void;
  refreshUnread: () => Promise<void>;
  updateMe: (patch: Update<"profiles">) => Promise<{ error: string | null }>;
  updateSettings: (patch: Update<"couple_settings">) => Promise<{ error: string | null }>;
  sendTyping: (conversationId: string, typing: boolean) => void;
  nameOf: (id: string | null | undefined) => string;
};

const AppContext = React.createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

const noopSubscribe = () => () => {};
const EMPTY_PRESENCE: PresenceSnapshot = { connection: "connecting", devices: [], lastSync: null, clockOffset: 0 };
const emptyPresence = () => EMPTY_PRESENCE;

/** Marks what I'm doing right now (chat, call, game, listening) while the component is mounted. */
export function useRealtimeActivity(kind: ActivityKind, enabled = true) {
  const { presenceService } = useApp();
  React.useEffect(() => {
    if (!enabled || !presenceService) return;
    presenceService.setActivity(kind, true);
    return () => presenceService.setActivity(kind, false);
  }, [presenceService, kind, enabled]);
}

export function applyTheme(theme: string, accent: string) {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.accent = accent;
  try {
    localStorage.setItem("ours-theme", theme);
    localStorage.setItem("ours-accent", accent);
  } catch {
    /* private mode */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#141113" : "#FAF7F5");
}

export function AppProvider({
  initialMe,
  initialProfiles,
  initialSettings,
  children,
}: {
  initialMe: Profile;
  initialProfiles: Profile[];
  initialSettings: CoupleSettings;
  children: React.ReactNode;
}) {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [profilesList, setProfilesList] = React.useState(initialProfiles);
  const [settings, setSettings] = React.useState(initialSettings);
  const [typing, setTyping] = React.useState<TypingState>({});
  const [unread, setUnread] = React.useState<Record<string, number>>({});
  const activeConversation = React.useRef<string | null>(null);
  const setActiveConversation = React.useCallback((id: string | null) => {
    activeConversation.current = id;
  }, []);
  const pathname = usePathname();

  const profiles = React.useMemo(() => Object.fromEntries(profilesList.map((p) => [p.id, p])), [profilesList]);
  const me = profiles[initialMe.id] ?? initialMe;
  const partner = profilesList.find((p) => p.id !== me.id) ?? null;
  const meRef = React.useRef(me);
  React.useEffect(() => {
    meRef.current = me;
  }, [me]);

  // Theme + accent follow the profile.
  React.useEffect(() => {
    applyTheme(me.theme, me.accent);
    if (me.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system", me.accent);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [me.theme, me.accent]);

  const refreshUnread = React.useCallback(async () => {
    const { data } = await supabase.rpc("unread_counts");
    if (data) setUnread(Object.fromEntries(data.map((r) => [r.conversation_id, Number(r.unread)])));
  }, [supabase]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch; state is set after the request resolves
    void refreshUnread();
  }, [refreshUnread, pathname]);

  // Presence engine: one per (me, device). Sign out here when ended from another device.
  const presenceService = React.useMemo(
    () =>
      typeof window !== "undefined"
        ? new PresenceService({
            supabase,
            meId: initialMe.id,
            deviceId: getDeviceId(),
            onEnded: () => {
              void supabase.auth.signOut({ scope: "local" }).finally(() => {
                resetDeviceId();
                window.location.replace("/login?ended=1");
              });
            },
          })
        : null,
    [supabase, initialMe.id],
  );
  React.useEffect(() => {
    presenceService?.start();
    // Test hook for the two-browser E2E tests; never present in production builds.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __oursPresence?: PresenceService | null }).__oursPresence = presenceService;
    return () => presenceService?.stop();
  }, [presenceService]);
  const presence = React.useSyncExternalStore(presenceService?.subscribe ?? noopSubscribe, presenceService?.getSnapshot ?? emptyPresence, emptyPresence);
  React.useEffect(() => {
    presenceService?.setSharing(me.show_online, me.share_activity);
  }, [presenceService, me.show_online, me.share_activity]);
  React.useEffect(() => {
    presenceService?.setPlace(activityFor(pathname));
  }, [presenceService, pathname]);

  // Typing indicators ride on the presence channel.
  React.useEffect(() => {
    if (!presenceService) return;
    const off = presenceService.onBroadcast("typing", (payload) => {
      const { conversationId, userId, typing: isTyping } = payload as { conversationId: string; userId: string; typing: boolean };
      if (userId === meRef.current.id) return;
      setTyping((t) => ({ ...t, [conversationId]: isTyping ? { userId, at: Date.now() } : undefined }));
    });
    return () => void off();
  }, [presenceService]);

  // Realtime: profile/settings sync, incoming messages.
  React.useEffect(() => {
    let cancelled = false;
    let dbChannel: RealtimeChannel | null = null;

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      dbChannel = supabase
        .channel(uniqueTopic("ours:db-global"))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, ({ new: row }) => {
          setProfilesList((list) => list.map((p) => (p.id === (row as Profile).id ? (row as Profile) : p)));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "couple_settings" }, ({ new: row }) => {
          setSettings(row as CoupleSettings);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, ({ new: row }) => {
          const msg = row as { id: string; sender_id: string; conversation_id: string; body: string | null; kind: string };
          if (msg.sender_id === meRef.current.id) return;
          setTyping((t) => ({ ...t, [msg.conversation_id]: undefined }));
          if (activeConversation.current !== msg.conversation_id || document.hidden) {
            setUnread((u) => ({ ...u, [msg.conversation_id]: (u[msg.conversation_id] ?? 0) + 1 }));
          }
          if (
            meRef.current.notify_messages &&
            document.hidden &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const body = msg.kind === "text" ? (msg.body ?? "") : msg.kind === "audio" ? "🎙️ Sprachnachricht" : msg.kind === "video" ? "🎬 Video" : "📷 Foto";
            try {
              new Notification(`ours. ♡`, { body: body.slice(0, 120), tag: msg.conversation_id, icon: "/icon" });
            } catch {
              /* some mobile browsers only allow notifications from a service worker */
            }
          }
        })
        .subscribe();
    })();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshUnread();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (dbChannel) void supabase.removeChannel(dbChannel);
    };
  }, [supabase, me.id, refreshUnread]);

  // Last activity: what page each of us is on (only when online status is shared).
  React.useEffect(() => {
    if (!meRef.current.show_online || !meRef.current.share_activity) return;
    const t = window.setTimeout(() => {
      void supabase
        .from("profiles")
        .update({ last_activity: activityFor(pathname), last_activity_at: new Date().toISOString() })
        .eq("id", meRef.current.id)
        .then(); // query builders are lazy: .then() sends the request
    }, 800);
    return () => window.clearTimeout(t);
  }, [supabase, pathname]);

  // Clear stale typing indicators.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        let changed = false;
        const next: TypingState = {};
        for (const [k, v] of Object.entries(t)) {
          if (v && now - v.at < 6000) next[k] = v;
          else if (v) changed = true;
        }
        return changed ? next : t;
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const sendTyping = React.useCallback(
    (conversationId: string, isTyping: boolean) => {
      presenceService?.broadcast("typing", { conversationId, userId: meRef.current.id, typing: isTyping });
    },
    [presenceService],
  );

  const updateMe = React.useCallback(
    async (patch: Update<"profiles">) => {
      const { data, error } = await supabase.from("profiles").update(patch).eq("id", meRef.current.id).select().single();
      if (data) setProfilesList((list) => list.map((p) => (p.id === data.id ? data : p)));
      return { error: error?.message ?? null };
    },
    [supabase],
  );

  const updateSettings = React.useCallback(
    async (patch: Update<"couple_settings">) => {
      const { data, error } = await supabase
        .from("couple_settings")
        .update({ ...patch, updated_by: meRef.current.id })
        .eq("id", 1)
        .select()
        .single();
      if (data) setSettings(data);
      return { error: error?.message ?? null };
    },
    [supabase],
  );

  const nameOf = React.useCallback((id: string | null | undefined) => (id ? (profiles[id]?.display_name ?? "?") : "uns beide"), [profiles]);

  const unreadTotal = Object.values(unread).reduce((a, b) => a + b, 0);
  const online = React.useMemo(() => new Set(presence.devices.map((d) => d.user_id)), [presence.devices]);
  const visiblePartnerId = partner?.show_online ? partner.id : null;
  const partnerPresence = React.useMemo(() => summarize(presence.devices, visiblePartnerId), [presence.devices, visiblePartnerId]);
  const partnerOnline = partnerPresence.online;

  const value: AppContextValue = {
    supabase,
    me,
    partner,
    profiles,
    settings,
    online,
    partnerOnline,
    partnerPresence,
    presence,
    presenceService,
    typing,
    unread,
    unreadTotal,
    setActiveConversation,
    refreshUnread,
    updateMe,
    updateSettings,
    sendTyping,
    nameOf,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
