export type Mood = "sleeping" | "missed_you" | "sleepy" | "hungry" | "messy" | "bored" | "happy" | "calm";
export type Stats = { hunger: number; energy: number; joy: number; clean: number };
export type RoomId = "living" | "bedroom" | "garden";
export type Cue = { kind: string; at: number; by?: string | null };

export const MOOD_TEXT: Record<Mood, string> = {
  sleeping: "schläft tief und fest",
  missed_you: "hat euch vermisst und freut sich riesig",
  sleepy: "ist ein bisschen müde",
  hungry: "hätte gern einen Snack",
  messy: "würde gern gebadet werden",
  bored: "möchte spielen",
  happy: "ist rundum glücklich",
  calm: "ist ganz entspannt",
};

export const STAT_LABEL: Record<keyof Stats, string> = { hunger: "Satt", energy: "Energie", joy: "Freude", clean: "Sauber" };

export const STAGES = [
  { name: "Reiskorn", xp: 0, hint: "ganz klein, mit einem winzigen Keimling" },
  { name: "Knospe", xp: 200, hint: "größer, mit zwei Blättchen" },
  { name: "Blüte", xp: 600, hint: "mit einer kleinen Blütenknospe" },
  { name: "Mondblüte", xp: 1500, hint: "voll erblüht" },
] as const;

export const ROOMS: { id: RoomId; name: string; short: string }[] = [
  { id: "living", name: "Wohnzimmer", short: "Wohnen" },
  { id: "bedroom", name: "Schlafzimmer", short: "Schlafen" },
  { id: "garden", name: "Garten", short: "Garten" },
];

export const QUEST_TEXT: Record<string, string> = {
  feed: "Füttere Mochi",
  pet: "Streichle Mochi",
  play: "Spiel mit Mochi",
  minigame: "Spiel eine Runde Snack-Fangen",
  clean: "Bade Mochi",
};

export const ACHIEVEMENTS: { key: string; name: string; hint: string }[] = [
  { key: "first_feed", name: "Erster Snack", hint: "Mochi zum ersten Mal gefüttert" },
  { key: "first_buy", name: "Shopping", hint: "Etwas im Shop gekauft" },
  { key: "furniture_5", name: "Gemütlich", hint: "5 Möbelstücke aufgestellt" },
  { key: "minigame_50", name: "Schnelle Pfoten", hint: "50 Punkte bei Snack-Fangen" },
  { key: "quests_10", name: "Fleißig", hint: "10 Tagesaufgaben eingelöst" },
  { key: "reunion", name: "Wiedersehen", hint: "Nach langer Zeit wieder da" },
  { key: "bond_5", name: "Vertraut", hint: "Mochis Vertrauen hat Stufe 5 erreicht" },
  { key: "stage_1", name: "Knospe", hint: "Mochi ist zum ersten Mal gewachsen" },
  { key: "stage_2", name: "Blüte", hint: "Mochi hat eine Blütenknospe" },
  { key: "stage_3", name: "Mondblüte", hint: "Mochi ist voll erblüht" },
];

export const EVENT_TEXT: Record<string, string> = {
  feed: "hat Mochi gefüttert",
  play: "hat mit Mochi gespielt",
  clean: "hat Mochi gebadet",
  pet: "hat Mochi gestreichelt",
  sleep: "hat Mochi schlafen gelegt",
  wake: "hat Mochi geweckt",
  buy: "hat eingekauft",
  furnish: "hat umgeräumt",
  quest: "hat eine Aufgabe eingelöst",
  minigame: "hat Snack-Fangen gespielt",
  evolve: "war dabei, als Mochi gewachsen ist",
};

export const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/** Room coordinates (-1..1) to world units on the 3D floor. */
export const ROOM_HALF = 1.7;
