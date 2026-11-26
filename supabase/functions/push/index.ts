// ours. — Web Push Edge Function.
//
// Called by (a) the database webhook (header x-ours-webhook = secret from
// push_config) with ids only, or (b) a signed-in member with their JWT for
// {action: "key"} (public VAPID key) and {action: "test"}.
//
// VAPID keys are generated here on first use and stored in push_config, which
// only the service role can read. The private key never leaves the server.
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// New projects expose secret keys as a JSON dictionary; older ones the legacy service role key.
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    const first = keys.default ?? Object.values(keys)[0];
    if (first) return first;
  } catch {
    /* fall through */
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}
const SERVICE_KEY = serviceKey();
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Config = { function_url: string | null; webhook_secret: string; vapid_public: string; vapid_private: string; vapid_subject: string | null };
type Category = "chat" | "call" | "letter" | "game" | "memory" | "daily_question" | "events" | "surprise";
type Note = { title: string; body: string; url: string; tag: string; category: Category; ttl?: number; urgency?: "high" | "normal" | "low"; requireInteraction?: boolean; kind?: string };

async function config(origin?: string | null): Promise<Config> {
  const { data, error } = await admin.from("push_config").select("*").eq("id", 1).single();
  if (error || !data) throw new Error(`push_config: ${error?.message}`);
  const cfg = data as Config;
  // Fill only what is still empty, so two parallel first calls cannot swap keys.
  let changed = false;
  if (!cfg.vapid_public || !cfg.vapid_private) {
    const keys = webpush.generateVAPIDKeys();
    await admin.from("push_config").update({ vapid_public: keys.publicKey, vapid_private: keys.privateKey }).eq("id", 1).is("vapid_public", null);
    changed = true;
  }
  if (!cfg.function_url) {
    await admin.from("push_config").update({ function_url: `${SUPABASE_URL}/functions/v1/push` }).eq("id", 1).is("function_url", null);
    changed = true;
  }
  if (!cfg.vapid_subject && origin?.startsWith("https://")) {
    await admin.from("push_config").update({ vapid_subject: origin }).eq("id", 1).is("vapid_subject", null);
    changed = true;
  }
  if (changed) {
    const { data: again } = await admin.from("push_config").select("*").eq("id", 1).single();
    return again as Config;
  }
  return cfg;
}

async function members() {
  const { data } = await admin.from("profiles").select("id, display_name");
  return (data ?? []) as { id: string; display_name: string }[];
}

async function prefsFor(userId: string) {
  const { data } = await admin.from("notification_prefs").select("categories, previews").eq("user_id", userId).maybeSingle();
  return { categories: (data?.categories ?? {}) as Record<string, boolean>, previews: data?.previews ?? true };
}

async function firstTime(key: string) {
  const { error } = await admin.from("push_log").insert({ event_key: key });
  return !error; // duplicate key => already sent
}

async function deliver(cfg: Config, userId: string, note: Note, onlyEndpoint?: string) {
  let q = admin.from("push_subscriptions").select("*").eq("user_id", userId);
  if (onlyEndpoint) q = q.eq("endpoint", onlyEndpoint);
  const { data: subs } = await q;
  webpush.setVapidDetails(cfg.vapid_subject ?? "mailto:push@ours.invalid", cfg.vapid_public, cfg.vapid_private);
  const payload = JSON.stringify({ title: note.title, body: note.body, url: note.url, tag: note.tag, category: note.category, requireInteraction: !!note.requireInteraction, kind: note.kind ?? note.category });
  const results: { label: string | null; ok: boolean; status?: number; error?: string }[] = [];
  for (const s of subs ?? []) {
    try {
      const res = await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        TTL: note.ttl ?? 60 * 60 * 24,
        urgency: note.urgency ?? "normal",
        topic: note.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
      });
      await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failures: 0, last_error: null }).eq("id", s.id);
      results.push({ label: s.label, ok: true, status: res.statusCode });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const msg = `${status ?? ""} ${(err as Error).message ?? err}`.trim().slice(0, 200);
      if (status === 404 || status === 410 || s.failures >= 9) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else await admin.from("push_subscriptions").update({ failures: s.failures + 1, last_error: msg }).eq("id", s.id);
      results.push({ label: s.label, ok: false, status, error: msg });
    }
  }
  return results;
}

async function notifyPartnerOf(cfg: Config, actor: string, eventKey: string, build: (name: string, previews: boolean) => Note | null) {
  const people = await members();
  const sender = people.find((p) => p.id === actor);
  const sent: unknown[] = [];
  for (const p of people) {
    if (p.id === actor) continue; // never notify yourself
    const prefs = await prefsFor(p.id);
    const note = build(sender?.display_name ?? "Dein Schatz", prefs.previews);
    if (!note || prefs.categories[note.category] === false) continue;
    if (!(await firstTime(`${eventKey}:${p.id}`))) continue;
    sent.push(await deliver(cfg, p.id, note));
  }
  return sent;
}

