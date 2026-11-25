"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Brain, Dice5, Image as ImageIcon, RotateCcw, Shuffle, Sparkles, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Reveal } from "@/components/animations/reveal";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState, PageHeader } from "@/components/shared/states";
import { PrivateImage } from "@/components/shared/media";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import { DateEditor } from "@/components/dates/dates-page";
import type { GameResponse } from "@/types/app";
import { ABOUT_ME, LIKELY, RANDOM_DATE, THIS_OR_THAT } from "./game-data";

type GameId = "knowme" | "likely" | "thisorthat" | "quiz" | "guess" | "random";

const GAMES: { id: GameId; title: string; hint: string; icon: React.ElementType; tone: string }[] = [
  { id: "knowme", title: "How well do you know me?", hint: "Antworte über dich, rate über den anderen", icon: Brain, tone: "from-[#f3dde5] to-[#dda9bb]" },
  { id: "likely", title: "Who is more likely to?", hint: "Abdullah oder Lara?", icon: Users, tone: "from-[#efe6e0] to-[#e3cfc4]" },
  { id: "thisorthat", title: "This or That", hint: "Seid ihr euch einig?", icon: Shuffle, tone: "from-[#e8e4f3] to-[#c9bfe6]" },
  { id: "quiz", title: "Couple Quiz", hint: "Fragen aus euren eigenen Erinnerungen", icon: Trophy, tone: "from-[#e4ede6] to-[#bcd5c3]" },
  { id: "guess", title: "Guess the Memory", hint: "Erkennt ihr das Foto?", icon: ImageIcon, tone: "from-[#f8e6de] to-[#f0c3ae]" },
  { id: "random", title: "Random Date Generator", hint: "Wenn ihr nicht wisst, was ihr machen wollt", icon: Dice5, tone: "from-[#e2ecf3] to-[#b5cfe2]" },
];

function useGameResponses() {
  const { supabase } = useApp();
  const q = useQuery(async () => {
    const [visible, progress] = await Promise.all([supabase.from("game_responses").select("*"), supabase.rpc("game_progress")]);
    return { visible: must(visible) as GameResponse[], progress: (must(progress) ?? []) as { game: string; prompt_key: string; user_id: string }[] };
  }, []);
  useRealtimeRefetch(["game_responses"], q.refetch, "games");
  return q;
}

function OptionButton({ children, onClick, state, disabled }: { children: React.ReactNode; onClick: () => void; state?: "picked" | "right" | "wrong" | "partner"; disabled?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-14 rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition-colors disabled:cursor-default",
        state === "right" && "border-success bg-success/10",
        state === "wrong" && "border-danger/50 bg-danger/5",
        state === "picked" && "border-primary bg-primary-soft",
        state === "partner" && "border-dusty-rose bg-blush/60 dark:bg-primary-soft",
        !state && "border-border bg-card hover:bg-muted",
      )}
    >
      {children}
    </motion.button>
  );
}

