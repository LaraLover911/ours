import type { LucideIcon } from "lucide-react";
import { Brain, Castle, CircleDot, Dices, Grid3x3, HeartHandshake, MessageCircleQuestion, Shuffle, Sparkles, Zap } from "lucide-react";

export type GameId = "tictactoe" | "connect4" | "quiz" | "thisorthat" | "truthordare" | "reaction" | "memory" | "chess" | "guess" | "datechallenge";

export type GameMeta = {
  id: GameId;
  title: string;
  hint: string;
  how: string;
  icon: LucideIcon;
  tone: string;
  /** "coop": you play together, nobody wins. */
  mode: "versus" | "coop";
};

export const GAMES: GameMeta[] = [
  { id: "tictactoe", title: "Tic Tac Toe", hint: "der Klassiker, schnell", how: "Drei gleiche Zeichen in einer Reihe gewinnen.", icon: Grid3x3, tone: "from-[#f3dde5] to-[#dda9bb]", mode: "versus" },
  { id: "connect4", title: "Vier gewinnt", hint: "Steine fallen lassen", how: "Vier eigene Steine in einer Reihe, Spalte oder Diagonale.", icon: CircleDot, tone: "from-[#f8e6de] to-[#f0c3ae]", mode: "versus" },
  { id: "chess", title: "Schach", hint: "für lange Abende", how: "Alle Regeln inklusive Rochade, en passant und Umwandlung. Remis kann angeboten werden.", icon: Castle, tone: "from-[#efe6e0] to-[#d9c3b6]", mode: "versus" },
  { id: "memory", title: "Memory", hint: "Paare finden", how: "Deckt abwechselnd zwei Karten auf. Ein Paar gibt einen Punkt und noch einen Zug.", icon: Sparkles, tone: "from-[#e8e4f3] to-[#c9bfe6]", mode: "versus" },
  { id: "reaction", title: "Reaction Battle", hint: "wer ist schneller?", how: "Tippt, sobald es grün wird. Wer zu früh tippt, verliert die Runde. Drei Runden gewinnen.", icon: Zap, tone: "from-[#fdf0cf] to-[#f4d27a]", mode: "versus" },
  { id: "quiz", title: "Couple Quiz", hint: "wie gut kennt ihr euch?", how: "Beantwortet jede Frage über euch selbst und ratet, was der andere wählt. Antworten bleiben verdeckt, bis ihr beide fertig seid.", icon: Brain, tone: "from-[#e4ede6] to-[#bcd5c3]", mode: "versus" },
  { id: "guess", title: "Guess My Answer", hint: "frei schreiben, raten", how: "Einer schreibt eine Antwort, der andere rät. Wer geantwortet hat, entscheidet, ob es zählt.", icon: MessageCircleQuestion, tone: "from-[#e2ecf3] to-[#b5cfe2]", mode: "versus" },
  { id: "thisorthat", title: "This or That", hint: "wie einig seid ihr?", how: "Beide wählen gleichzeitig. Am Ende seht ihr, wie oft ihr gleich gewählt habt.", icon: Shuffle, tone: "from-[#f3e6f0] to-[#e0bdd6]", mode: "coop" },
  { id: "truthordare", title: "Wahrheit oder Pflicht", hint: "zehn Karten", how: "Wer dran ist, wählt. Der andere bestätigt, wenn es erledigt ist.", icon: Dices, tone: "from-[#f6e0dc] to-[#e7aba3]", mode: "versus" },
  { id: "datechallenge", title: "Random Date Challenge", hint: "eine Idee für euch", how: "Zieht eine Date-Idee, bis zu dreimal neu. Nehmt sie beide an und hakt sie ab, wenn ihr sie gemacht habt.", icon: HeartHandshake, tone: "from-[#e6efe0] to-[#c4d9b3]", mode: "coop" },
];

export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

/** Emoji faces for the memory cards (the server only knows numbers 0–15). */
export const MEMORY_FACES = ["🌷", "🍓", "🌙", "🧸", "🍒", "🐝", "🌈", "🍦", "🎈", "🐚", "🦋", "🍋", "🌻", "🎀", "🐱", "☕"];
