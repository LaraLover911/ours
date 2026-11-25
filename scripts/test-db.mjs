// End-to-end security test against a LOCAL Supabase stack (`npx supabase start`).
// Creates the two invited test users, then checks RLS, sealed content and storage.
// Usage: npm run test:db   (never run against production)
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
const URL = status.API_URL;
const ANON = status.ANON_KEY;
if (!/127\.0\.0\.1|localhost/.test(URL)) throw new Error("Only run this against a local stack");

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};
const client = () => createClient(URL, ANON, { auth: { persistSession: false } });
const PASSWORD = "ours-local-test-123";

async function signIn(email) {
  const c = client();
  let { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    const up = await c.auth.signUp({ email, password: PASSWORD });
    if (up.error) throw up.error;
    ({ error } = await c.auth.signInWithPassword({ email, password: PASSWORD }));
    if (error) throw error;
  }
  const { data } = await c.auth.getUser();
  return { c, id: data.user.id };
}

const A = await signIn("abdullah@ours.local");
const L = await signIn("lara@ours.local");

// Uninvited signup must fail
{
  const { error } = await client().auth.signUp({ email: `stranger${Date.now()}@example.com`, password: PASSWORD });
  check("uninvited email cannot sign up", !!error, error?.message);
}

// Anonymous users see nothing
{
  const anon = client();
  const { data } = await anon.from("messages").select("id");
  const { data: p } = await anon.from("profiles").select("id");
  check("anon sees no messages/profiles", (data ?? []).length === 0 && (p ?? []).length === 0);
}

// Profiles
{
  const { data } = await A.c.from("profiles").select("id, role");
  check("members see both profiles", data?.length === 2);
  const { error } = await A.c.from("profiles").update({ display_name: "Hacked" }).eq("id", L.id).select();
  const { data: l } = await L.c.from("profiles").select("display_name").eq("id", L.id).single();
  check("cannot edit partner profile", l.display_name !== "Hacked", error?.message);
  const { error: roleErr } = await A.c.from("profiles").update({ role: "lara" }).eq("id", A.id);
  check("cannot change own role", !!roleErr);
}

// Chat
const { data: conv } = await A.c.from("conversations").select("id").eq("is_default", true).single();
{
  const { data: m, error } = await A.c.from("messages").insert({ conversation_id: conv.id, body: "hey love" }).select().single();
  check("send message", !error && m, error?.message);
  const { error: spoof } = await A.c.from("messages").insert({ conversation_id: conv.id, body: "fake", sender_id: L.id });
  check("cannot send as partner", !!spoof);
  const { data: edit } = await L.c.from("messages").update({ body: "edited by lara" }).eq("id", m.id).select();
  check("cannot edit partner message", (edit ?? []).length === 0);
  const { data: own } = await A.c.from("messages").update({ body: "hey love ♡" }).eq("id", m.id).select().single();
  check("edit own message sets edited_at", !!own?.edited_at);
  const { data: unread } = await L.c.rpc("unread_counts");
  check("unread counter for partner", unread?.find((u) => u.conversation_id === conv.id)?.unread >= 1);
  const { error: rx } = await L.c.from("message_reactions").insert({ message_id: m.id, emoji: "♡" });
  check("react to message", !rx, rx?.message);
  const { data: del } = await A.c.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id).select().single();
  check("soft delete clears body", del?.body === null && !!del?.deleted_at);
}

// Diary privacy
{
  const { data: priv } = await A.c.from("diary_entries").insert({ body: "secret", visibility: "private" }).select().single();
  const { data: seen } = await L.c.from("diary_entries").select("id").eq("id", priv.id);
  check("private diary entry hidden from partner", (seen ?? []).length === 0);
  const { data: shared } = await A.c.from("diary_entries").insert({ body: "for us", visibility: "ours" }).select().single();
  const { data: edited } = await L.c.from("diary_entries").update({ body: "for us ♡" }).eq("id", shared.id).select();
  check("partner can edit 'ours' entry", edited?.length === 1);
  const { error: vis } = await L.c.from("diary_entries").update({ visibility: "private" }).eq("id", shared.id);
  check("only author changes visibility", !!vis);
}

