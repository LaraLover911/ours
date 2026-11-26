import type { Metadata } from "next";
import { MapPage } from "@/components/couple/map-page";

export const metadata: Metadata = { title: "Unsere Welt" };

export default function Page() {
  return <MapPage />;
}
