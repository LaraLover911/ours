import type { Metadata } from "next";
import { ClipsPage } from "@/components/clips/clips-page";

export const metadata: Metadata = { title: "Clips" };

export default function Page() {
  return <ClipsPage />;
}
