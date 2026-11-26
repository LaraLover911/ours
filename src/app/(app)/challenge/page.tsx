import type { Metadata } from "next";
import { ChallengePage } from "@/components/couple/challenge-page";

export const metadata: Metadata = { title: "Challenge" };

export default function Page() {
  return <ChallengePage />;
}
