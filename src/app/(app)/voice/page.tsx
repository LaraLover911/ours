import type { Metadata } from "next";
import { VoicePage } from "@/components/couple/voice-page";

export const metadata: Metadata = { title: "Sprachnotizen" };

export default function Page() {
  return <VoicePage />;
}
