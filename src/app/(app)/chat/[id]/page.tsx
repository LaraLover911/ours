import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChatScreen } from "@/components/chat/chat-screen";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return (
    <Suspense>
      <ChatScreen conversationId={id} />
    </Suspense>
  );
}
