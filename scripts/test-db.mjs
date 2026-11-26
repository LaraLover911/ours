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

// Calls: history + server-checked state machine
{
  const id = crypto.randomUUID();
  const spoof = await L.c.from("calls").insert({ id: crypto.randomUUID(), caller_id: A.id, callee_id: L.id, kind: "audio" });
  check("call: cannot start a call in the partner's name", !!spoof.error);
  const self = await A.c.from("calls").insert({ id: crypto.randomUUID(), callee_id: A.id, kind: "audio" });
  check("call: cannot call yourself", !!self.error);
  const fake = await A.c.from("calls").insert({ id: crypto.randomUUID(), callee_id: L.id, kind: "audio", status: "connected" });
  check("call: cannot insert a fake connected call", !!fake.error);
  const { error } = await A.c.from("calls").insert({ id, callee_id: L.id, kind: "video" });
  check("call: start a call", !error, error?.message);
  const { data: s1 } = await A.c.rpc("call_set_status", { call_id: id, next_status: "accepted" });
  check("call: caller cannot accept own call", s1 === "ringing", s1);
  const { data: s2 } = await L.c.rpc("call_set_status", { call_id: id, next_status: "accepted" });
  check("call: callee accepts", s2 === "accepted", s2);
  const upd = await L.c.from("calls").update({ status: "ended" }).eq("id", id).select();
  check("call: no direct status edits", !!upd.error || (upd.data ?? []).length === 0);
  await A.c.rpc("call_set_status", { call_id: id, next_status: "connected" });
  await L.c.rpc("call_set_status", { call_id: id, next_status: "ended" });
  const { data: s3 } = await A.c.rpc("call_set_status", { call_id: id, next_status: "connected" });
  check("call: ended stays ended", s3 === "ended", s3);
  const { data: row } = await L.c.from("calls").select("connected_at, ended_at").eq("id", id).single();
  check("call: server timestamps set", !!row?.connected_at && !!row?.ended_at);
  const anon = await client().from("calls").select("id");
  check("call: anon sees no calls", (anon.data ?? []).length === 0);
}

// Our Activity: opt-in, server-written only, never private things
{
  const forged = await A.c.from("activity_events").insert({ user_id: L.id, kind: "message", summary: "fake" });
  check("activity: clients cannot write events", !!forged.error);
  await A.c.from("profiles").update({ share_activity_feed: false }).eq("id", A.id);
  await A.c.from("memories").insert({ title: "nicht teilen" });
  let { data: ev } = await L.c.from("activity_events").select("summary").eq("user_id", A.id);
  check("activity: nothing recorded while off", (ev ?? []).length === 0);
  await A.c.from("profiles").update({ share_activity_feed: true }).eq("id", A.id);
  await A.c.from("memories").insert({ title: "Ausflug" });
  await A.c.from("diary_entries").insert({ body: "ganz privat", visibility: "private" });
  await A.c.from("diary_entries").insert({ body: "für uns", visibility: "ours" });
  ({ data: ev } = await L.c.from("activity_events").select("kind, summary").eq("user_id", A.id));
  check("activity: recorded when on", ev?.some((e) => e.summary.includes("Ausflug")));
  check("activity: private diary never appears", (ev ?? []).filter((e) => e.kind === "diary").length === 1);
  const del = await L.c.from("activity_events").delete().eq("user_id", A.id).select();
  check("activity: partner cannot delete my events", (del.data ?? []).length === 0);
  await A.c.from("profiles").update({ share_activity_feed: false }).eq("id", A.id);
}

// Devices
{
  const id = crypto.randomUUID();
  const hb = await A.c.rpc("device_heartbeat", { info: { id, name: "Test", device_type: "desktop", os: "Linux", battery_level: 250 } });
  check("devices: heartbeat registers", !hb.error && hb.data?.ended === false, hb.error?.message);
  const steal = await L.c.rpc("device_heartbeat", { info: { id, device_type: "mobile" } });
  check("devices: cannot take over the partner's device id", !!steal.error);
  const { data: row } = await A.c.from("device_sessions").select("battery_level").eq("id", id).single();
  check("devices: values are clamped", row?.battery_level === 100);
  const end = await L.c.rpc("device_end", { device_id: id });
  const { data: still } = await A.c.from("device_sessions").select("ended_at").eq("id", id).single();
  check("devices: partner cannot end my device", !end.error && still?.ended_at === null);
}

// Push & integrations: server-only tables stay closed
{
  const cfg = await A.c.from("push_config").select("*");
  check("push: VAPID/config table unreadable", !!cfg.error || (cfg.data ?? []).length === 0);
  const tok = await A.c.from("integration_tokens").select("*");
  check("integrations: token table unreadable", !!tok.error || (tok.data ?? []).length === 0);
  const fakeConn = await A.c.from("integration_connections").insert({ provider: "spotify" });
  check("integrations: connections only via server", !!fakeConn.error);
}


