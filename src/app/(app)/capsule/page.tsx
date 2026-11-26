import type { Metadata } from "next";
import { CapsulePage } from "@/components/couple/capsule-page";

export const metadata: Metadata = { title: "Zeitkapsel" };

export default function Page() {
  return <CapsulePage />;
}