/* ---------------- How well do you know me ---------------- */
function KnowMe() {
  const { supabase, me, partner } = useApp();
  const { data, refetch, loading } = useGameResponses();
  const [mode, setMode] = React.useState<"guess" | "about">("guess");
  const [revealed, setRevealed] = React.useState<string | null>(null);

  if (loading || !data) return <Skeleton className="h-80" />;
  const mineAbout = new Map(data.visible.filter((r) => r.game === "aboutme" && r.user_id === me.id).map((r) => [r.prompt_key, r.value]));
  const myGuesses = new Map(data.visible.filter((r) => r.game === "guess" && r.user_id === me.id).map((r) => [r.prompt_key, r.value]));
  const partnerAbout = new Map(data.visible.filter((r) => r.game === "aboutme" && r.user_id === partner?.id).map((r) => [r.prompt_key, r.value]));
  const partnerAnsweredKeys = new Set(data.progress.filter((p) => p.game === "aboutme" && p.user_id === partner?.id).map((p) => p.prompt_key));
  const toGuess = ABOUT_ME.filter((p) => partnerAnsweredKeys.has(p.key) && (!myGuesses.has(p.key) || revealed === p.key));
  const guessed = ABOUT_ME.filter((p) => myGuesses.has(p.key) && partnerAbout.has(p.key));
  const correct = guessed.filter((p) => myGuesses.get(p.key) === partnerAbout.get(p.key)).length;
  const nextAbout = ABOUT_ME.find((p) => !mineAbout.has(p.key));

  const answerAbout = async (key: string, value: string) => {
    const { error } = await supabase.from("game_responses").upsert({ game: "aboutme", prompt_key: key, value, user_id: me.id });
    if (error) toast.error(errorMessage(error));
    void refetch();
  };
  const guess = async (key: string, value: string) => {
    const { error } = await supabase.from("game_responses").insert({ game: "guess", prompt_key: key, value, user_id: me.id });
    if (error) return toast.error(errorMessage(error));
    setRevealed(key);
    await refetch();
  };

  const current = toGuess[0];
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant={mode === "guess" ? "default" : "outline"} size="sm" onClick={() => setMode("guess")}>{partner?.display_name ?? "…"} raten</Button>
        <Button variant={mode === "about" ? "default" : "outline"} size="sm" onClick={() => setMode("about")}>Über mich ({mineAbout.size}/{ABOUT_ME.length})</Button>
        {guessed.length ? <span className="ml-auto text-sm text-muted-foreground">Score: <strong className="text-foreground">{correct}/{guessed.length}</strong></span> : null}
      </div>

      {mode === "about" ? (
        nextAbout ? (
          <div>
            <p className="eyebrow">über dich · {mineAbout.size + 1}/{ABOUT_ME.length}</p>
            <h3 className="font-display mt-2 text-4xl leading-tight">{nextAbout.q}</h3>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {nextAbout.options.map((o) => <OptionButton key={o} onClick={() => answerAbout(nextAbout.key, o)}>{o}</OptionButton>)}
            </div>
          </div>
        ) : (
          <EmptyState title="all done ♡" description={`Du hast alles über dich beantwortet. Jetzt kann ${partner?.display_name ?? "dein Schatz"} raten.`} />
        )
      ) : current ? (
        <div>
          <p className="eyebrow">rate {partner?.display_name}</p>
          <h3 className="font-display mt-2 text-4xl leading-tight">{current.q}</h3>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {current.options.map((o) => {
              const my = myGuesses.get(current.key);
              const truth = partnerAbout.get(current.key);
              const state = revealed === current.key && my ? (o === truth ? "right" : o === my ? "wrong" : undefined) : undefined;
              return (
                <OptionButton key={o} state={state} disabled={!!my} onClick={() => guess(current.key, o)}>
                  {o}
                </OptionButton>
              );
            })}
          </div>
          {revealed === current.key ? (
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-sm">{myGuesses.get(current.key) === partnerAbout.get(current.key) ? "Richtig! Du kennst " + partner?.display_name + " ♡" : `Fast! ${partner?.display_name} hat „${partnerAbout.get(current.key)}“ gewählt.`}</p>
              <Button size="sm" onClick={() => setRevealed(null)}>Weiter</Button>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title={partnerAnsweredKeys.size ? "nothing left to guess" : `waiting for ${partner?.display_name ?? "your love"}`}
          description={partnerAnsweredKeys.size ? `Du hast alles geraten: ${correct}/${guessed.length} richtig.` : `${partner?.display_name ?? "Dein Schatz"} muss zuerst Fragen über sich beantworten. Du kannst in der Zwischenzeit „Über mich“ ausfüllen.`}
        />
      )}
    </div>
  );
}

/* ---------------- Paired games: likely / this or that ---------------- */
function PairGame({ game }: { game: "likely" | "thisorthat" }) {
  const { supabase, me, partner } = useApp();
  const { data, refetch, loading } = useGameResponses();
  const [i, setI] = React.useState(0);
  const prompts = game === "likely" ? LIKELY.map((q, k) => ({ key: `l${k}`, q, options: [me.id, partner?.id ?? ""] })) : THIS_OR_THAT.map(([a, b], k) => ({ key: `t${k}`, q: `${a} oder ${b}?`, options: [a, b] }));
  if (loading || !data) return <Skeleton className="h-80" />;
  const p = prompts[i];
  const mine = data.visible.find((r) => r.game === game && r.prompt_key === p.key && r.user_id === me.id);
  const theirs = data.visible.find((r) => r.game === game && r.prompt_key === p.key && r.user_id === partner?.id);
  const partnerDone = data.progress.some((r) => r.game === game && r.prompt_key === p.key && r.user_id === partner?.id);
  const both = prompts.filter((pp) => data.visible.some((r) => r.game === game && r.prompt_key === pp.key && r.user_id === me.id) && data.visible.some((r) => r.game === game && r.prompt_key === pp.key && r.user_id === partner?.id));
  const matches = both.filter((pp) => data.visible.find((r) => r.game === game && r.prompt_key === pp.key && r.user_id === me.id)?.value === data.visible.find((r) => r.game === game && r.prompt_key === pp.key && r.user_id === partner?.id)?.value).length;
  const label = (v: string) => (game === "likely" ? (v === me.id ? me.display_name : (partner?.display_name ?? "?")) : v);

  const pick = async (value: string) => {
    const { error } = await supabase.from("game_responses").upsert({ game, prompt_key: p.key, value, user_id: me.id });
    if (error) toast.error(errorMessage(error));
    void refetch();
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between text-sm text-muted-foreground">
        <span>{i + 1} / {prompts.length}</span>
        {both.length ? <span>Einig: <strong className="text-foreground">{matches}/{both.length}</strong></span> : null}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={p.key} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
          <h3 className="font-display text-4xl leading-tight sm:text-5xl">{p.q}</h3>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {p.options.map((o) => (
              <OptionButton key={o} onClick={() => pick(o)} state={mine?.value === o ? "picked" : theirs?.value === o ? "partner" : undefined}>
                <span className="flex items-center gap-2">
                  {game === "likely" ? <Avatar profile={o === me.id ? me : partner} size="sm" /> : null}
                  {label(o)}
                </span>
              </OptionButton>
            ))}
          </div>
          <p className="mt-4 min-h-6 text-sm text-muted-foreground" aria-live="polite">
            {mine && theirs
              ? mine.value === theirs.value
                ? "Ihr seid euch einig ♡"
                : `${partner?.display_name} sagt: ${label(theirs.value)}`
              : mine
                ? partnerDone ? "" : `Warte auf ${partner?.display_name}…`
                : partnerDone
                  ? `${partner?.display_name} hat schon gewählt. Deine Wahl zuerst!`
                  : ""}
          </p>
        </motion.div>
      </AnimatePresence>
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Zurück</Button>
        <Button onClick={() => setI((i + 1) % prompts.length)}>Weiter</Button>
      </div>
    </div>
  );
}

/* ---------------- Quiz & Guess the memory (from real data) ---------------- */
type QuizQ = { q: string; options: string[]; answer: string; image?: string };

function shuffle<T>(a: T[]) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function useMemoryPool() {
  const { supabase } = useApp();
  return useQuery(async () => {
    const [mem, songs] = await Promise.all([supabase.from("memories").select("id, title, happened_on, location, created_by, memory_media(path, kind)"), supabase.from("songs").select("title, artist, added_by")]);
    return { memories: must(mem), songs: must(songs) };
  }, []);
}

function QuizRunner({ game, build }: { game: "quiz" | "guess"; build: () => QuizQ[] | null }) {
  const { supabase, me } = useApp();
  const [questions, setQuestions] = React.useState<QuizQ[] | null>(() => build());
  const [i, setI] = React.useState(0);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [score, setScore] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [blur, setBlur] = React.useState(24);

  const start = React.useCallback(() => {
    setQuestions(build());
    setI(0);
    setScore(0);
    setPicked(null);
    setDone(false);
    setBlur(24);
  }, [build]);


  if (!questions) return null;
  if (!questions.length) {
    return (
      <EmptyState
        title="not enough memories yet"
        description={game === "guess" ? "Für dieses Spiel braucht ihr mindestens 3 Erinnerungen mit Fotos." : "Für das Quiz braucht ihr mindestens 3 Erinnerungen mit Datum oder Ort."}
      />
    );
  }
  if (done) {
    return (
      <div className="text-center">
        <p className="eyebrow">result</p>
        <p className="font-display mt-2 text-7xl">{score}/{questions.length}</p>
        <p className="mt-2 text-muted-foreground">{score === questions.length ? "perfect. ihr seid ein Team ♡" : score > questions.length / 2 ? "ziemlich gut!" : "nochmal?"}</p>
        <Button className="mt-6" onClick={start}><RotateCcw /> Nochmal</Button>
      </div>
    );
  }
  const q = questions[i];
  const choose = async (o: string) => {
    if (picked) return;
    setPicked(o);
    setBlur(0);
    const right = o === q.answer;
    const newScore = score + (right ? 1 : 0);
    if (right) setScore(newScore);
    window.setTimeout(async () => {
      if (i + 1 >= questions.length) {
        setDone(true);
        await supabase.from("game_scores").insert({ game, score: newScore, total: questions.length, user_id: me.id });
      } else {
        setI(i + 1);
        setPicked(null);
        setBlur(24);
      }
    }, 1300);
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">Frage {i + 1} / {questions.length} · {score} richtig</p>
      {q.image ? (
        <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-2xl">
          <PrivateImage path={q.image} className="absolute inset-0 scale-125 transition-[filter] duration-700" style={{ filter: `blur(${blur}px)` }} />
          {!picked ? (
            <Button size="sm" variant="outline" className="absolute right-3 bottom-3 bg-card/80" onClick={() => setBlur((b) => Math.max(0, b - 8))}>
              <Sparkles /> Tipp
            </Button>
          ) : null}
        </div>
      ) : null}
      <h3 className="font-display text-3xl leading-tight sm:text-4xl">{q.q}</h3>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {q.options.map((o) => (
          <OptionButton key={o} disabled={!!picked} onClick={() => choose(o)} state={picked ? (o === q.answer ? "right" : o === picked ? "wrong" : undefined) : undefined}>
            {o}
          </OptionButton>
        ))}
      </div>
    </div>
  );
}

function CoupleQuiz() {
  const { profiles } = useApp();
  const pool = useMemoryPool();
  const build = React.useCallback((): QuizQ[] | null => {
    if (!pool.data) return null;
    const mems = pool.data.memories;
    const out: QuizQ[] = [];
    const dated = mems.filter((m) => m.happened_on);
    const located = mems.filter((m) => m.location);
    const fmt = (d: string) => formatDate(d, { month: "long", year: "numeric" });
    shuffle(dated).forEach((m) => {
      const others = [...new Set(dated.filter((x) => x.id !== m.id).map((x) => fmt(x.happened_on!)))].filter((x) => x !== fmt(m.happened_on!));
      if (others.length >= 1) out.push({ q: `Wann war „${m.title}“?`, answer: fmt(m.happened_on!), options: shuffle([fmt(m.happened_on!), ...shuffle(others).slice(0, 3)]) });
    });
    shuffle(located).forEach((m) => {
      const others = [...new Set(located.filter((x) => x.id !== m.id).map((x) => x.location!))].filter((x) => x !== m.location);
      if (others.length >= 1) out.push({ q: `Wo war „${m.title}“?`, answer: m.location!, options: shuffle([m.location!, ...shuffle(others).slice(0, 3)]) });
    });
    const names = Object.values(profiles).map((p) => p.display_name);
    shuffle(mems).slice(0, 3).forEach((m) => names.length === 2 && out.push({ q: `Wer hat „${m.title}“ gespeichert?`, answer: profiles[m.created_by]?.display_name ?? "?", options: names }));
    shuffle(pool.data.songs).slice(0, 2).forEach((s) => names.length === 2 && out.push({ q: `Wer hat „${s.title}“ zu unserer Musik hinzugefügt?`, answer: profiles[s.added_by]?.display_name ?? "?", options: names }));
    return mems.length < 3 ? [] : shuffle(out).slice(0, 8);
  }, [pool.data, profiles]);
  if (pool.loading) return <Skeleton className="h-80" />;
  return <QuizRunner game="quiz" build={build} />;
}

function GuessMemory() {
  const pool = useMemoryPool();
  const build = React.useCallback((): QuizQ[] | null => {
    if (!pool.data) return null;
    const withImg = pool.data.memories.map((m) => ({ ...m, img: m.memory_media.find((x) => x.kind === "image")?.path })).filter((m) => m.img);
    if (withImg.length < 3) return [];
    return shuffle(withImg).slice(0, 6).map((m) => ({
      q: "Welche Erinnerung ist das?",
      image: m.img,
      answer: m.title,
      options: shuffle([m.title, ...shuffle(pool.data!.memories.filter((x) => x.id !== m.id && x.title !== m.title).map((x) => x.title)).slice(0, 3)]),
    }));
  }, [pool.data]);
  if (pool.loading) return <Skeleton className="h-80" />;
  return <QuizRunner game="guess" build={build} />;
}

/* ---------------- Random date generator ---------------- */
function RandomDate() {
  const { supabase } = useApp();
  const ideas = useQuery(async () => must(await supabase.from("date_ideas").select("title").eq("status", "idee")), []);
  const [result, setResult] = React.useState<{ activity: string; place: string; twist: string; fromIdeas?: boolean } | null>(null);
  const [spinning, setSpinning] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

  const spin = () => {
    setSpinning(true);
    let n = 0;
    const own = ideas.data?.map((i) => i.title) ?? [];
    const id = window.setInterval(() => {
      const useOwn = own.length > 0 && Math.random() < 0.35;
      setResult({ activity: useOwn ? pick(own) : pick(RANDOM_DATE.activity), place: pick(RANDOM_DATE.place), twist: pick(RANDOM_DATE.twist), fromIdeas: useOwn });
      if (++n > 14) {
        window.clearInterval(id);
        setSpinning(false);
      }
    }, 80);
  };

  return (
    <div className="text-center">
      <div className="mx-auto grid max-w-lg gap-2">
        {(["activity", "place", "twist"] as const).map((k) => (
          <div key={k} className="card-surface overflow-hidden px-4 py-5">
            <p className="eyebrow">{k === "activity" ? "was" : k === "place" ? "wo" : "twist"}</p>
            <AnimatePresence mode="popLayout">
              <motion.p key={result?.[k] ?? "?"} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ duration: 0.08 }} className="font-display mt-1 text-3xl">
                {result?.[k] ?? "?"}
              </motion.p>
            </AnimatePresence>
          </div>
        ))}
      </div>
      {result?.fromIdeas && !spinning ? <p className="mt-3 text-xs text-muted-foreground">aus euren eigenen Date-Ideen ♡</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={spin} disabled={spinning}><Dice5 /> {result ? "Nochmal" : "Würfeln"}</Button>
        {result && !spinning ? <Button size="lg" variant="outline" onClick={() => setEditorOpen(true)}>In den Planner</Button> : null}
      </div>
      {editorOpen ? <DateEditor
        open
        onOpenChange={setEditorOpen}
        idea={null}
        preset={result ? { title: `${result.activity} ${result.place}`, description: `Twist: ${result.twist}` } : undefined}
        onSaved={() => toast.success("Im Date Planner gespeichert")}
      /> : null}
    </div>
  );
}

