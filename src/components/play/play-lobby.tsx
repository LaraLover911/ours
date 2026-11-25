"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronRight, Gamepad2, History, Inbox, RotateCcw, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { usePresence } from "@/hooks/use-presence";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/utils/errors";
import { timeAgo } from "@/lib/utils/dates";
import { GAMES, GAME_BY_ID, type GameId } from "@/lib/games/catalog";
import { resultText } from "./play-room";
import type { GameRoom } from "./use-game-room";

export function PlayLobby() {
  const { supabase, me, partner } = useApp();
  const router = useRouter();
  const presence = usePresence();
  const partnerName = partner?.display_name ?? "dein Schatz";
  const [busy, setBusy] = React.useState<string | null>(null);

  const rooms = useQuery(async () => must(await supabase.from("game_rooms").select("*").order("updated_at", { ascending: false }).limit(60)) as GameRoom[], [supabase]);
  const board = useQuery(async () => must(await supabase.rpc("game_scoreboard")) ?? [], [supabase]);
  useRealtimeRefetch(["game_rooms"], () => {
    void rooms.refetch();
    void board.refetch();
  });

  const now = useNow(60_000);
  const all = rooms.data ?? [];
  const fresh = (r: GameRoom) => now == null || now - new Date(r.created_at).getTime() < 86_400_000;
  const incoming = all.filter((r) => r.status === "invited" && r.guest_id === me.id && fresh(r));
  const outgoing = all.filter((r) => r.status === "invited" && r.created_by === me.id && fresh(r));
  const running = all.filter((r) => r.status === "active");
  const history = all.filter((r) => ["finished", "declined", "cancelled"].includes(r.status)).slice(0, 20);

  const start = async (game: GameId) => {
    setBusy(game);
    const { data, error } = await supabase.rpc("game_create", { p_game: game });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    router.push(`/play/${data}`);
  };
  const accept = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("game_accept", { p_room: id });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    router.push(`/play/${id}`);
  };
  const leave = async (id: string) => {
    const { error } = await supabase.rpc("game_leave", { p_room: id });
    if (error) toast.error(errorMessage(error));
    void rooms.refetch();
  };
  const rematch = async (r: GameRoom) => {
    const { data, error } = await supabase.rpc("game_create", { p_game: r.game, p_rematch_of: r.id });
    if (error) return toast.error(errorMessage(error));
    router.push(`/play/${data}`);
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("game_rooms").delete().eq("id", id);
    if (error) return toast.error(errorMessage(error));
    void rooms.refetch();
  };

  // Scoreboard: wins per person, only for games with a winner.
  const totals = React.useMemo(() => {
    const t = { me: 0, partner: 0, draws: 0, played: 0 };
    const perGame = new Map<string, { me: number; partner: number; played: number }>();
    for (const row of board.data ?? []) {
      if (GAME_BY_ID[row.game as GameId]?.mode !== "versus") continue;
      const g = perGame.get(row.game) ?? { me: 0, partner: 0, played: 0 };
      if (row.user_id === me.id) {
        g.me = Number(row.wins);
        g.played = Number(row.played);
        t.me += Number(row.wins);
        t.played += Number(row.played);
        t.draws += Number(row.draws);
      } else {
        g.partner = Number(row.wins);
        t.partner += Number(row.wins);
      }
      perGame.set(row.game, g);
    }
    return { t, perGame };
  }, [board.data, me.id]);

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="play together"
        title={
          <>
            game <em className="text-primary">night</em>
          </>
        }
        description={`Echte Spiele zu zweit, live auf euren Geräten. Jeder Zug wird vom Server geprüft. ${presence.online ? `${partnerName} ist gerade online.` : `${partnerName} ist gerade offline und bekommt deine Einladung als Benachrichtigung, falls aktiviert.`}`}
      />

      {incoming.length || outgoing.length || running.length ? (
        <div className="mb-6 grid gap-3">
          {incoming.map((r) => {
            const g = GAME_BY_ID[r.game as GameId];
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-surface flex flex-wrap items-center gap-3 border-primary/40 p-4">
                <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <g.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{partnerName} lädt dich ein: {g.title}</p>
                  <p className="text-[13px] text-muted-foreground">{timeAgo(r.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => leave(r.id)}>
                    Ablehnen
                  </Button>
                  <Button size="sm" disabled={busy === r.id} onClick={() => accept(r.id)}>
                    Annehmen
                  </Button>
                </div>
              </motion.div>
            );
          })}
          {[...running, ...outgoing].map((r) => {
            const g = GAME_BY_ID[r.game as GameId];
            const yourTurn = r.status === "active" && r.turn === me.id;
            return (
              <Link key={r.id} href={`/play/${r.id}`} className="card-surface flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <g.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{g.title}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {r.status === "invited" ? `wartet auf ${partnerName}` : yourTurn ? "du bist dran" : r.turn ? `${partnerName} ist dran` : "läuft"} · {timeAgo(r.updated_at)}
                  </p>
                </div>
                {yourTurn ? <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">dein Zug</span> : null}
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      ) : null}

      <Section icon={<Gamepad2 />} title="Spiele" description={`Tippe auf ein Spiel, um ${partnerName} einzuladen.`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g) => {
            const s = totals.perGame.get(g.id);
            return (
              <motion.button
                key={g.id}
                type="button"
                whileTap={{ scale: 0.98 }}
                disabled={!!busy || !partner}
                onClick={() => start(g.id)}
                className="group flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-lift disabled:opacity-60"
              >
                <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-[#4a2a35]", g.tone)}>
                  <g.icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{g.title}</span>
                  <span className="block text-[13px] text-muted-foreground">{busy === g.id ? "lade ein…" : g.hint}</span>
                  {s?.played ? (
                    <span className="mt-1 block text-[12px] text-muted-foreground">
                      {s.me} : {s.partner} Siege
                    </span>
                  ) : null}
                </span>
              </motion.button>
            );
          })}
        </div>
      </Section>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Section icon={<Trophy />} title="Punktestand" description="Gewonnene Spiele, nur Spiele mit Gewinner.">
          {board.loading ? (
            <Skeleton className="h-24" />
          ) : totals.t.played ? (
            <div className="grid grid-cols-3 items-end gap-2 text-center">
              <div>
                <p className="font-display text-5xl tabular-nums">{totals.t.me}</p>
                <p className="text-[13px] text-muted-foreground">du</p>
              </div>
              <div>
                <p className="font-display text-3xl text-muted-foreground tabular-nums">{totals.t.draws}</p>
                <p className="text-[13px] text-muted-foreground">unentschieden</p>
              </div>
              <div>
                <p className="font-display text-5xl tabular-nums">{totals.t.partner}</p>
                <p className="text-[13px] text-muted-foreground">{partnerName}</p>
              </div>
            </div>
          ) : (
            <p className="text-[14px] text-muted-foreground">Noch kein Spiel beendet.</p>
          )}
        </Section>

        <Section icon={<History />} title="Verlauf">
          {rooms.loading ? (
            <Skeleton className="h-32" />
          ) : history.length ? (
            <ul className="divide-y divide-border">
              {history.map((r) => {
                const g = GAME_BY_ID[r.game as GameId];
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <g.icon className="size-4 shrink-0 text-primary" />
                    <Link href={`/play/${r.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{g.title}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {resultText(r, me.id, partnerName)} · {timeAgo(r.finished_at ?? r.updated_at)}
                      </p>
                    </Link>
                    {r.status === "finished" ? (
                      <Button size="icon-sm" variant="ghost" aria-label="Revanche" onClick={() => rematch(r)}>
                        <RotateCcw />
                      </Button>
                    ) : null}
                    <Button size="icon-sm" variant="ghost" aria-label="Aus dem Verlauf löschen" onClick={() => remove(r.id)}>
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
              <Inbox className="size-4" /> Noch keine Spiele.
            </p>
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
