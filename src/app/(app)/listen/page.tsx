import type { Metadata } from "next";
import { ListenLobby } from "@/components/listen/listen-lobby";

export const metadata: Metadata = { title: "Listen Together" };

export default function Page() {
  return <ListenLobby />;
}
