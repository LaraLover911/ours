"use client";

import * as React from "react";
import { Check, Flame, History, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { berlinDateString, formatDate } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";

const CAT: Record<string, string> = { sweet: "süß", talk: "reden", fun: "Spaß", care: "füreinander da", create: "kreativ" };

export function ChallengePage() {
  const { supabase, me, partner, nameOf } = useApp();
  const today = useQuery(async () => must(await supabase.rpc("challenge_today")), [supabase]);
  const done = useQuery(async () => must(await supabase.from("challenge_done").select("*, challenges(body)").order("day", { ascending: false }).limit(60)), [supabase]);
  useRealtimeRefetch(["challenge_done"], () => void done.refetch());
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const day = berlinDateString();
  const rows = React.useMemo(() => done.data ?? [], [done.data]);
  const mine = rows.find((r) => r.day === day && r.user_id === me.id);
  const theirs = partner ? rows.find((r) => r.day === day && r.user_id === partner.id) : null;
  // Days in a row where both of you did it (real data only).
  const streak = React.useMemo(() => {
    const both = new Map<string, number>();
    for (const r of rows) both.set(r.day, (both.get(r.day) ?? 0) + 1);
    let n = 0;
    const d = new Date();
    if ((both.get(berlinDateString(d)) ?? 0) < 2) d.setDate(d.getDate() - 1);
    while ((both.get(berlinDateString(d)) ?? 0) >= 2) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }, [rows]);

  const complete = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("challenge_complete", { p_note: note.trim() || undefined });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    setNote("");
    void done.refetch();
  };

  const history = Array.from(new Set(rows.map((r) => r.day))).filter((d) => d !== day).slice(0, 14);
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="daily challenge"
        title={
          <>
            one little thing, <em className="text-primary">every day</em>
          </>
        }
        description="Jeden Tag dieselbe kleine Aufgabe für euch beide. Kein Druck, nur ein Anlass."
      />
      <Section icon={<Sparkles />} title="Heute" description={today.data ? CAT[today.data.category] : undefined} actions={streak ? <span className="inline-flex items-center gap-1 text-[13px]"><Flame className="size-4 text-primary" /> {streak} {streak === 1 ? "Tag" : "Tage"} zusammen</span> : null}>
        {today.loading ? (
          <Skeleton className="h-20" />
        ) : today.data ? (
          <p className="font-display text-[1.9rem] leading-tight text-balance">{today.data.body}</p>
        ) : (
          <p className="text-danger">{today.error}</p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Status label="Du" row={mine} />
          {partner ? <Status label={partner.display_name} row={theirs} /> : null}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void complete();
          }}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} placeholder={mine ? "Notiz ändern (optional)" : "Wie war’s? (optional)"} aria-label="Notiz zur Challenge" className="min-w-0 flex-1" />
          <Button type="submit" disabled={busy}>
            <Check /> {mine ? "Speichern" : "Geschafft"}
          </Button>
        </form>
      </Section>
      <Section icon={<History />} title="Die letzten Tage" className="mt-5">
        {history.length ? (
          <ul className="divide-y divide-border">
            {history.map((d) => {
              const rs = rows.filter((r) => r.day === d);
              return (
                <li key={d} className="py-3 text-[14px]">
                  <p className="text-[12.5px] text-muted-foreground">{formatDate(d, { weekday: "long", day: "numeric", month: "long" })}</p>
                  <p className="mt-0.5">{(rs[0]?.challenges as { body: string } | null)?.body}</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    {rs.map((r) => `${r.user_id === me.id ? "Du" : nameOf(r.user_id)} ✓${r.note ? ` „${r.note}“` : ""}`).join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">Hier erscheinen eure erledigten Challenges.</p>
        )}
      </Section>
    </PageContainer>
  );
}

function Status({ label, row }: { label: string; row: { note: string | null } | null | undefined }) {
  return (
    <div className="rounded-xl bg-muted p-3 text-[14px]">
      <p className="font-medium">
        {label} {row ? "✓" : ""}
      </p>
      <p className="text-[12.5px] text-muted-foreground">{row ? (row.note ? `„${row.note}“` : "geschafft") : "noch offen"}</p>
    </div>
  );
}