const short = (s: string | null | undefined, n = 120) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function handleEvent(cfg: Config, type: string, id: string) {
  switch (type) {
    case "chat": {
      const { data: m } = await admin.from("messages").select("id, conversation_id, sender_id, kind, body").eq("id", id).single();
      if (!m) return [];
      const what: Record<string, string> = { image: "📷 Foto", video: "🎬 Video", audio: "🎙️ Sprachnachricht", file: "📎 Datei", snap: "📸 hat dir einen Snap geschickt" };
      return notifyPartnerOf(cfg, m.sender_id, `chat:${id}`, (name, previews) => ({
        title: name,
        body: previews ? (m.kind === "text" ? short(m.body, 180) : (what[m.kind] ?? "Neue Nachricht")) : "Neue Nachricht",
        url: `/chat/${m.conversation_id}`,
        tag: `chat-${m.conversation_id}`,
        category: "chat",
      }));
    }
    case "call":
    case "call_missed": {
      const { data: c } = await admin.from("calls").select("*").eq("id", id).single();
      if (!c) return [];
      const ringing = type === "call";
      if (ringing && Date.now() - new Date(c.created_at).getTime() > 40_000) return [];
      return notifyPartnerOf(cfg, c.caller_id, `${type}:${id}`, (name) =>
        ringing
          ? { title: c.kind === "video" ? `📹 ${name} ruft per Video an` : `📞 ${name} ruft an`, body: "Tippe, um abzunehmen", url: "/", tag: `call-${id}`, category: "call", ttl: 40, urgency: "high", requireInteraction: true, kind: "call" }
          : { title: `Verpasster Anruf von ${name}`, body: c.kind === "video" ? "Videoanruf" : "Anruf", url: "/calls", tag: `call-${id}`, category: "call" },
      );
    }
    case "letter": {
      const { data: l } = await admin.from("love_letters").select("id, author_id, recipient_id, title, open_at").eq("id", id).single();
      if (!l) return [];
      const later = l.open_at && new Date(l.open_at).getTime() > Date.now();
      return notifyPartnerOf(cfg, l.author_id, `letter:${id}`, (name) => ({
        title: "💌 Ein Brief für dich",
        body: later ? `${name} hat dir einen Brief geschrieben. Er öffnet sich später.` : `${name} hat dir einen Brief geschrieben.`,
        url: "/letters",
        tag: `letter-${id}`,
        category: "letter",
      }));
    }
    case "memory": {
      const { data: m } = await admin.from("memories").select("id, created_by, title").eq("id", id).single();
      if (!m) return [];
      return notifyPartnerOf(cfg, m.created_by, `memory:${id}`, (name, previews) => ({
        title: "📸 Neue Erinnerung",
        body: previews ? `${name}: ${short(m.title)}` : `${name} hat eine Erinnerung hinzugefügt.`,
        url: "/memories",
        tag: `memory-${id}`,
        category: "memory",
      }));
    }
    case "answer": {
      const { data: a } = await admin.from("question_answers").select("id, user_id, day").eq("id", id).single();
      if (!a) return [];
      return notifyPartnerOf(cfg, a.user_id, `answer:${id}`, (name) => ({
        title: "✨ Frage des Tages",
        body: `${name} hat geantwortet. Jetzt bist du dran!`,
        url: "/questions",
        tag: `question-${a.day}`,
        category: "daily_question",
      }));
    }
    case "date": {
      const { data: d } = await admin.from("date_ideas").select("id, created_by, title, status").eq("id", id).single();
      if (!d) return [];
      return notifyPartnerOf(cfg, d.created_by, `date:${id}`, (name, previews) => ({
        title: d.status === "geplant" ? "🗓️ Date geplant" : "💡 Neue Date-Idee",
        body: previews ? `${name}: ${short(d.title)}` : `${name} hat etwas für euch geplant.`,
        url: "/dates",
        tag: `date-${id}`,
        category: "events",
      }));
    }
    case "surprise": {
      const { data: p } = await admin.from("pops").select("id, sender_id, teaser").eq("id", id).single();
      if (!p) return [];
      return notifyPartnerOf(cfg, p.sender_id, `surprise:${id}`, (name) => ({
        title: `${name} hat dir etwas geschickt`,
        body: short(p.teaser) || "Öffne ours. ♡",
        url: "/",
        tag: `surprise-${id}`,
        category: "surprise",
      }));
    }
    case "game":
    case "listen": {
      // Invites for Play Together / Listen Together rooms.
      const table = type === "game" ? "game_rooms" : "listening_rooms";
      const { data: r } = await admin.from(table).select("*").eq("id", id).single();
      if (!r) return [];
      const actor = (r as { created_by: string }).created_by;
      return notifyPartnerOf(cfg, actor, `${type}:${id}`, (name) => ({
        title: type === "game" ? `🎮 ${name} will mit dir spielen` : `🎧 ${name} will mit dir Musik hören`,
        body: "Tippe, um beizutreten",
        url: type === "game" ? `/play/${id}` : `/listen/${id}`,
        tag: `${type}-${id}`,
        category: "game",
        urgency: "high",
      }));
    }
    case "calendar": {
      const { data: e } = await admin.from("calendar_events").select("id, created_by, title, starts_at").eq("id", id).single();
      if (!e) return [];
      const when = new Date(e.starts_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      return notifyPartnerOf(cfg, e.created_by, `calendar:${id}`, (name, previews) => ({
        title: "🗓️ Neuer Termin",
        body: previews ? `${name}: ${short(e.title)} · ${when}` : `${name} hat einen Termin eingetragen.`,
        url: "/calendar",
        tag: `calendar-${id}`,
        category: "events",
      }));
    }
    case "voice": {
      const { data: v } = await admin.from("voice_notes").select("id, author_id, recipient_id").eq("id", id).single();
      if (!v?.recipient_id) return [];
      return notifyPartnerOf(cfg, v.author_id, `voice:${id}`, (name) => ({ title: `🎙️ ${name}`, body: "Eine Sprachnotiz für dich", url: "/voice", tag: `voice-${id}`, category: "chat" }));
    }
    case "photo": {
      const { data: ph } = await admin.from("daily_photos").select("id, user_id, day").eq("id", id).single();
      if (!ph) return [];
      return notifyPartnerOf(cfg, ph.user_id, `photo:${id}`, (name) => ({
        title: "📷 Foto des Tages",
        body: `${name} hat das Foto von heute gepostet. Zeig deins, um es zu sehen.`,
        url: "/photo",
        tag: `photo-${ph.day}`,
        category: "memory",
      }));
    }
    case "capsule": {
      const { data: c } = await admin.from("time_capsules").select("id, author_id, open_at").eq("id", id).single();
      if (!c) return [];
      const date = new Date(c.open_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
      return notifyPartnerOf(cfg, c.author_id, `capsule:${id}`, (name) => ({ title: "⏳ Eine Zeitkapsel", body: `${name} hat eine Zeitkapsel vergraben. Sie öffnet sich am ${date}.`, url: "/capsule", tag: `capsule-${id}`, category: "letter" }));
    }
    case "reminder": {
      // Daily reminders (anniversaries, countdowns, capsules) go to both of you.
      const { data: r } = await admin.from("couple_reminders").select("*").eq("id", Number(id)).single();
      if (!r) return [];
      const url = r.kind === "capsule" ? "/capsule" : "/calendar";
      const out: unknown[] = [];
      for (const p of await members()) {
        const prefs = await prefsFor(p.id);
        if (prefs.categories.events === false) continue;
        if (!(await firstTime(`reminder:${id}:${p.id}`))) continue;
        out.push(await deliver(cfg, p.id, { title: r.title, body: r.kind === "countdown" ? "Der Countdown ist abgelaufen ♡" : "ours. ♡", url, tag: `reminder-${id}`, category: "events" }));
      }
      return out;
    }
    case "daily_question": {
      const day = id;
      const people = await members();
      const out: unknown[] = [];
      for (const p of people) {
        const prefs = await prefsFor(p.id);
        if (prefs.categories.daily_question === false) continue;
        const { count } = await admin.from("question_answers").select("id", { count: "exact", head: true }).eq("user_id", p.id).eq("day", day);
        if (count) continue;
        if (!(await firstTime(`daily_question:${day}:${p.id}`))) continue;
        out.push(await deliver(cfg, p.id, { title: "✨ Die Frage des Tages ist da", body: "Was antwortest du heute?", url: "/questions", tag: `question-${day}`, category: "daily_question" }));
      }
      return out;
    }
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: { type?: string; id?: string; action?: string; endpoint?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  try {
    const hook = req.headers.get("x-ours-webhook");
    if (hook) {
      const cfg = await config();
      if (hook !== cfg.webhook_secret) return json({ error: "unauthorized" }, 401);
      if (!body.type || !body.id) return json({ error: "bad request" }, 400);
      return json({ ok: true, sent: await handleEvent(cfg, body.type, String(body.id)) });
    }

    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const { data: auth } = await admin.auth.getUser(jwt);
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: member } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);

    const cfg = await config(req.headers.get("origin"));
    if (body.action === "key") return json({ publicKey: cfg.vapid_public });
    if (body.action === "test") {
      const results = await deliver(cfg, user.id, { title: "ours. ♡", body: "So sehen eure Benachrichtigungen aus.", url: "/notifications", tag: `test-${Date.now()}`, category: "chat" }, body.endpoint);
      return json({ ok: results.some((r) => r.ok), results });
    }
    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message ?? "error" }, 500);
  }
});
