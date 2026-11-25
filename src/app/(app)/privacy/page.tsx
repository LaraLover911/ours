import type { Metadata } from "next";
import { PrivacyPage } from "@/components/privacy/privacy-page";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return <PrivacyPage />;
}
