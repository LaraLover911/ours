import type { Metadata } from "next";
import { SurprisesPage } from "@/components/surprises/surprises-page";

export const metadata: Metadata = { title: "Surprises" };

export default function Page() {
  return <SurprisesPage />;
}
