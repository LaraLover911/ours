import type { Metadata } from "next";
import { DevicesPage } from "@/components/devices/devices-page";

export const metadata: Metadata = { title: "Geräte" };

export default function Page() {
  return <DevicesPage />;
}
