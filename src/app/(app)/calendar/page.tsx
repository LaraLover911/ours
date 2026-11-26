import type { Metadata } from "next";
import { CalendarPage } from "@/components/couple/calendar-page";

export const metadata: Metadata = { title: "Kalender" };

export default function Page() {
  return <CalendarPage />;
}
