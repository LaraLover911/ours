import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayRoom } from "@/components/play/play-room";

export const metadata: Metadata = { title: "Play Together" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <PlayRoom id={id} />;
}
