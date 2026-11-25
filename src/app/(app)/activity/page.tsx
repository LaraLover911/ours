import type { Metadata } from "next";
import { ActivityPage } from "@/components/activity/activity-page";

export const metadata: Metadata = { title: "Aktivität" };

export default function Page() {
  return <ActivityPage />;
}
