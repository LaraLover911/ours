"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient, type TypedClient } from "@/lib/supabase/client";
import type { CoupleSettings, Profile, Update } from "@/types/app";

type TypingState = Record<string, { userId: string; at: number } | undefined>;

type AppContextValue = {
  supabase: TypedClient;
  me: Profile;
  partner: Profile | null;
  profiles: Record<string, Profile>;
  settings: CoupleSettings;
  online: Set<string>;
  partnerOnline: boolean;
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
  const [online, setOnline] = React.useState<Set<string>>(new Set());
  const [typing, setTyping] = React.useState<TypingState>({});
  const [unread, setUnread] = React.useState<Record<string, number>>({});
  const channelRef = React.useRef<RealtimeChannel | null>(null);
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

  // Realtime: presence, typing, profile/settings sync, incoming messages.
  React.useEffect(() => {
    let cancelled = false;
    let dbChannel: RealtimeChannel | null = null;

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const channel = supabase.channel("ours:presence", {
        config: { private: true, presence: { key: me.id } },
      });
      channelRef.current = channel;

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<{ user_id: string; visible: boolean }>();
          const ids = new Set<string>();
          Object.values(state).forEach((metas) => metas.forEach((m) => m.visible !== false && ids.add(m.user_id)));
          setOnline(ids);
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const { conversationId, userId, typing: isTyping } = payload as { conversationId: string; userId: string; typing: boolean };
          if (userId === meRef.current.id) return;
          setTyping((t) => ({ ...t, [conversationId]: isTyping ? { userId, at: Date.now() } : undefined }));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && meRef.current.show_online) {
            await channel.track({ user_id: me.id, visible: document.visibilityState === "visible" });
          }
        });

      dbChannel = supabase
        .channel("ours:db-global")
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
      const ch = channelRef.current;
      if (ch && meRef.current.show_online) {
        void ch.track({ user_id: meRef.current.id, visible: document.visibilityState === "visible" });
      }
      if (document.visibilityState === "visible") void refreshUnread();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      if (dbChannel) void supabase.removeChannel(dbChannel);
      channelRef.current = null;
    };
  }, [supabase, me.id, refreshUnread]);

  // Respect the privacy toggle immediately.
  React.useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    if (me.show_online) void ch.track({ user_id: me.id, visible: document.visibilityState === "visible" });
    else void ch.untrack();
  }, [me.show_online, me.id]);

  // Last seen heartbeat.
  React.useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible" && meRef.current.show_online) {
        void supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", meRef.current.id);
      }
    };
    beat();
    const id = window.setInterval(beat, 60_000);
    return () => window.clearInterval(id);
  }, [supabase]);

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

  const sendTyping = React.useCallback((conversationId: string, isTyping: boolean) => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { conversationId, userId: meRef.current.id, typing: isTyping },
    });
  }, []);

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
  const partnerOnline = Boolean(partner && partner.show_online && online.has(partner.id));

  const value: AppContextValue = {
    supabase,
    me,
    partner,
    profiles,
    settings,
    online,
    partnerOnline,
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
