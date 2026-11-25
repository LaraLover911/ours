"use client";

import * as React from "react";
import { motion } from "motion/react";
import { CalendarPlus, Check, RefreshCw, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/utils/errors";
import type { RoomProps } from "./use-game-room";

function Choice({ children, picked, onClick, disabled, tone }: { children: React.ReactNode; picked?: boolean; onClick?: () => void; disabled?: boolean; tone?: "right" | "wrong" | "partner" }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={picked}
      className={cn(
        "min-h-13 rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition-colors disabled:cursor-default",
        picked ? "border-primary bg-primary-soft" : "border-border bg-card enabled:hover:bg-muted",
        tone === "right" && "border-success bg-success/10",
        tone === "wrong" && "border-danger/50 bg-danger/5",
        tone === "partner" && "border-dusty-rose bg-blush/60 dark:bg-primary-soft",
      )}
    >
      {children}
    </motion.button>
  );
}

function Waiting({ name }: { name: string }) {
  return (
    <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span className="size-2 animate-pulse rounded-full bg-primary" /> Deine Antwort ist verdeckt abgegeben. Warte auf {name}…
    </p>
  );
}

const submitted = (p: RoomProps) => ((p.room.state.submitted ?? []) as string[]).includes(p.meId);
const partnerSubmitted = (p: RoomProps) => ((p.room.state.submitted ?? []) as string[]).includes(p.partnerId);

