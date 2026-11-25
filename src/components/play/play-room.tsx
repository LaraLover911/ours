"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flag, RotateCcw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRealtimeActivity } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Avatar } from "@/components/shared/avatar";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePresence } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/utils/errors";
import { GAME_BY_ID, type GameId } from "@/lib/games/catalog";
import { ConnectFour, Memory, TicTacToe } from "./boards";
import { ChessBoard } from "./chess-board";
import { DateChallenge, GuessMyAnswer, Quiz, ThisOrThat, TruthOrDare } from "./party";
import { Reaction } from "./reaction";
import { useGameRoom, type GameRoom, type RoomProps } from "./use-game-room";

const BOARDS: Record<GameId, React.ComponentType<RoomProps>> = {
  tictactoe: TicTacToe,
  connect4: ConnectFour,
  memory: Memory,
  chess: ChessBoard,
  reaction: Reaction,
  quiz: Quiz,
  thisorthat: ThisOrThat,
  guess: GuessMyAnswer,
  truthordare: TruthOrDare,
  datechallenge: DateChallenge,
};

const REASONS: Record<string, string> = {
  checkmate: "Schachmatt",
  stalemate: "Patt",
  material: "zu wenig Material",
  fifty: "50-Züge-Regel",
  repetition: "dreifache Wiederholung",
  agreed: "Remis vereinbart",
  resigned: "aufgegeben",
};

export function resultText(room: GameRoom, meId: string, partnerName: string): string {
  const s = room.state ?? {};
  if (room.status === "declined") return `${room.created_by === meId ? partnerName : "Du"} ${room.created_by === meId ? "hat" : "hast"} abgelehnt`;
  if (room.status === "cancelled") return "Abgebrochen";
  if (room.status !== "finished") return room.status === "invited" ? "Einladung offen" : "läuft";
  if (room.result === "abandoned") return "Beendet";
  if (room.game === "thisorthat") return `${s.matches} von ${s.pairs?.length ?? 0} gleich gewählt`;
  if (room.game === "datechallenge") return "Gemeinsam geschafft ♡";
  const reason = s.reason ? ` · ${REASONS[s.reason] ?? s.reason}` : "";
  if (room.result === "draw") return `Unentschieden${reason}`;
  return `${room.winner === meId ? "Du hast gewonnen" : `${partnerName} hat gewonnen`}${reason}`;
}

