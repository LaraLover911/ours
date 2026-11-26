"use client";

import * as React from "react";
import { Switch as S } from "radix-ui";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "peer relative inline-flex h-7 w-12 shrink-0 before:absolute before:-inset-2 before:content-[''] cursor-pointer items-center rounded-full border border-transparent bg-border-strong p-0.5 transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring data-[state=checked]:bg-primary disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] data-[state=checked]:translate-x-5" />
    </S.Root>
  );
}

export { Switch };