// Sealed letters
{
  const future = new Date(Date.now() + 86400000).toISOString();
  const { data: letter } = await A.c.from("love_letters").insert({ recipient_id: L.id, category: "miss", title: "tomorrow", body: "not yet", open_at: future }).select().single();
  const { data: early } = await L.c.from("love_letters").select("id, body").eq("id", letter.id);
  check("sealed letter body hidden until open_at", (early ?? []).length === 0);
  const { data: sealed } = await L.c.rpc("sealed_letters");
  check("sealed letter appears as envelope (no body)", sealed?.some((s) => s.id === letter.id && !("body" in s)));
  const { data: now } = await A.c.from("love_letters").insert({ recipient_id: L.id, category: "smile", title: "now", body: "open me" }).select().single();
  await L.c.rpc("mark_letter_opened", { letter_id: now.id });
  const { data: opened } = await L.c.from("love_letters").select("opened_at").eq("id", now.id).single();
  check("recipient opens letter", !!opened?.opened_at);
}

// Daily question hiding
{
  const { data: q } = await A.c.rpc("question_for_day");
  const { data: q2 } = await L.c.rpc("question_for_day");
  check("both get the same daily question", q?.[0]?.question_id === q2?.[0]?.question_id);
  const qid = q[0].question_id;
  await A.c.from("question_answers").insert({ question_id: qid, answer: "abdullah's answer" });
  const { data: before } = await L.c.from("question_answers").select("answer").eq("question_id", qid);
  check("partner answer hidden before answering", (before ?? []).length === 0);
  const { data: prog } = await L.c.rpc("question_progress");
  check("progress shows partner answered", prog?.some((p) => p.user_id === A.id));
  await L.c.from("question_answers").insert({ question_id: qid, answer: "lara's answer" });
  const { data: after } = await L.c.from("question_answers").select("answer").eq("question_id", qid);
  check("both answers visible after answering", after?.length === 2);
}

// Surprises
{
  const { error } = await A.c.from("surprises").insert({ recipient_id: A.id, title: "x", body: "y" });
  check("cannot send surprise to yourself", !!error);
  const { data: s } = await A.c.from("surprises").insert({ recipient_id: L.id, title: "later", body: "boo", reveal_at: new Date(Date.now() + 3600e3).toISOString() }).select().single();
  const { data: hidden } = await L.c.from("surprises").select("id").eq("id", s.id);
  const { data: sealed } = await L.c.rpc("sealed_surprises");
  check("surprise sealed until reveal", (hidden ?? []).length === 0 && sealed?.some((x) => x.id === s.id));
}

// Storage
{
  const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  const own = await A.c.storage.from("media").upload(`${A.id}/memories/test-${Date.now()}.png`, blob, { contentType: "image/png" });
  check("upload into own folder", !own.error, own.error?.message);
  const foreign = await A.c.storage.from("media").upload(`${L.id}/memories/evil-${Date.now()}.png`, blob, { contentType: "image/png" });
  check("cannot upload into partner folder", !!foreign.error);
  const privPath = `${A.id}/private/diary/p-${Date.now()}.png`;
  await A.c.storage.from("media").upload(privPath, blob, { contentType: "image/png" });
  const sig = await L.c.storage.from("media").createSignedUrl(privPath, 60);
  check("partner cannot sign private file", !!sig.error || !sig.data);
  const shared = await L.c.storage.from("media").createSignedUrl(own.data.path, 60);
  check("partner can sign shared file", !!shared.data?.signedUrl);
  const pub = await fetch(`${URL}/storage/v1/object/public/media/${own.data.path}`);
  check("no public URL access", pub.status >= 400, `status ${pub.status}`);
  const bad = await A.c.storage.from("media").upload(`${A.id}/chat/x-${Date.now()}.html`, new Blob(["<script>"], { type: "text/html" }), { contentType: "text/html" });
  check("rejects disallowed mime types", !!bad.error);
}

