import type { Metadata } from "next";
import { PhotoPage } from "@/components/couple/photo-page";

export const metadata: Metadata = { title: "Foto des Tages" };

export default function Page() {
  return <PhotoPage />;
}
