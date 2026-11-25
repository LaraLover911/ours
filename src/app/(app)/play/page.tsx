import type { Metadata } from "next";
import { PlayLobby } from "@/components/play/play-lobby";

export const metadata: Metadata = { title: "Play Together" };

export default function Page() {
  return <PlayLobby />;
}