// Play Together: every move is validated by the database
{
  const mk = async (game, by = A) => {
    const { data: id, error } = await by.c.rpc("game_create", { p_game: game });
    if (error) throw error;
    const acc = await (by === A ? L : A).c.rpc("game_accept", { p_room: id });
    if (acc.error) throw acc.error;
    return id;
  };
  const room = async (id) => (await A.c.from("game_rooms").select("*").eq("id", id).single()).data;
  const who = (uid) => (uid === A.id ? A : L);
  const mv = (p, id, move) => p.c.rpc("game_move", { p_room: id, p_move: move });

  const direct = await A.c.from("game_rooms").insert({ game: "tictactoe", guest_id: L.id });
  check("games: rooms cannot be inserted directly", !!direct.error);

  // Tic Tac Toe
  let id = await mk("tictactoe");
  let r = await room(id);
  const first = who(r.turn), second = first === A ? L : A;
  check("tictactoe: other player cannot move first", !!(await mv(second, id, { cell: 0 })).error);
  check("tictactoe: invalid cell rejected", !!(await mv(first, id, { cell: 9 })).error);
  const forged = await first.c.from("game_rooms").update({ winner: first.id, status: "finished" }).eq("id", id).select();
  check("games: board cannot be written directly", (forged.data ?? []).length === 0);
  await mv(first, id, { cell: 0 });
  check("tictactoe: occupied cell rejected", !!(await mv(second, id, { cell: 0 })).error);
  await mv(second, id, { cell: 3 }); await mv(first, id, { cell: 1 }); await mv(second, id, { cell: 4 });
  await mv(first, id, { cell: 2 });
  r = await room(id);
  check("tictactoe: three in a row wins", r.status === "finished" && r.winner === first.id && r.result === "win");
  check("tictactoe: no moves after the end", !!(await mv(second, id, { cell: 8 })).error);
  const { data: re } = await second.c.rpc("game_create", { p_game: "tictactoe", p_rematch_of: id });
  const { data: re2 } = await first.c.rpc("game_create", { p_game: "tictactoe", p_rematch_of: id });
  r = await room(re);
  check("games: rematch from both sides joins one room", re === re2 && r.status === "active");
  check("games: rematch swaps who starts", r.turn === second.id);

  // Connect Four: vertical win
  id = await mk("connect4");
  r = await room(id);
  let p1 = who(r.turn), p2 = p1 === A ? L : A;
  for (let i = 0; i < 3; i++) { await mv(p1, id, { col: 3 }); await mv(p2, id, { col: 4 }); }
  await mv(p1, id, { col: 3 });
  r = await room(id);
  check("connect4: four in a column wins", r.winner === p1.id && r.state.line.length >= 4);
  id = await mk("connect4");
  r = await room(id); p1 = who(r.turn); p2 = p1 === A ? L : A;
  for (let i = 0; i < 6; i++) { const e = await mv(i % 2 ? p2 : p1, id, { col: 0 }); if (e.error) throw e.error; }
  check("connect4: full column rejected", !!(await mv(p1, id, { col: 0 })).error);

  // Memory: the deck is secret
  id = await mk("memory");
  r = await room(id);
  check("memory: no card is visible at the start", r.state.cards.every((c) => c === null));
  const sec = await A.c.from("game_secrets").select("*");
  check("memory: deck is unreadable", !!sec.error || (sec.data ?? []).length === 0);
  p1 = who(r.turn);
  await mv(p1, id, { card: 0 });
  check("memory: same card twice rejected", !!(await mv(p1, id, { card: 0 })).error);
  await mv(p1, id, { card: 1 });
  r = await room(id);
  check("memory: flipped cards are revealed", r.state.cards[0] !== null && r.state.cards[1] !== null);

  // Chess
  id = await mk("chess");
  r = await room(id);
  const W = who(r.state.white), B = W === A ? L : A;
  const sq = (n) => (8 - Number(n[1])) * 8 + n.charCodeAt(0) - 97;
  const c = (p, f, t, promo) => mv(p, id, { from: sq(f), to: sq(t), ...(promo ? { promo } : {}) });
  check("chess: illegal pawn jump rejected", !!(await c(W, "e2", "e5")).error);
  check("chess: knight cannot move like a bishop", !!(await c(W, "g1", "e3")).error);
  check("chess: black cannot move first", !!(await c(B, "e7", "e5")).error);
  // Fool's mate
  await c(W, "f2", "f3"); await c(B, "e7", "e5"); await c(W, "g2", "g4");
  const mate = await c(B, "d8", "h4");
  r = await room(id);
  check("chess: fool's mate is checkmate", !mate.error && r.status === "finished" && r.winner === B.id && r.state.reason === "checkmate", mate.error?.message);
  // Castling, en passant, pinned piece
  id = await mk("chess");
  r = await room(id);
  const W2 = who(r.state.white), B2 = W2 === A ? L : A;
  const c2 = (p, f, t, promo) => mv(p, id, { from: sq(f), to: sq(t), ...(promo ? { promo } : {}) });
  for (const [p, f, t] of [[W2, "e2", "e4"], [B2, "a7", "a6"], [W2, "e4", "e5"], [B2, "d7", "d5"]]) await c2(p, f, t);
  const ep = await c2(W2, "e5", "d6");
  r = await room(id);
  check("chess: en passant captures the pawn", !ep.error && r.state.board[sq("d5")] === "." && r.state.board[sq("d6")] === "P", ep.error?.message);
  for (const [p, f, t] of [[B2, "a6", "a5"], [W2, "g1", "f3"], [B2, "a5", "a4"], [W2, "f1", "e2"], [B2, "a4", "a3"]]) await c2(p, f, t);
  const castle = await c2(W2, "e1", "g1");
  r = await room(id);
  check("chess: short castling moves the rook", !castle.error && r.state.board[sq("f1")] === "R" && r.state.board[sq("g1")] === "K", castle.error?.message);
  await c2(B2, "e7", "e6");
  check("chess: cannot capture own piece", !!(await c2(W2, "d1", "e2")).error);
  const draw = await mv(W2, id, { offer_draw: true });
  const ans = await mv(B2, id, { answer_draw: true });
  r = await room(id);
  check("chess: draw by agreement", !draw.error && !ans.error && r.result === "draw");

  // Reaction Battle: false starts and impossible times
  id = await mk("reaction");
  await mv(A, id, { ready: true }); await mv(L, id, { ready: true });
  r = await room(id);
  const early = await mv(A, id, { tap: true, ms: 150, round: 1 });
  r = await room(id);
  check("reaction: tapping before GO is a false start", !early.error && r.state.log[0]?.winner === L.id);
  const wait = new Date(r.state.go_at).getTime() - Date.now() + 400;
  await new Promise((res) => setTimeout(res, Math.max(0, wait)));
  await mv(A, id, { tap: true, ms: 1, round: 2 });
  await mv(L, id, { tap: true, ms: 250, round: 2 });
  r = await room(id);
  check("reaction: impossibly fast time counts as a false start", r.state.log[1]?.winner === L.id && r.state.log[1]?.taps[A.id] === -1);
  check("reaction: stale round rejected", !!(await mv(A, id, { tap: true, ms: 300, round: 1 })).error);

  // Couple Quiz: answers stay hidden until both answered
  id = await mk("quiz");
  await mv(A, id, { self: 1, guess: 2 });
  r = await room(id);
  const { data: log } = await L.c.from("game_moves").select("move").eq("room_id", id);
  check("quiz: my answer is hidden from the partner", !JSON.stringify(r.state).includes('"self"') && !JSON.stringify(log).includes('"self"'));
  check("quiz: cannot answer twice", !!(await mv(A, id, { self: 0, guess: 0 })).error);
  await mv(L, id, { self: 2, guess: 1 });
  r = await room(id);
  check("quiz: both right guesses score", r.state.scores[A.id] === 1 && r.state.scores[L.id] === 1 && r.state.round === 1);

  // Guess My Answer
  id = await mk("guess");
  r = await room(id);
  const ans1 = who(r.state.answerer), gs1 = ans1 === A ? L : A;
  await mv(ans1, id, { text: "Pizza" }); await mv(gs1, id, { text: "pizza!" });
  check("guess: only the answerer judges", !!(await mv(gs1, id, { match: true })).error);
  await mv(ans1, id, { match: true });
  r = await room(id);
  check("guess: judged guess scores for the guesser", r.state.scores[gs1.id] === 1 && r.state.answerer === gs1.id);

  // Truth or Dare: only the partner confirms a dare
  id = await mk("truthordare");
  r = await room(id);
  const act = who(r.turn), oth = act === A ? L : A;
  await mv(act, id, { pick: "dare" });
  check("truthordare: cannot confirm your own dare", !!(await mv(act, id, { done: true })).error);
  await mv(oth, id, { done: true });
  r = await room(id);
  check("truthordare: confirmed dare scores", r.state.scores[act.id] === 1 && r.turn === oth.id);

  // Date challenge & leaving
  id = await mk("datechallenge");
  await mv(A, id, { accept: true }); await mv(L, id, { accept: true });
  check("datechallenge: cannot tick off twice", !(await mv(A, id, { done: true })).error && !!(await mv(A, id, { done: true })).error);
  await mv(L, id, { done: true });
  r = await room(id);
  check("datechallenge: done together", r.result === "coop");

  id = await mk("chess");
  await A.c.rpc("game_leave", { p_room: id });
  r = await room(id);
  check("games: giving up hands the win to the partner", r.winner === L.id);
  const { data: board } = await A.c.rpc("game_scoreboard");
  check("games: scoreboard counts", (board ?? []).some((b) => b.game === "chess" && b.played >= 1));
}

