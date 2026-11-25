import type { Metadata } from "next";
import { DatesPage } from "@/components/dates/dates-page";

export const metadata: Metadata = { title: "Dates" };

export default function Page() {
  return <DatesPage />;
}
