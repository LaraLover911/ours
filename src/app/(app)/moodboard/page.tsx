import type { Metadata } from "next";
import { MoodboardPage } from "@/components/couple/moodboard-page";

export const metadata: Metadata = { title: "Moodboard" };

export default function Page() {
  return <MoodboardPage />;
}
