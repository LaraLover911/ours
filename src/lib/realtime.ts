import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * supabase.channel(topic) returns an EXISTING channel with the same topic, even
 * one that is still leaving after removeChannel(). Re-subscribing quickly (a
 * re-render, a route change, StrictMode) then silently reuses a dying channel
 * and realtime events stop arriving. This waits until any old channel with the
 * topic is gone and always returns a brand-new one.
 */
export async function freshChannel(
  supabase: SupabaseClient,
  topic: string,
  params?: Parameters<SupabaseClient["channel"]>[1],
): Promise<RealtimeChannel> {
  const full = `realtime:${topic}`;
  const deadline = Date.now() + 3000;
  for (;;) {
    const old = supabase.getChannels().find((c) => c.topic === full);
    if (!old) break;
    try {
      await supabase.removeChannel(old);
    } catch {
      /* already closed */
    }
    if (Date.now() > deadline) {
      // Last resort: forget it locally so a new one can be created.
      const rt = supabase.realtime as unknown as { channels: RealtimeChannel[] };
      rt.channels = rt.channels.filter((c) => c !== old);
      break;
    }
    if (supabase.getChannels().some((c) => c === old)) await new Promise((r) => setTimeout(r, 50));
  }
  return supabase.channel(topic, params);
}

/** Unique topic suffix for channels that only listen to postgres changes. */
export const uniqueTopic = (base: string) => `${base}:${Math.random().toString(36).slice(2, 8)}`;
