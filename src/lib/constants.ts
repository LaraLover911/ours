import type { Accent } from "@/types/app";

export const APP_NAME = "ours.";
export const CLAIM = "just us, in our own little universe.";

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "cherry", label: "Deep Cherry", swatch: "#6F293E" },
  { id: "rose", label: "Dusty Rose", swatch: "#9C4A64" },
  { id: "lavender", label: "Lavender", swatch: "#5E4F8C" },
  { id: "sage", label: "Sage", swatch: "#46634F" },
  { id: "ocean", label: "Ocean", swatch: "#2C5878" },
  { id: "peach", label: "Terracotta", swatch: "#A24C34" },
];

export const MEMORY_CATEGORIES = [
  { id: "date", label: "Date", emoji: "🍷" },
  { id: "reise", label: "Reise", emoji: "✈️" },
  { id: "alltag", label: "Alltag", emoji: "☕" },
  { id: "meilenstein", label: "Meilenstein", emoji: "✨" },
  { id: "feier", label: "Feier", emoji: "🎉" },
  { id: "sonstiges", label: "Sonstiges", emoji: "♡" },
] as const;

export const LETTER_CATEGORIES = [
  { id: "miss", label: "Open when you miss me", short: "miss me", color: "#DDA9BB" },
  { id: "sad", label: "Open when you're sad", short: "sad", color: "#B9C4DD" },
  { id: "sleep", label: "Open when you can't sleep", short: "can't sleep", color: "#5B4F7A" },
  { id: "happy", label: "Open when you're happy", short: "happy", color: "#F2C879" },
  { id: "hug", label: "Open when you need a hug", short: "need a hug", color: "#F0B49E" },
  { id: "smile", label: "Open when you need to smile", short: "need to smile", color: "#A9CDB3" },
  { id: "love", label: "Open when you love me", short: "love me", color: "#6F293E" },
  { id: "anytime", label: "Open anytime", short: "anytime", color: "#E9DCCF" },
] as const;
export type LetterCategory = (typeof LETTER_CATEGORIES)[number]["id"];

export const MOODS = [
  { id: "happy", label: "happy", emoji: "😊" },
  { id: "inlove", label: "in love", emoji: "🥰" },
  { id: "calm", label: "calm", emoji: "🌿" },
  { id: "grateful", label: "grateful", emoji: "🙏" },
  { id: "excited", label: "excited", emoji: "✨" },
  { id: "missing", label: "missing you", emoji: "🥺" },
  { id: "tired", label: "tired", emoji: "😴" },
  { id: "sad", label: "sad", emoji: "🌧️" },
  { id: "stressed", label: "stressed", emoji: "😵‍💫" },
] as const;

export const DATE_CATEGORIES = [
  { id: "restaurant", label: "Restaurant", emoji: "🍝" },
  { id: "kino", label: "Kino", emoji: "🎬" },
  { id: "reise", label: "Reise", emoji: "🧳" },
  { id: "aktivitaet", label: "Aktivität", emoji: "🎡" },
  { id: "zuhause", label: "Zuhause", emoji: "🕯️" },
  { id: "sonstiges", label: "Sonstiges", emoji: "♡" },
] as const;

export const DATE_STATUS = [
  { id: "idee", label: "Idee" },
  { id: "geplant", label: "Geplant" },
  { id: "erledigt", label: "Erledigt" },
] as const;

export const REACTION_EMOJIS = ["❤️", "😂", "🥺", "😍", "🔥", "😮", "👍"];
