import type { Metadata } from "next";
import { CallsPage } from "@/components/call/calls-page";

export const metadata: Metadata = { title: "Anrufe" };

export default function Page() {
  return <CallsPage />;
}