// Games
{
  const ab = await A.c.from("game_responses").upsert({ game: "aboutme", prompt_key: "food", value: "pizza" });
  check("answer about yourself (upsert)", !ab.error, ab.error?.message);
  const { data: peek } = await L.c.from("game_responses").select("value").eq("game", "aboutme").eq("prompt_key", "food");
  check("partner can't peek at quiz answer before guessing", (peek ?? []).length === 0);
  const g = await L.c.from("game_responses").insert({ game: "guess", prompt_key: "food", value: "sushi" });
  check("guess saved", !g.error, g.error?.message);
  const again = await L.c.from("game_responses").upsert({ game: "guess", prompt_key: "food", value: "pizza" });
  const { data: g2 } = await L.c.from("game_responses").select("value").eq("game", "guess").eq("prompt_key", "food").single();
  check("guess cannot be changed afterwards", !!again.error && g2?.value === "sushi");
  const { data: reveal } = await L.c.from("game_responses").select("value").eq("game", "aboutme").eq("prompt_key", "food");
  check("answer revealed after guessing", reveal?.[0]?.value === "pizza");
}

// Studio pops
{
  const self = await A.c.from("pops").insert({ recipient_id: A.id, kind: "message", body: "hi" });
  check("pop: cannot send to yourself", !!self.error);
  const { data: pop, error } = await A.c.from("pops").insert({ recipient_id: L.id, kind: "jumpscare", teaser: "💌" }).select().single();
  check("pop: send to partner", !error && pop, error?.message);
  const { data: pending } = await L.c.from("pops").select("id").eq("recipient_id", L.id).is("shown_at", null);
  check("pop: recipient sees pending pop", pending?.some((p) => p.id === pop.id));
  const upd = await L.c.from("pops").update({ body: "changed" }).eq("id", pop.id).select();
  check("pop: recipient cannot edit pop", !!upd.error || (upd.data ?? []).length === 0);
  await L.c.rpc("mark_pop_shown", { pop_id: pop.id });
  const { data: seen } = await A.c.from("pops").select("shown_at").eq("id", pop.id).single();
  check("pop: sender sees when it was shown", !!seen?.shown_at);
  const noVideo = await A.c.from("pops").insert({ recipient_id: L.id, kind: "video" });
  check("pop: video needs a file", !!noVideo.error);
}

// Clips
{
  const { data: clip, error } = await A.c.from("clips").insert({ video_path: `${A.id}/clips/x.mp4`, caption: "hi" }).select().single();
  check("clip: post", !error && clip, error?.message);
  const spoof = await L.c.from("clips").insert({ author_id: A.id, video_path: `${A.id}/clips/y.mp4` });
  check("clip: cannot post as partner", !!spoof.error);
  const like = await L.c.from("clip_likes").insert({ clip_id: clip.id });
  check("clip: partner likes", !like.error, like.error?.message);
  const del = await L.c.from("clips").delete().eq("id", clip.id).select();
  check("clip: partner cannot delete", (del.data ?? []).length === 0);
  await A.c.from("clips").delete().eq("id", clip.id);
}

// Status of the day
{
  const t = await L.c.from("profiles").update({ today_thought: "miss you", today_thought_at: new Date().toISOString(), last_activity: "im Chat", last_activity_at: new Date().toISOString() }).eq("id", L.id);
  check("status: set today's thought & activity", !t.error, t.error?.message);
  const hack = await A.c.from("profiles").update({ today_thought: "hacked" }).eq("id", L.id).select();
  check("status: cannot set partner's thought", (hack.data ?? []).length === 0);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed ♡");
process.exit(failures ? 1 : 0);
