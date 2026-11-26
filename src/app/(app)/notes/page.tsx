import type { Metadata } from "next";
import { NotesPage } from "@/components/couple/notes-page";

export const metadata: Metadata = { title: "Notizen" };

export default function Page() {
  return <NotesPage />;
}