// Listen Together: one clock, a state machine, validated items
{
  const { data: room, error: ce } = await A.c.rpc("listen_create", { p_name: "Abendmusik" });
  check("listen: create room", !ce && !!room, ce?.message);
  const add = (who, ref, provider = "youtube", extra = {}) =>
    who.c.rpc("listen_add", { p_room: room, p_provider: provider, p_ref: ref, p_title: "Song " + ref, p_artist: null, p_thumb: null, p_duration_ms: 200000, p_dedication: null, ...extra });
  const bad = await add(A, "../../etc/passwd");
  check("listen: invalid YouTube id rejected", !!bad.error);
  const badSp = await add(A, "spotify:track:short", "spotify");
  check("listen: invalid Spotify uri rejected", !!badSp.error);
  const badThumb = await add(A, "dQw4w9WgXcQ", "youtube", { p_thumb: "javascript:alert(1)" });
  const { data: q0 } = await A.c.from("listening_queue").select("thumb").eq("id", badThumb.data).single();
  check("listen: non-https thumbnails dropped", !badThumb.error && q0?.thumb === null);
  const s2 = await add(L, "aaaaaaaaaaa", "youtube", { p_dedication: "für dich ♡" });
  const s3 = await add(A, "spotify:track:4cOdK2wGLETKBW3PvgPWqT", "spotify");
  let { data: r } = await A.c.from("listening_rooms").select("*").eq("id", room).single();
  check("listen: first song becomes current, paused", r.current_item === badThumb.data && r.status === "paused");
  const direct = await A.c.from("listening_rooms").update({ status: "playing" }).eq("id", room).select();
  check("listen: room cannot be written directly", (direct.data ?? []).length === 0);
  await L.c.rpc("listen_control", { p_room: room, p_action: "play" });
  await new Promise((res) => setTimeout(res, 1200));
  await A.c.rpc("listen_control", { p_room: room, p_action: "pause" });
  ({ data: r } = await A.c.from("listening_rooms").select("*").eq("id", room).single());
  check("listen: pause stores the server-side position", r.status === "paused" && r.base_pos_ms >= 1000 && r.base_pos_ms < 3000, String(r.base_pos_ms));
  await A.c.rpc("listen_control", { p_room: room, p_action: "play" });
  const n1 = await A.c.rpc("listen_control", { p_room: room, p_action: "next", p_expect: badThumb.data });
  const n2 = await L.c.rpc("listen_control", { p_room: room, p_action: "next", p_expect: badThumb.data });
  ({ data: r } = await A.c.from("listening_rooms").select("*").eq("id", room).single());
  check("listen: double skip from both devices only skips once", !n1.error && n2.data?.ignored === true && r.current_item === s2.data && r.status === "playing");
  const rm = await A.c.rpc("listen_remove", { p_item: s2.data });
  check("listen: current song cannot be removed", !!rm.error);
  await A.c.rpc("listen_control", { p_room: room, p_action: "ended", p_expect: s2.data });
  await A.c.rpc("listen_control", { p_room: room, p_action: "ended", p_expect: s3.data });
  ({ data: r } = await A.c.from("listening_rooms").select("*").eq("id", room).single());
  check("listen: empty queue ends idle", r.status === "idle" && r.current_item === null);
  const { data: hist } = await A.c.from("listening_history").select("reason, dedication").eq("room_id", room);
  check("listen: history keeps skips, ends and dedications", hist?.length === 3 && hist.some((h) => h.dedication === "für dich ♡") && hist.some((h) => h.reason === "skipped"));
  const { data: stats } = await L.c.rpc("listen_stats");
  check("listen: stats", stats?.dedications >= 1);
  const sp = await A.c.from("spotify_connections").insert({ user_id: A.id, spotify_user_id: "x" });
  check("listen: spotify connections only via server", !!sp.error);
}