export function GamesPage() {
  const [game, setGame] = React.useState<GameId | null>(null);
  const g = GAMES.find((x) => x.id === game);
  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [game]);

  return (
    <PageContainer className="max-w-4xl">
      {g ? (
        <>
          <button onClick={() => setGame(null)} className="mb-4 flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Alle Spiele
          </button>
          <div className={cn("mb-6 rounded-[var(--radius-2xl)] bg-gradient-to-br p-6 text-charcoal sm:p-8", g.tone)}>
            <g.icon className="size-7" />
            <h1 className="font-display mt-4 text-5xl leading-none">{g.title}</h1>
            <p className="mt-2 text-charcoal/70">{g.hint}</p>
          </div>
          <div className="card-surface p-5 sm:p-8">
            {game === "knowme" ? <KnowMe /> : game === "likely" ? <PairGame game="likely" /> : game === "thisorthat" ? <PairGame game="thisorthat" /> : game === "quiz" ? <CoupleQuiz /> : game === "guess" ? <GuessMemory /> : <RandomDate />}
          </div>
        </>
      ) : (
        <>
          <PageHeader eyebrow="mini games" title={<>just for <em className="text-primary">fun</em></>} description="Kleine Spiele für zwei, die Antworten werden gespeichert und synchronisiert." />
          <Reveal className="grid gap-4 sm:grid-cols-2" stagger={0.06}>
            {GAMES.map((x) => (
              <motion.button data-reveal key={x.id} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} onClick={() => setGame(x.id)} className={cn("relative flex min-h-44 flex-col justify-between overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br p-6 text-left text-charcoal shadow-soft", x.tone)}>
                <x.icon className="size-7" />
                <div>
                  <h2 className="font-display text-[2.1rem] leading-none">{x.title}</h2>
                  <p className="mt-1.5 text-sm text-charcoal/70">{x.hint}</p>
                </div>
              </motion.button>
            ))}
          </Reveal>
        </>
      )}
    </PageContainer>
  );
}
