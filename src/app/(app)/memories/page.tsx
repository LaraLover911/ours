import type { Metadata } from "next";
import { Suspense } from "react";
import { MemoriesPage } from "@/components/memories/memories-page";

export const metadata: Metadata = { title: "Memories" };

export default function Page() {
  return (
    <Suspense>
      <MemoriesPage />
    </Suspense>
  );
}
