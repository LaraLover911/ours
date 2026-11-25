import type { Metadata } from "next";
import { QuestionsPage } from "@/components/questions/questions-page";

export const metadata: Metadata = { title: "Questions" };

export default function Page() {
  return <QuestionsPage />;
}
