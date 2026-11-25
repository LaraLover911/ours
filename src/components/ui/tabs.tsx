"use client";

import * as React from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils";

const Tabs = T.Root;

function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn("no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-[0.9rem] bg-muted p-1", className)}
      {...props}
    />
  );
}

/** `panel={false}`: tabs used as a segmented filter without TabsContent (no dangling aria-controls). */
function TabsTrigger({ className, panel = true, ...props }: React.ComponentProps<typeof T.Trigger> & { panel?: boolean }) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[0.65rem] px-3.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-all outline-none focus-visible:ring-4 focus-visible:ring-ring data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-soft [&_svg]:size-4",
        className,
      )}
      {...props}
      {...(panel ? {} : { "aria-controls": undefined })}
    />
  );
}

const TabsContent = T.Content;

export { Tabs, TabsList, TabsTrigger, TabsContent };
