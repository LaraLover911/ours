import type { Metadata } from "next";
import { GoalsPage } from "@/components/couple/goals-page";

export const metadata: Metadata = { title: "Ziele" };

export default function Page() {
  return <GoalsPage />;
}
