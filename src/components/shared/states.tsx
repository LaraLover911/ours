import * as React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HeartGlyph, Sparkle } from "./heart";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex flex-col items-center justify-center overflow-hidden rounded-[1.4rem] border border-dashed border-border-strong bg-card/60 px-6 py-12 text-center", className)}>
      <div className="relative mb-4 grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
        {icon ?? <HeartGlyph className="size-7" />}
        <Sparkle className="absolute -top-1 -right-1 size-4 text-dusty-rose" />
      </div>
      <h2 className="font-display text-[1.65rem] leading-tight text-balance">{title}</h2>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-[1.2rem] border border-danger/25 bg-danger/5 px-5 py-8 text-center", className)}>
      <AlertCircle className="size-6 text-danger" />
      <p className="max-w-sm text-sm">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw /> Nochmal versuchen
        </Button>
      ) : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span role="status" aria-label="Lädt" className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 pt-2 pb-6 sm:flex-row sm:items-end sm:justify-between md:pt-6 md:pb-10", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-[2.7rem] leading-[0.95] text-balance sm:text-6xl">{title}</h1>
        {description ? <p className="mt-3 max-w-xl text-[15px] text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
