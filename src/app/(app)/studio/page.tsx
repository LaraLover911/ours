import type { Metadata } from "next";
import { StudioPage } from "@/components/studio/studio-page";

export const metadata: Metadata = { title: "Studio" };

export default function Page() {
  return <StudioPage />;
}
