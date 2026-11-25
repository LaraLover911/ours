import type { Metadata } from "next";
import { GamesPage } from "@/components/games/games-page";

export const metadata: Metadata = { title: "Games" };

export default function Page() {
  return <GamesPage />;
}
