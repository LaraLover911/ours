import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListenRoomPage } from "@/components/listen/listen-room";

export const metadata: Metadata = { title: "Listen Together" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <ListenRoomPage id={id} />;
}
