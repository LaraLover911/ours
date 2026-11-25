"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  hideClose,
  variant = "center",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean; variant?: "center" | "sheet" | "full" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[3px] data-[state=open]:animate-[fade-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_150ms_ease-in]" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed z-50 flex flex-col bg-card text-card-foreground shadow-lift outline-none",
          variant === "center" &&
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.6rem] border-t border-border pb-safe data-[state=open]:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.4rem] sm:border sm:pb-0 sm:data-[state=open]:animate-[pop-in_240ms_cubic-bezier(0.22,1,0.36,1)]",
          variant === "sheet" &&
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[1.6rem] border-t border-border pb-safe data-[state=open]:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)]",
          variant === "full" && "inset-0 bg-black text-white",
          className,
        )}
        {...props}
      >
        {variant !== "full" ? (
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />
        ) : null}
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close
            className={cn(
              "absolute top-3 right-3 grid size-10 place-items-center rounded-full transition-colors",
              variant === "full" ? "bg-white/10 text-white hover:bg-white/20" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <X className="size-5" />
            <span className="sr-only">Schließen</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-1 px-5 pt-4 pb-2 pr-14 sm:px-6 sm:pt-6", className)} {...props} />;
}
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-lenis-prevent className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />;
}
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 border-t border-border px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6", className)} {...props} />;
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-display text-[1.9rem] leading-none", className)} {...props} />;
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription };
