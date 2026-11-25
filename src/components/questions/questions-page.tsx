"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Lock, Pencil, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Reveal } from "@/components/animations/reveal";
import { Avatar } from "@/components/shared/avatar";
import { ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Profile, QuestionAnswer } from "@/types/app";

function AnswerCard({ profile, answer, locked, waiting }: { profile: Profile | null; answer?: QuestionAnswer; locked?: boolean; waiting?: boolean }) {
  return (
    <motion.div layout className={cn("card-surface flex min-h-44 flex-col p-5", locked && "bg-muted/60")}>
      <div className="flex items-center gap-2.5">
        <Avatar profile={profile} size="sm" />
        <span className="text-sm font-medium">{profile?.display_name}</span>
      </div>
      {answer ? (
        <p className="font-display mt-4 text-[1.7rem] leading-[1.1] whitespace-pre-wrap">{answer.answer}</p>
      ) : locked ? (
        <div className="mt-4 flex flex-1 flex-col items-start justify-center gap-2 text-muted-foreground">
          <Lock className="size-5" />
          <p className="text-sm">{waiting ? `${profile?.display_name} hat geantwortet. Antworte du, dann siehst du es.` : `${profile?.display_name} hat noch nicht geantwortet.`}</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">noch keine Antwort</p>
      )}
    </motion.div>
  );
}