// Mochi: server-side needs, economy and quests
{
  const st = await A.c.rpc("pet_state");
  check("pet: state is created once and readable", !st.error && st.data?.pet?.name === "Mochi", st.error?.message);
  const both = await Promise.all([A.c.rpc("pet_state"), L.c.rpc("pet_state")]);
  const { data: pets } = await A.c.from("pets").select("id");
  check("pet: exactly one shared pet", pets?.length === 1 && both.every((b) => !b.error));
  const forge = await A.c.from("pets").update({ coins: 99999 }).eq("id", pets[0].id).select();
  check("pet: coins cannot be written directly", (forge.data ?? []).length === 0);
  const before = st.data.pet.coins;
  const fed = await A.c.rpc("pet_act", { p_action: "feed", p_item: "apple" });
  check("pet: feeding uses an apple and pays a little", !fed.error && fed.data.pet.coins === before + 2, fed.error?.message);
  const fake = await A.c.rpc("pet_act", { p_action: "feed", p_item: "ball" });
  check("pet: a toy is not food", !!fake.error);
  const noToy = await A.c.rpc("pet_act", { p_action: "play", p_item: "feather" });
  check("pet: cannot play with a toy you don't own", !!noToy.error);
  const rich = await A.c.rpc("pet_buy", { p_item: "room_garden" });
  check("pet: stage-locked items cannot be bought early", !!rich.error);
  const poor = await A.c.rpc("pet_buy", { p_item: "bed", p_qty: 10 });
  check("pet: cannot buy without enough coins", !!poor.error && /Münzen/.test(poor.error.message));
  const buy = await A.c.rpc("pet_buy", { p_item: "plant" });
  check("pet: buying deducts coins", !buy.error && buy.data.pet.coins === fed.data.pet.coins - 30, buy.error?.message);
  const place = await L.c.rpc("pet_furnish", { p_action: "place", p_item: "plant", p_room: "living", p_x: 0.3, p_z: -0.2, p_rot: 90 });
  check("pet: partner can place the plant", !place.error, place.error?.message);
  const again = await L.c.rpc("pet_furnish", { p_action: "place", p_item: "plant", p_room: "living", p_x: 0, p_z: 0, p_rot: 0 });
  check("pet: cannot place more than you own", !!again.error);
  const locked = await A.c.rpc("pet_furnish", { p_action: "place", p_item: "plant", p_room: "bedroom", p_x: 0, p_z: 0, p_rot: 0 });
  check("pet: locked room rejected", !!locked.error);
  const out = await L.c.rpc("pet_furnish", { p_action: "move", p_id: place.data?.id, p_x: 5, p_z: 0, p_rot: 0 });
  check("pet: furniture stays inside the room", !!out.error);
  // Quests: feed twice -> claim once (make Mochi hungry again first)
  execSync(`docker exec supabase_db_ours psql -U postgres -qc "update public.pet_stats set hunger = 40"`);
  const fed2 = await A.c.rpc("pet_act", { p_action: "feed", p_item: "apple" });
  check("pet: full Mochi refuses food, hungry Mochi eats", !fed2.error, fed2.error?.message);
  const c1 = await A.c.rpc("pet_claim", { p_quest: "feed" });
  const c2 = await A.c.rpc("pet_claim", { p_quest: "feed" });
  check("pet: daily quest pays once", !c1.error && !!c2.error, c1.error?.message);
  const c3 = await A.c.rpc("pet_claim", { p_quest: "play" });
  check("pet: unfinished quest cannot be claimed", !!c3.error);
  // Mini game: at most 3 paid rounds a day, max 20 coins
  const r1 = await A.c.rpc("pet_minigame", { p_score: 200 });
  await A.c.rpc("pet_minigame", { p_score: 60 });
  await A.c.rpc("pet_minigame", { p_score: 60 });
  const r4 = await A.c.rpc("pet_minigame", { p_score: 60 });
  check("pet: mini game reward is capped", r1.data?.reward === 20 && r4.data?.reward === 0, `${r1.data?.reward}/${r4.data?.reward}`);
  const cheat = await A.c.rpc("pet_minigame", { p_score: 100000 });
  check("pet: impossible score rejected", !!cheat.error);
  // Decay over 4 days never goes below the floor, mood is gentle
  execSync(`docker exec supabase_db_ours psql -U postgres -qc "update public.pet_stats set measured_at = now() - interval '96 hours'; update public.pets set last_cared_at = now() - interval '96 hours', sleeping = false"`);
  const later = await L.c.rpc("pet_state");
  const v = later.data.stats;
  check("pet: needs decay but never below the floor", v.hunger >= 12 && v.joy >= 12 && v.clean >= 15 && v.energy >= 15 && v.hunger < 50, JSON.stringify(v));
  check("pet: after a long absence Mochi missed you (no sickness, no death)", later.data.mood === "missed_you");
  const back = await L.c.rpc("pet_act", { p_action: "pet" });
  check("pet: reunion cheers Mochi up", !back.error && back.data.stats.joy > v.joy + 20 && back.data.mood !== "missed_you", back.error?.message);
}

