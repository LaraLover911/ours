"use client";

import * as React from "react";
import { Check, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { EmptyState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

type Goal = Database["public"]["Tables"]["goals"]["Row"];
type Step = Database["public"]["Tables"]["goal_steps"]["Row"];

/** Couple goals with steps. Progress is simply the share of finished steps. */
export function GoalsPage() {
  const { supabase, nameOf } = useApp();
  const goals = useQuery(async () => must(await supabase.from("goals").select("*").order("created_at")), [supabase]);
  const steps = useQuery(async () => must(await supabase.from("goal_steps").select("*").order("sort").order("created_at")), [supabase]);
  useRealtimeRefetch(["goals", "goal_steps"], () => {
    void goals.refetch();
    void steps.refetch();
  });
  const [title, setTitle] = React.useState("");
  const [emoji, setEmoji] = React.useState("🎯");
  const [date, setDate] = React.useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("goals").insert({ title: title.trim(), emoji: emoji.slice(0, 8) || "🎯", target_date: date || null });
    if (error) return toast.error(errorMessage(error));
    setTitle("");
    setDate("");
    void goals.refetch();
  };
  const all = goals.data ?? [];
  const open = all.filter((g) => !g.done_at);
  const done = all.filter((g) => g.done_at);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="couple goals"
        title={
          <>
            dreams, <em className="text-primary">step by step</em>
          </>
        }
        description="Gemeinsame Ziele, in kleine Schritte zerlegt. Jeder kann Schritte abhaken."
      />
      <form onSubmit={add} className="card-surface mb-5 grid grid-cols-[4rem_1fr] gap-2 p-4 sm:grid-cols-[4rem_1fr_11rem_auto]">
        <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" className="text-center" />
        <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="Neues Ziel, z. B. Zusammen nach Japan" aria-label="Ziel" required />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Bis wann (optional)" className="col-span-2 sm:col-span-1" />
        <Button type="submit" disabled={!title.trim()} className="col-span-2 sm:col-span-1">
          <Plus /> Ziel
        </Button>
      </form>
      {goals.loading ? (
        <Skeleton className="h-40" />
      ) : !all.length ? (
        <EmptyState icon={<Target />} title="Noch keine Ziele" description="Was wollt ihr zusammen schaffen?" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {[...open, ...done].map((g) => (
            <GoalCard key={g.id} g={g} steps={(steps.data ?? []).filter((s) => s.goal_id === g.id)} nameOf={nameOf} onChange={() => {
              void goals.refetch();
              void steps.refetch();
            }} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function GoalCard({ g, steps, nameOf, onChange }: { g: Goal; steps: Step[]; nameOf: (id: string | null) => string; onChange: () => void }) {
  const { supabase, me } = useApp();
  const [step, setStep] = React.useState("");
  const doneCount = steps.filter((s) => s.done_at).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : g.done_at ? 100 : 0;
  const run = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) toast.error(errorMessage(error));
    onChange();
  };
  return (
    <section className={cn("card-surface p-5", g.done_at && "opacity-70")} aria-label={g.title}>
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>
          {g.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[1.6rem] leading-tight break-words">{g.title}</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {g.target_date ? `bis ${formatDate(g.target_date)} · ` : ""}
            {g.done_at ? `geschafft am ${formatDate(g.done_at)} ♡` : `${pct} %`}
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Ziel löschen" onClick={() => run(supabase.from("goals").delete().eq("id", g.id))}>
          <Trash2 />
        </Button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Fortschritt">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {steps.map((s) => (
          <li key={s.id} className="group flex items-center gap-2 text-[14px]">
            <button
              type="button"
              role="checkbox"
              aria-checked={!!s.done_at}
              aria-label={s.title}
              onClick={() => run(supabase.from("goal_steps").update({ done_at: s.done_at ? null : new Date().toISOString(), done_by: s.done_at ? null : me.id }).eq("id", s.id))}
              className={cn("grid size-5 shrink-0 place-items-center rounded-md border border-border-strong", s.done_at && "border-primary bg-primary text-primary-foreground")}
            >
              {s.done_at ? <Check className="size-3.5" /> : null}
            </button>
            <span className={cn("min-w-0 flex-1 break-words", s.done_at && "text-muted-foreground line-through")}>{s.title}</span>
            {s.done_at ? <span className="text-[11.5px] text-muted-foreground">{s.done_by === me.id ? "du" : nameOf(s.done_by)}</span> : null}
            <button type="button" aria-label={`Schritt ${s.title} löschen`} className="text-muted-foreground opacity-60 hover:opacity-100" onClick={() => run(supabase.from("goal_steps").delete().eq("id", s.id))}>
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!step.trim()) return;
          void run(supabase.from("goal_steps").insert({ goal_id: g.id, title: step.trim(), sort: steps.length }));
          setStep("");
        }}
      >
        <Input value={step} onChange={(e) => setStep(e.target.value.slice(0, 140))} placeholder="Nächster Schritt" aria-label="Neuer Schritt" className="h-9 min-w-0 flex-1" />
        <Button size="sm" variant="soft" type="submit" disabled={!step.trim()}>
          <Plus />
        </Button>
      </form>
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => run(supabase.from("goals").update({ done_at: g.done_at ? null : new Date().toISOString() }).eq("id", g.id))}>
        {g.done_at ? "Wieder öffnen" : "Als geschafft markieren"}
      </Button>
    </section>
  );
}