export function QuestionsPage() {
  const { supabase, me, partner } = useApp();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const today = useQuery(async () => {
    const q = must(await supabase.rpc("question_for_day"))?.[0] ?? null;
    if (!q) return { q: null, answers: [] as QuestionAnswer[], progress: [] as { user_id: string }[] };
    const [answers, progress] = await Promise.all([
      supabase.from("question_answers").select("*").eq("question_id", q.question_id).eq("day", q.day),
      supabase.rpc("question_progress", { q_day: q.day }),
    ]);
    return { q, answers: must(answers), progress: must(progress) ?? [] };
  }, []);

  const archive = useQuery(async () => {
    const sched = must(await supabase.from("question_schedule").select("day, question_id, daily_questions(question)").order("day", { ascending: false }).limit(31));
    const past = sched.filter((s) => s.day !== today.data?.q?.day);
    if (!past.length) return [];
    const answers = must(await supabase.from("question_answers").select("*").in("day", past.map((p) => p.day)));
    return past.map((p) => ({ ...p, answers: answers.filter((a) => a.day === p.day && a.question_id === p.question_id) }));
  }, [today.data?.q?.day]);

  useRealtimeRefetch(["question_answers"], () => {
    void today.refetch();
    void archive.refetch();
  }, "questions");

  const q = today.data?.q;
  const mine = today.data?.answers.find((a) => a.user_id === me.id);
  const theirs = today.data?.answers.find((a) => a.user_id === partner?.id);
  const partnerAnswered = today.data?.progress.some((p) => p.user_id === partner?.id);

  const submit = async () => {
    const answer = draft.trim();
    if (!answer || !q) return;
    setPending(true);
    const res = mine
      ? await supabase.from("question_answers").update({ answer }).eq("id", mine.id)
      : await supabase.from("question_answers").insert({ question_id: q.question_id, day: q.day, answer, user_id: me.id });
    setPending(false);
    if (res.error) return toast.error(errorMessage(res.error));
    setEditing(false);
    void today.refetch();
  };

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="daily questions"
        title={<>one question, <em className="text-primary">every day</em></>}
        description="Ihr seht die Antwort des anderen erst, wenn ihr beide geantwortet habt."
        actions={<Button variant="outline" onClick={() => setAddOpen(true)}><Plus /> Eigene Frage</Button>}
      />

      {today.loading ? (
        <Skeleton className="h-72 rounded-[var(--radius-2xl)]" />
      ) : today.error ? (
        <ErrorState message={today.error} onRetry={today.refetch} />
      ) : !q ? (
        <ErrorState message="Es gibt noch keine Fragen. Füge eine eigene hinzu." />
      ) : (
        <section aria-labelledby="today-q" className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-charcoal p-6 text-cream sm:p-10 dark:bg-card">
          <div aria-hidden className="absolute -top-20 -right-20 size-72 rounded-full bg-cherry/60 blur-3xl" />
          <p className="eyebrow relative !text-dusty-rose">{formatDate(q.day, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h2 id="today-q" className="font-display relative mt-4 text-[2.6rem] leading-[0.98] text-balance sm:text-6xl">{q.question}</h2>
          {!mine || editing ? (
            <form
              className="relative mt-6 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label htmlFor="answer" className="sr-only">Deine Antwort</label>
              <Textarea id="answer" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder="Deine Antwort…" className="border-white/15 bg-white/10 text-cream placeholder:text-cream/50" />
              <div className="flex gap-2">
                <Button type="submit" disabled={!draft.trim() || pending} className="bg-blush text-cherry hover:brightness-95"><Send /> {mine ? "Speichern" : "Antworten"}</Button>
                {editing ? <Button type="button" variant="ghost" className="text-cream hover:bg-white/10" onClick={() => setEditing(false)}>Abbrechen</Button> : null}
              </div>
            </form>
          ) : null}
        </section>
      )}

      {q ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="relative">
            <AnswerCard profile={me} answer={mine} />
            {mine && !editing ? (
              <button onClick={() => { setDraft(mine.answer); setEditing(true); }} className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Antwort bearbeiten">
                <Pencil className="size-4" />
              </button>
            ) : null}
          </div>
          <AnswerCard profile={partner} answer={theirs} locked={!theirs} waiting={partnerAnswered && !mine} />
        </div>
      ) : null}

      <section className="mt-16" aria-labelledby="archive-title">
        <h2 id="archive-title" className="font-display text-4xl">past questions</h2>
        {archive.loading ? (
          <Skeleton className="mt-6 h-40" />
        ) : !archive.data?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">Hier sammeln sich eure Antworten der letzten Tage.</p>
        ) : (
          <Reveal as="ul" className="mt-6 grid gap-4" stagger={0.05}>
            {archive.data.map((d) => {
              const a = d.answers.find((x) => x.user_id === me.id);
              const b = d.answers.find((x) => x.user_id === partner?.id);
              return (
                <li key={d.day} data-reveal className="card-surface p-5">
                  <p className="text-[12px] text-muted-foreground">{formatDate(d.day, { weekday: "short", day: "numeric", month: "long" })}</p>
                  <p className="font-display mt-1 text-2xl leading-tight">{(d.daily_questions as { question: string } | null)?.question}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[{ p: me, x: a }, { p: partner, x: b }].map(({ p, x }) => (
                      <div key={p?.id ?? "x"} className="rounded-xl bg-muted px-3.5 py-2.5">
                        <p className="text-[12px] font-medium">{p?.display_name}</p>
                        <p className="text-sm">{x ? x.answer : p?.id === me.id ? "nicht beantwortet" : a ? "nicht beantwortet" : "🔒 erst nach deiner Antwort"}</p>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </Reveal>
        )}
      </section>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const question = String(new FormData(e.currentTarget).get("question") ?? "").trim();
              if (question.length < 3) return;
              const { error } = await supabase.from("daily_questions").insert({ question, added_by: me.id });
              if (error) return toast.error(/duplicate/i.test(error.message) ? "Diese Frage gibt es schon." : errorMessage(error));
              toast.success("Frage hinzugefügt. Sie kommt an einem der nächsten Tage dran ♡");
              setAddOpen(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>your own question</DialogTitle>
              <DialogDescription>Wird in den Fragenpool aufgenommen.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <label htmlFor="new-q" className="sr-only">Frage</label>
              <Input id="new-q" name="question" required minLength={3} maxLength={240} placeholder="What's your favorite…" />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>Abbrechen</Button>
              <Button type="submit">Hinzufügen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
