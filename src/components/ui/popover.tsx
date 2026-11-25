"use client";

import * as React from "react";
import { Popover as P } from "radix-ui";
import { cn } from "@/lib/utils";

const Popover = P.Root;
const PopoverTrigger = P.Trigger;
const PopoverAnchor = P.Anchor;

function PopoverContent({ className, sideOffset = 8, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        className={cn("z-50 rounded-[1rem] border border-border bg-card p-2 shadow-lift outline-none data-[state=open]:animate-[pop-in_160ms_ease-out]", className)}
        {...props}
      />
    </P.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