/* ---------------- Couple Quiz ---------------- */
export function Quiz(p: RoomProps) {
  const s = p.room.state;
  const qs: { q: string; options: string[] }[] = s.questions;
  const round: number = s.round;
  const q = qs[Math.min(round, qs.length - 1)];
  const [self, setSelf] = React.useState<number | null>(null);
  const [guess, setGuess] = React.useState<number | null>(null);
  const [seen, setSeen] = React.useState(round);
  if (seen !== round) {
    setSeen(round);
    setSelf(null);
    setGuess(null);
  }
  const prev = (s.rounds ?? []).at(-1) as Record<string, { self: number; guess: number }> | undefined;
  const prevQ = qs[round - 1];
  const done = p.room.status !== "active";

  return (
    <div className="mx-auto w-full max-w-xl">
      {prev && prevQ ? (
        <div className="mb-6 rounded-2xl bg-muted/60 p-4 text-[13.5px]">
          <p className="eyebrow mb-1">letzte Frage · {prevQ.q}</p>
          <p>
            {p.partnerName}: <strong>{prevQ.options[prev[p.partnerId]?.self]}</strong>, du hast {prev[p.meId]?.guess === prev[p.partnerId]?.self ? "richtig geraten ♡" : `„${prevQ.options[prev[p.meId]?.guess]}“ geraten`}
          </p>
          <p>
            Du: <strong>{prevQ.options[prev[p.meId]?.self]}</strong>, {p.partnerName} hat {prev[p.partnerId]?.guess === prev[p.meId]?.self ? "richtig geraten" : `„${prevQ.options[prev[p.partnerId]?.guess]}“ geraten`}
          </p>
        </div>
      ) : null}
      {done ? null : (
        <>
          <p className="eyebrow">
            Frage {round + 1} von {qs.length}
          </p>
          <h3 className="mt-2 font-display text-3xl leading-tight text-balance sm:text-4xl">{q.q}</h3>
          {submitted(p) ? (
            <Waiting name={p.partnerName} />
          ) : (
            <>
              <p className="mt-5 mb-2 text-[13px] font-medium">Deine Antwort</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <Choice key={o} picked={self === i} onClick={() => setSelf(i)}>
                    {o}
                  </Choice>
                ))}
              </div>
              <p className="mt-5 mb-2 text-[13px] font-medium">Was wählt {p.partnerName}?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <Choice key={o} picked={guess === i} onClick={() => setGuess(i)}>
                    {o}
                  </Choice>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted-foreground">{partnerSubmitted(p) ? `${p.partnerName} hat schon geantwortet` : ""}</span>
                <Button disabled={self == null || guess == null || p.pending} onClick={() => p.move({ self, guess })}>
                  Abgeben
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- This or That ---------------- */
export function ThisOrThat(p: RoomProps) {
  const s = p.room.state;
  const pairs: { a: string; b: string }[] = s.pairs;
  const round: number = s.round;
  const pair = pairs[Math.min(round, pairs.length - 1)];
  const prev = (s.rounds ?? []).at(-1) as Record<string, number> | undefined;
  const prevPair = pairs[round - 1];
  return (
    <div className="mx-auto w-full max-w-xl text-center">
      <p className="eyebrow">
        {Math.min(round + 1, pairs.length)} von {pairs.length} · {s.matches} gleich
      </p>
      {p.room.status === "active" ? (
        submitted(p) ? (
          <Waiting name={p.partnerName} />
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[pair.a, pair.b].map((o, i) => (
              <motion.button
                key={o}
                type="button"
                whileTap={{ scale: 0.96 }}
                disabled={p.pending}
                onClick={() => p.move({ pick: i })}
                className="grid min-h-36 place-items-center rounded-3xl border border-border bg-card p-4 font-display text-3xl text-balance shadow-soft transition-colors hover:bg-primary-soft sm:text-4xl"
              >
                {o}
              </motion.button>
            ))}
          </div>
        )
      ) : null}
      {prev && prevPair ? (
        <p className="mt-5 text-[14px]">
          {prev[p.meId] === prev[p.partnerId] ? (
            <>
              Beide <strong>{prev[p.meId] ? prevPair.b : prevPair.a}</strong> ♡
            </>
          ) : (
            <>
              Du: <strong>{prev[p.meId] ? prevPair.b : prevPair.a}</strong> · {p.partnerName}: <strong>{prev[p.partnerId] ? prevPair.b : prevPair.a}</strong>
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------- Guess My Answer ---------------- */
export function GuessMyAnswer(p: RoomProps) {
  const s = p.room.state;
  const prompts: { q: string }[] = s.prompts;
  const round: number = s.round;
  const prompt = prompts[Math.min(round, prompts.length - 1)];
  const iAnswer = s.answerer === p.meId;
  const [text, setText] = React.useState("");
  const [seen, setSeen] = React.useState(`${round}${s.phase}`);
  if (seen !== `${round}${s.phase}`) {
    setSeen(`${round}${s.phase}`);
    setText("");
  }
  const prev = (s.rounds ?? []).at(-1) as { answer: string; guess: string; answerer: string; match: boolean } | undefined;

  return (
    <div className="mx-auto w-full max-w-xl">
      {p.room.status === "active" ? (
        <>
          <p className="eyebrow">
            Runde {round + 1} von {prompts.length} · {iAnswer ? "du antwortest" : `${p.partnerName} antwortet, du rätst`}
          </p>
          <h3 className="mt-2 font-display text-3xl leading-tight text-balance sm:text-4xl">{iAnswer ? prompt.q : `„${prompt.q}“`}</h3>
          {!iAnswer ? <p className="mt-1 text-[13px] text-muted-foreground">So würde {p.partnerName} es sagen. Was antwortet {p.partnerName}?</p> : null}
          {s.phase === "write" ? (
            submitted(p) ? (
              <Waiting name={p.partnerName} />
            ) : (
              <form
                className="mt-5 grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) void p.move({ text: text.trim() });
                }}
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 200))}
                  rows={3}
                  maxLength={200}
                  placeholder={iAnswer ? "Deine ehrliche Antwort…" : `Was schreibt ${p.partnerName}?`}
                  className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-ring"
                  aria-label={iAnswer ? "Deine Antwort" : "Dein Tipp"}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-muted-foreground">{text.length}/200 · bleibt verdeckt, bis ihr beide fertig seid</span>
                  <Button type="submit" disabled={!text.trim() || p.pending}>
                    Abgeben
                  </Button>
                </div>
              </form>
            )
          ) : (
            <div className="mt-5 grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="eyebrow mb-1">{iAnswer ? "deine Antwort" : `${p.partnerName}s Antwort`}</p>
                  <p className="text-[15px] break-words">{s.reveal?.answer}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="eyebrow mb-1">{iAnswer ? `${p.partnerName}s Tipp` : "dein Tipp"}</p>
                  <p className="text-[15px] break-words">{s.reveal?.guess}</p>
                </div>
              </div>
              {iAnswer ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" disabled={p.pending} onClick={() => p.move({ match: false })}>
                    <X /> Zählt nicht
                  </Button>
                  <Button disabled={p.pending} onClick={() => p.move({ match: true })}>
                    <Check /> Zählt!
                  </Button>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">{p.partnerName} entscheidet, ob dein Tipp zählt…</p>
              )}
            </div>
          )}
        </>
      ) : null}
      {prev && s.phase === "write" ? (
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Letzte Runde: „{prev.answer}“ / „{prev.guess}“ · {prev.match ? "zählt ♡" : "zählt nicht"}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------- Truth or Dare ---------------- */
export function TruthOrDare(p: RoomProps) {
  const s = p.room.state;
  const active = p.room.turn === p.meId;
  const activeName = active ? "Du" : p.partnerName;
  const last = (s.log ?? []).at(-1) as { kind: string; text: string; player: string; done: boolean } | undefined;
  if (p.room.status !== "active") return null;
  return (
    <div className="mx-auto w-full max-w-xl text-center">
      <p className="eyebrow">
        Karte {Math.min(s.count + 1, s.total)} von {s.total} · {activeName} {active ? "bist" : "ist"} dran
      </p>
      {s.phase === "choose" ? (
        active ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button size="lg" variant="soft" className="h-28 font-display text-3xl" disabled={p.pending} onClick={() => p.move({ pick: "truth" })}>
              Wahrheit
            </Button>
            <Button size="lg" className="h-28 font-display text-3xl" disabled={p.pending} onClick={() => p.move({ pick: "dare" })}>
              Pflicht
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">{p.partnerName} wählt gerade…</p>
        )
      ) : (
        <motion.div key={s.card?.text} initial={{ rotateX: 70, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} className="card-surface mt-5 p-6">
          <p className="eyebrow mb-2">{s.card?.kind === "truth" ? "Wahrheit" : "Pflicht"}</p>
          <p className="font-display text-3xl leading-tight text-balance">{s.card?.text}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {active ? (
              <>
                <Button variant="outline" disabled={p.pending} onClick={() => p.move({ skip: true })}>
                  <SkipForward /> Überspringen
                </Button>
                <span className="self-center text-[13px] text-muted-foreground">{p.partnerName} bestätigt, wenn du es gemacht hast.</span>
              </>
            ) : (
              <Button disabled={p.pending} onClick={() => p.move({ done: true })}>
                <Check /> {p.partnerName} hat es gemacht
              </Button>
            )}
          </div>
        </motion.div>
      )}
      {last ? (
        <p className="mt-5 text-[13px] text-muted-foreground">
          Zuletzt: {last.player === p.meId ? "du" : p.partnerName} · {last.kind === "truth" ? "Wahrheit" : "Pflicht"} · {last.done ? "erledigt" : "übersprungen"}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------- Random Date Challenge ---------------- */
export function DateChallenge(p: RoomProps) {
  const { supabase } = useApp();
  const s = p.room.state;
  const accepted: string[] = s.accepted ?? [];
  const done: string[] = s.done ?? [];
  const [saved, setSaved] = React.useState(false);
  const save = async () => {
    const { error } = await supabase.from("date_ideas").insert({ title: String(s.challenge?.text ?? "").slice(0, 140), category: "aktivitaet" });
    if (error) return toast.error(errorMessage(error));
    setSaved(true);
    toast.success("Bei euren Dates gespeichert ♡");
  };
  return (
    <div className="mx-auto w-full max-w-xl text-center">
      <motion.div key={s.challenge?.id} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card-surface p-6 sm:p-8">
        <p className="eyebrow mb-2">eure challenge</p>
        <p className="font-display text-3xl leading-tight text-balance sm:text-4xl">{s.challenge?.text}</p>
      </motion.div>
      {p.room.status === "active" && s.phase === "pick" ? (
        <div className="mt-5 grid gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" disabled={p.pending || s.rerolls <= 0} onClick={() => p.move({ reroll: true })}>
              <RefreshCw /> Neu ziehen ({s.rerolls})
            </Button>
            <Button disabled={p.pending || accepted.includes(p.meId)} onClick={() => p.move({ accept: true })}>
              <Check /> {accepted.includes(p.meId) ? "Du bist dabei" : "Wir machen das"}
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">{accepted.includes(p.partnerId) ? `${p.partnerName} ist dabei ♡` : `${p.partnerName} hat noch nicht zugesagt`}</p>
        </div>
      ) : null}
      {s.phase === "on" ? (
        <div className="mt-5 grid gap-3">
          <p className="text-[14px]">Ihr habt beide zugesagt. Hakt es ab, wenn ihr es gemacht habt.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" disabled={saved} onClick={save}>
              <CalendarPlus /> {saved ? "Gespeichert" : "Zu euren Dates"}
            </Button>
            {p.room.status === "active" ? (
              <Button disabled={p.pending || done.includes(p.meId)} onClick={() => p.move({ done: true })}>
                <Check /> {done.includes(p.meId) ? "Von dir abgehakt" : "Haben wir gemacht"}
              </Button>
            ) : null}
          </div>
          {p.room.status === "active" ? (
            <p className="text-[13px] text-muted-foreground">{done.includes(p.partnerId) ? `${p.partnerName} hat schon abgehakt` : ""}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
