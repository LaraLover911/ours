import type { Database } from "./database";

type Tables = Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];
export type Insert<T extends keyof Tables> = Tables[T]["Insert"];
export type Update<T extends keyof Tables> = Tables[T]["Update"];

export type Profile = Row<"profiles">;
export type CoupleSettings = Row<"couple_settings">;
export type Conversation = Row<"conversations">;
export type Message = Row<"messages">;
export type Reaction = Row<"message_reactions">;
export type ConversationRead = Row<"conversation_reads">;
export type Memory = Row<"memories">;
export type MemoryMedia = Row<"memory_media">;
export type MemoryComment = Row<"memory_comments">;
export type DiaryEntry = Row<"diary_entries">;
export type DiaryComment = Row<"diary_comments">;
export type LoveLetter = Row<"love_letters">;
export type DateIdea = Row<"date_ideas">;
export type DateVote = Row<"date_votes">;
export type DailyQuestion = Row<"daily_questions">;
export type QuestionAnswer = Row<"question_answers">;
export type GameResponse = Row<"game_responses">;
export type Song = Row<"songs">;
export type Surprise = Row<"surprises">;

export type Role = "abdullah" | "lara";
export type Accent = "cherry" | "rose" | "lavender" | "sage" | "ocean" | "peach";
export type ThemePref = "system" | "light" | "dark";

export type MessageMeta = {
  width?: number;
  height?: number;
  duration?: number;
  mime?: string;
  size?: number;
  name?: string;
  waveform?: number[];
  deleted_kind?: string;
};
