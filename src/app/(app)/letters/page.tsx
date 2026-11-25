import type { Metadata } from "next";
import { LettersPage } from "@/components/letters/letters-page";

export const metadata: Metadata = { title: "Letters" };

export default function Page() {
  return <LettersPage />;
}
