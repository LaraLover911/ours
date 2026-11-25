"use client";

import { ErrorState } from "@/components/shared/states";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-5 py-24">
      <ErrorState message="Hier ist etwas schiefgelaufen. Versuch es bitte nochmal." onRetry={reset} />
    </div>
  );
}