export function PlayRoom({ id }: { id: string }) {
  const { me, partner, supabase } = useApp();
  const router = useRouter();
  const presence = usePresence();
  const { room, error, pending, live, offset, move, acceptInvite, leave } = useGameRoom(id);
  const partnerName = partner?.display_name ?? "dein Schatz";
  useRealtimeActivity("game", room?.status === "active");

  if (error && room === undefined) return <PageContainer className="max-w-4xl"><ErrorState message={error} /></PageContainer>;
  if (room === undefined) {
    return (
      <PageContainer className="max-w-4xl">
        <Skeleton className="mt-8 h-96" />
      </PageContainer>
    );
  }
  if (room === null) {
    return (
      <PageContainer className="max-w-4xl">
        <EmptyState title="game not found" description="Dieses Spiel gibt es nicht mehr." action={<Button asChild><Link href="/play">Zur Lobby</Link></Button>} />
      </PageContainer>
    );
  }

  const meta = GAME_BY_ID[room.game as GameId];
  const Board = BOARDS[room.game as GameId];
  const scores = (room.state?.scores ?? {}) as Record<string, number>;
  const showScores = meta.mode === "versus" && !["tictactoe", "connect4", "chess"].includes(room.game);
  const props: RoomProps = { room, meId: me.id, partnerId: partner?.id ?? "", partnerName, move, pending, offset };
  const isHost = room.created_by === me.id;

  const rematch = async () => {
    const { data, error: err } = await supabase.rpc("game_create", { p_game: room.game, p_rematch_of: room.id });
    if (err) return toast.error(errorMessage(err));
    router.push(`/play/${data}`);
  };

  const turnLine = (() => {
    if (room.status !== "active") return null;
    if (room.turn) return room.turn === me.id ? "Du bist dran" : `${partnerName} ist dran`;
    return null;
  })();

  return (
    <PageContainer className="max-w-4xl">
      <div className="flex items-center gap-2 pt-2 pb-4 md:pt-6">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/play" aria-label="Zur Lobby">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">play together</p>
          <h1 className="truncate font-display text-[2.2rem] leading-none sm:text-5xl">{meta.title}</h1>
        </div>
        {!live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground" role="status">
            <WifiOff className="size-3.5" /> verbinde…
          </span>
        ) : null}
      </div>

      {/* Players */}
      <div className="card-surface mb-5 flex items-center gap-3 p-3 sm:p-4">
        <PlayerChip profile={me} name="Du" active={room.turn === me.id} score={showScores ? (scores[me.id] ?? 0) : undefined} />
        <span className="font-display text-xl text-muted-foreground">vs</span>
        <PlayerChip
          profile={partner}
          name={partnerName}
          active={room.turn === partner?.id}
          score={showScores ? (scores[partner?.id ?? ""] ?? 0) : undefined}
          online={presence.online}
          hint={presence.online ? (presence.activity === "game" ? "spielt gerade" : "online") : "offline"}
          align="right"
        />
      </div>

      {turnLine ? <p className={cn("mb-4 text-center text-[15px] font-medium", room.turn === me.id ? "text-primary" : "text-muted-foreground")} role="status">{turnLine}</p> : null}

      {room.status === "invited" ? (
        <div className="card-surface mx-auto max-w-md p-6 text-center">
          <meta.icon className="mx-auto mb-3 size-8 text-primary" />
          {isHost ? (
            <>
              <p className="text-[15px]">Einladung an {partnerName} geschickt. Sobald {partnerName} annimmt, geht es los.</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{presence.online ? `${partnerName} ist gerade online.` : `${partnerName} ist offline und bekommt eine Benachrichtigung, falls aktiviert.`}</p>
              <Button variant="outline" className="mt-5" disabled={pending} onClick={() => leave()}>
                Einladung zurückziehen
              </Button>
            </>
          ) : (
            <>
              <p className="text-[15px]">{partnerName} möchte {meta.title} mit dir spielen.</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{meta.how}</p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="outline" disabled={pending} onClick={() => leave()}>
                  Ablehnen
                </Button>
                <Button disabled={pending} onClick={() => acceptInvite()}>
                  Los geht&apos;s
                </Button>
              </div>
            </>
          )}
        </div>
      ) : room.status === "declined" || room.status === "cancelled" ? (
        <EmptyState title={room.status === "declined" ? "maybe later" : "cancelled"} description={resultText(room, me.id, partnerName)} action={<Button asChild><Link href="/play">Zur Lobby</Link></Button>} />
      ) : (
        <>
          <Board {...props} />
          {room.status === "finished" ? (
            <div className="card-surface mx-auto mt-6 max-w-md p-5 text-center" role="status">
              <p className="font-display text-3xl">{resultText(room, me.id, partnerName)}</p>
              {showScores ? (
                <p className="mt-1 text-[14px] text-muted-foreground">
                  {scores[me.id] ?? 0} : {scores[partner?.id ?? ""] ?? 0}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="outline" asChild>
                  <Link href="/play">Zur Lobby</Link>
                </Button>
                <Button onClick={rematch}>
                  <RotateCcw /> {room.game === "datechallenge" ? "Neue Challenge" : "Revanche"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-8 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={pending}
                onClick={() => {
                  if (window.confirm(meta.mode === "versus" && !["quiz", "guess", "truthordare"].includes(room.game) ? "Aufgeben? Dann gewinnt " + partnerName + "." : "Spiel beenden?")) void leave();
                }}
              >
                <Flag /> {meta.mode === "versus" && !["quiz", "guess", "truthordare"].includes(room.game) ? "Aufgeben" : "Beenden"}
              </Button>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

function PlayerChip({
  profile,
  name,
  active,
  score,
  online,
  hint,
  align = "left",
}: {
  profile: Parameters<typeof Avatar>[0]["profile"];
  name: string;
  active: boolean;
  score?: number;
  online?: boolean;
  hint?: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", align === "right" && "flex-row-reverse text-right")}>
      <Avatar profile={profile} size="sm" online={online} ring={active} />
      <div className="min-w-0">
        <p className={cn("truncate text-[15px] font-medium", active && "text-primary")}>{name}</p>
        {hint ? <p className="truncate text-[12px] text-muted-foreground">{hint}</p> : null}
      </div>
      {score != null ? <span className="font-display text-3xl tabular-nums">{score}</span> : null}
    </div>
  );
}