// ---------------------------------------------------------------------------
// Integrations: the weather place is yours to write, readable by both
{
  await A.c.from("weather_places").delete().eq("user_id", A.id);
  const mine = await A.c.from("weather_places").insert({ user_id: A.id, name: "Berlin", lat: 52.52, lon: 13.4 });
  check("weather: I can save my own place", !mine.error, mine.error?.message);
  const other = await A.c.from("weather_places").insert({ user_id: L.id, name: "Fake", lat: 1, lon: 1 });
  check("weather: I cannot set the partner's place", !!other.error);
  const read = await L.c.from("weather_places").select("name").eq("user_id", A.id).maybeSingle();
  check("weather: partner can read my city", read.data?.name === "Berlin");
  const bad = await A.c.from("weather_places").update({ lat: 200 }).eq("user_id", A.id).select();
  check("weather: coordinates are validated", !!bad.error);
  await A.c.from("weather_places").delete().eq("user_id", A.id);
}

// ---------------------------------------------------------------------------
// Couple features
{
  const psql = (q) => execSync(`docker exec supabase_db_ours psql -U postgres -tAqc "${q}"`).toString().trim();
  // Wishlist: the owner never learns who reserved what
  const { data: wish } = await A.c.from("wishlist_items").insert({ title: "Kamera" }).select().single();
  const self = await A.c.from("wishlist_claims").insert({ item_id: wish.id });
  check("wishlist: cannot reserve my own wish", !!self.error);
  const claim = await L.c.from("wishlist_claims").insert({ item_id: wish.id });
  check("wishlist: partner can reserve it", !claim.error, claim.error?.message);
  const peek = await A.c.from("wishlist_claims").select("*").eq("item_id", wish.id);
  check("wishlist: owner cannot see the reservation", (peek.data ?? []).length === 0);
  const edit = await L.c.from("wishlist_items").update({ title: "hacked" }).eq("id", wish.id).select();
  check("wishlist: partner cannot edit my wish", (edit.data ?? []).length === 0);

  // Time capsule: sealed until it opens
  const soon = new Date(Date.now() + 2 * 3600e3).toISOString();
  const cap = await A.c.rpc("capsule_create", { p_title: "Für uns in einem Jahr", p_open_at: soon, p_body: "geheim", p_media: [] });
  check("capsule: created", !cap.error, cap.error?.message);
  const early = await L.c.from("time_capsule_contents").select("body").eq("capsule_id", cap.data);
  const earlyA = await A.c.from("time_capsule_contents").select("body").eq("capsule_id", cap.data);
  check("capsule: content sealed for both before open_at", (early.data ?? []).length === 0 && (earlyA.data ?? []).length === 0);
  const tooSoon = await A.c.rpc("capsule_create", { p_title: "x", p_open_at: new Date(Date.now() + 60e3).toISOString(), p_body: "y" });
  check("capsule: must open at least an hour later", !!tooSoon.error);
  const foreignMedia = await A.c.rpc("capsule_create", { p_title: "x", p_open_at: soon, p_body: "y", p_media: [`${L.id}/capsule/a.jpg`] });
  check("capsule: only own uploads inside", !!foreignMedia.error);
  psql(`update public.time_capsules set created_at = now() - interval '3 hours', open_at = now() - interval '1 minute' where id = '${cap.data}'`);
  const opened = await L.c.from("time_capsule_contents").select("body").eq("capsule_id", cap.data).single();
  check("capsule: readable once open", opened.data?.body === "geheim");
  const direct = await A.c.from("time_capsules").insert({ title: "x", open_at: soon });
  check("capsule: no direct inserts (content must go with it)", !!direct.error);

  // Photo of the day: partner's photo hidden until you post yours
  psql("delete from public.daily_photos");
  const pa = await A.c.from("daily_photos").insert({ path: `${A.id}/photo/a.webp`, caption: "Kaffee" });
  check("photo: posting my photo works", !pa.error, pa.error?.message);
  const hidden = await L.c.from("daily_photos").select("*");
  check("photo: partner's photo hidden before posting", (hidden.data ?? []).length === 0);
  const st = await L.c.rpc("daily_photo_status");
  check("photo: but you can see that it was posted", st.data?.find((r) => r.user_id === A.id)?.posted === true);
  const wrongPath = await L.c.from("daily_photos").insert({ path: `${A.id}/photo/l.webp` });
  check("photo: path must be in your own folder", !!wrongPath.error);
  await L.c.from("daily_photos").insert({ path: `${L.id}/photo/l.webp` });
  const both = await L.c.from("daily_photos").select("*");
  check("photo: revealed after posting", (both.data ?? []).length === 2);
  const twice = await A.c.from("daily_photos").insert({ path: `${A.id}/photo/b.webp` });
  check("photo: one per day", !!twice.error);

  // Voice notes
  const memo = await A.c.from("voice_notes").insert({ recipient_id: null, path: `${A.id}/private/voice/m.webm`, duration_ms: 3000 }).select().single();
  check("voice: private memo saved", !memo.error, memo.error?.message);
  const leaky = await A.c.from("voice_notes").insert({ recipient_id: null, path: `${A.id}/voice/m.webm`, duration_ms: 3000 });
  check("voice: private memo must live in the private folder", !!leaky.error);
  const toL = await A.c.from("voice_notes").insert({ recipient_id: L.id, path: `${A.id}/voice/n.webm`, duration_ms: 4000 }).select().single();
  const lSees = await L.c.from("voice_notes").select("id");
  check("voice: partner sees notes to them, not my memos", (lSees.data ?? []).length === 1 && lSees.data[0].id === toL.data.id);
  await L.c.rpc("voice_listened", { p_id: toL.data.id });
  const heard = await A.c.from("voice_notes").select("listened_at").eq("id", toL.data.id).single();
  check("voice: listened is shown to the sender", !!heard.data?.listened_at);

  // Shared notes: conflicting saves are detected
  const { data: note } = await A.c.from("shared_notes").insert({ title: "Einkauf", body: "Milch" }).select().single();
  const s1 = await A.c.rpc("note_save", { p_id: note.id, p_title: "Einkauf", p_body: "Milch, Brot", p_version: note.version });
  const s2 = await L.c.rpc("note_save", { p_id: note.id, p_title: "Einkauf", p_body: "Milch, Eier", p_version: note.version });
  check("notes: first save wins, second sees a conflict", s1.data?.conflict === false && s2.data?.conflict === true && s2.data.note.body === "Milch, Brot");
  const sneak = await L.c.from("shared_notes").update({ body: "x" }).eq("id", note.id).select();
  check("notes: body only changes through the versioned save", !!sneak.error || (sneak.data ?? []).length === 0);

  // Daily challenge: the same for both, done once per day
  const ca = await A.c.rpc("challenge_today");
  const cl = await L.c.rpc("challenge_today");
  check("challenge: same challenge for both", ca.data?.id && ca.data.id === cl.data?.id);
  await A.c.rpc("challenge_complete", { p_note: "erledigt" });
  await A.c.rpc("challenge_complete", { p_note: "nochmal" });
  const done = await L.c.from("challenge_done").select("*").eq("user_id", A.id);
  check("challenge: once per day (note updated)", done.data?.length === 1 && done.data[0].note === "nochmal");

  // Anniversary + countdown reminders
  const oldStart = psql("select coalesce(start_date::text, '') from public.couple_settings limit 1");
  psql("delete from public.couple_reminders; update public.couple_settings set start_date = (public.berlin_today() - interval '2 years')::date");
  await A.c.from("countdowns").insert({ title: "Urlaub", target_at: new Date().toISOString(), emoji: "✈️" });
  const made = psql("select public.couple_daily()");
  psql("select public.couple_daily()");
  const rem = await L.c.from("couple_reminders").select("kind, title");
  check("reminders: anniversary + countdown, once per day", rem.data?.length === Number(made) && rem.data.some((r) => r.kind === "anniversary" && r.title.startsWith("2 Jahre")) && rem.data.some((r) => r.kind === "countdown"), JSON.stringify(rem.data));
  const fakeRem = await A.c.from("couple_reminders").insert({ day: "2030-01-01", kind: "countdown", ref: "x", title: "x" });
  check("reminders: cannot be written by the app", !!fakeRem.error);

  // Watchlist and map basics
  const w = await A.c.from("watch_items").insert({ title: "Amélie", kind: "movie", tmdb_id: "movie:194", poster_url: "https://evil.example/p.jpg" });
  check("watchlist: posters only from TMDB's image host", !!w.error);
  const place = await A.c.from("places").insert({ name: "Paris", lat: 48.85, lon: 2.35, kind: "dream" });
  check("map: places can be added", !place.error, place.error?.message);
  const badPlace = await A.c.from("places").insert({ name: "Nowhere", lat: 120, lon: 0 });
  check("map: coordinates validated", !!badPlace.error);
  // Storage: sealed media stays sealed in the storage API too (not only in the tables)
  {
    psql("delete from public.daily_photos");
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const capPath = `${A.id}/capsule/c-${Date.now()}.png`;
    await A.c.storage.from("media").upload(capPath, png, { contentType: "image/png" });
    await A.c.from("uploads").insert({ path: capPath, kind: "image", mime: "image/png", size: 4 }).then(() => null, () => null);
    const sealedCap = await A.c.rpc("capsule_create", { p_title: "Bild für später", p_open_at: new Date(Date.now() + 2 * 3600e3).toISOString(), p_body: "mit Foto", p_media: [capPath] });
    check("storage: capsule with own photo created", !sealedCap.error, sealedCap.error?.message);
    const listCap = await L.c.storage.from("media").list(`${A.id}/capsule`);
    check("storage: partner cannot list the capsule folder", (listCap.data ?? []).length === 0);
    const signCap = await L.c.storage.from("media").createSignedUrl(capPath, 60);
    check("storage: partner cannot sign capsule media before it opens", !signCap.data?.signedUrl);
    const dlCap = await L.c.storage.from("media").download(capPath);
    check("storage: partner cannot download capsule media before it opens", !!dlCap.error || !dlCap.data);
    const upRows = await L.c.from("uploads").select("path").eq("path", capPath);
    check("storage: upload index hides sealed paths", (upRows.data ?? []).length === 0);
    const ownCap = await A.c.storage.from("media").createSignedUrl(capPath, 60);
    check("storage: author can still see their own capsule media", !!ownCap.data?.signedUrl);
    psql(`update public.time_capsules set created_at = now() - interval '3 hours', open_at = now() - interval '1 minute' where id = '${sealedCap.data}'`);
    const signOpen = await L.c.storage.from("media").createSignedUrl(capPath, 60);
    check("storage: capsule media readable once open", !!signOpen.data?.signedUrl, signOpen.error?.message);

    const phPath = `${A.id}/photo/p-${Date.now()}.png`;
    await A.c.storage.from("media").upload(phPath, png, { contentType: "image/png" });
    await A.c.from("daily_photos").insert({ path: phPath });
    const signPh = await L.c.storage.from("media").createSignedUrl(phPath, 60);
    check("storage: partner cannot open today's photo before posting", !signPh.data?.signedUrl);
    const listPh = await L.c.storage.from("media").list(`${A.id}/photo`);
    check("storage: partner cannot list the photo folder", (listPh.data ?? []).length === 0);
    const lPath = `${L.id}/photo/l-${Date.now()}.png`;
    await L.c.storage.from("media").upload(lPath, png, { contentType: "image/png" });
    await L.c.from("daily_photos").insert({ path: lPath });
    const signPh2 = await L.c.storage.from("media").createSignedUrl(phPath, 60);
    check("storage: photo opens after posting your own", !!signPh2.data?.signedUrl, signPh2.error?.message);

    const popPath = `${A.id}/studio/s-${Date.now()}.png`;
    await A.c.storage.from("media").upload(popPath, png, { contentType: "image/png" });
    const signPop0 = await L.c.storage.from("media").createSignedUrl(popPath, 60);
    check("storage: studio media hidden until it is sent", !signPop0.data?.signedUrl);
    await A.c.from("pops").insert({ recipient_id: L.id, kind: "image", media_path: popPath });
    const signPop = await L.c.storage.from("media").createSignedUrl(popPath, 60);
    check("storage: recipient can open the pop media", !!signPop.data?.signedUrl, signPop.error?.message);
    psql("delete from public.pops");
    await A.c.storage.from("media").remove([capPath, phPath, popPath]);
    await L.c.storage.from("media").remove([lPath]);
  }
  const evilImg = await A.c.from("moodboard_items").insert({ kind: "web", url: "https://tracker.example.com/pixel.gif" });
  check("moodboard: web images only from the search providers", !!evilImg.error);
  const evilCredit = await A.c.from("moodboard_items").insert({ kind: "web", url: "https://images.unsplash.com/photo-1", credit: { text: "x", url: "javascript:alert(1)" } });
  check("moodboard: credit links must be https", !!evilCredit.error);
  // Snaps: open once, then gone
  {
    const jpg = new Blob([new Uint8Array([255, 216, 255, 224])], { type: "image/jpeg" });
    const snapPath = `${A.id}/snaps/s-${Date.now()}.jpg`;
    const up = await A.c.storage.from("media").upload(snapPath, jpg, { contentType: "image/jpeg" });
    check("snaps: sender uploads into their snaps folder", !up.error, up.error?.message);
    const plain = await A.c.from("messages").insert({ conversation_id: conv.id, kind: "image", attachment_path: snapPath });
    check("snaps: snap files cannot be sent as normal photos", !!plain.error);
    const noMedia = await A.c.from("messages").insert({ conversation_id: conv.id, kind: "snap", attachment_path: snapPath, attachment_meta: {} });
    check("snaps: a snap must say photo or video", !!noMedia.error);
    const wrongFolder = await A.c.from("messages").insert({ conversation_id: conv.id, kind: "snap", attachment_path: `${A.id}/chat/x.jpg`, attachment_meta: { media: "image" } });
    check("snaps: only from the snaps folder", !!wrongFolder.error);
    const snap = await A.c.from("messages").insert({ conversation_id: conv.id, kind: "snap", body: "hi", attachment_path: snapPath, attachment_meta: { media: "image", seconds: 5 }, opened_at: new Date().toISOString() }).select().single();
    check("snaps: snap sent", !snap.error, snap.error?.message);
    check("snaps: cannot be sent as already opened", snap.data?.opened_at === null);
    const early = await L.c.storage.from("media").createSignedUrl(snapPath, 60);
    check("snaps: recipient cannot load the file before opening", !early.data?.signedUrl);
    const peek = await L.c.storage.from("media").list(`${A.id}/snaps`);
    check("snaps: recipient cannot list the snaps folder", (peek.data ?? []).length === 0);
    const cheat = await L.c.from("messages").update({ opened_at: null }).eq("id", snap.data.id).select();
    check("snaps: open state cannot be changed by hand", !!cheat.error || (cheat.data ?? []).length === 0);
    const editCap = await A.c.from("messages").update({ body: "changed" }).eq("id", snap.data.id).select();
    check("snaps: caption cannot be edited", !!editCap.error);
    const selfOpen = await A.c.rpc("open_snap", { p_id: snap.data.id });
    check("snaps: sender cannot open their own snap", !!selfOpen.error);
    const opened = await L.c.rpc("open_snap", { p_id: snap.data.id });
    check("snaps: recipient opens it", !opened.error && !!opened.data, opened.error?.message);
    const again = await L.c.rpc("open_snap", { p_id: snap.data.id });
    check("snaps: opening twice keeps the first time", again.data === opened.data);
    const view = await L.c.storage.from("media").createSignedUrl(snapPath, 60);
    check("snaps: recipient can load it right after opening", !!view.data?.signedUrl, view.error?.message);
    psql(`update public.messages set opened_at = now() - interval '11 minutes' where id = '${snap.data.id}'`);
    const late = await L.c.storage.from("media").createSignedUrl(snapPath, 60);
    check("snaps: gone for the recipient 10 minutes after opening", !late.data?.signedUrl);
    psql(`update public.messages set opened_at = now() where id = '${snap.data.id}'`);
    const del = await L.c.storage.from("media").remove([snapPath]);
    const left = psql(`select count(*) from storage.objects where name = '${snapPath}'`);
    check("snaps: recipient deletes the file after watching", !del.error && left === "0", del.error?.message ?? left);
    const snap2Path = `${A.id}/snaps/s2-${Date.now()}.jpg`;
    await A.c.storage.from("media").upload(snap2Path, jpg, { contentType: "image/jpeg" });
    await A.c.from("messages").insert({ conversation_id: conv.id, kind: "snap", attachment_path: snap2Path, attachment_meta: { media: "image" } });
    await L.c.storage.from("media").remove([snap2Path]);
    const left2 = psql(`select count(*) from storage.objects where name = '${snap2Path}'`);
    check("snaps: recipient cannot delete an unopened snap", left2 === "1", left2);
    await A.c.storage.from("media").remove([snap2Path]);
    psql("delete from public.messages where kind = 'snap'");
  }
  // Clips: when and where (place name only)
  {
    const clip = await A.c.from("clips").insert({ video_path: `${A.id}/clips/c.mp4`, place: "Kreuzberg, Berlin, Deutschland", recorded_at: "2026-11-20T17:03:12Z" }).select().single();
    check("clips: place and recording time saved", !clip.error && clip.data.place === "Kreuzberg, Berlin, Deutschland", clip.error?.message);
    const longPlace = await A.c.from("clips").insert({ video_path: `${A.id}/clips/d.mp4`, place: "x".repeat(200) });
    check("clips: place length limited", !!longPlace.error);
    psql("delete from public.clips");
  }
  // Table privileges
  const trunc = psql("select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')");
  check("no TRUNCATE/TRIGGER/REFERENCES for client roles", trunc === "0", trunc);

  psql(`update public.couple_settings set start_date = ${oldStart ? `'${oldStart}'` : "null"}`);
  psql("delete from public.places; delete from public.watch_items; delete from public.shared_notes; delete from public.voice_notes; delete from public.daily_photos; delete from public.wishlist_items; delete from public.time_capsules; delete from public.countdowns; delete from public.couple_reminders; delete from public.challenge_done");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed ♡");
process.exit(failures ? 1 : 0);
