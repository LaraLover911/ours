import type { Metadata } from "next";
import { PetPage } from "@/components/pet/pet-page";

export const metadata: Metadata = { title: "Mochi" };

export default function Page() {
  return <PetPage />;
}
