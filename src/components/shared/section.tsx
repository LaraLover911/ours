import * as React from "react";
import { cn } from "@/lib/utils";

export function Section({
  id,
  icon,
  title,
  description,
  actions,
  children,
  className,
}: {
  id?: string;
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-h`} className={cn("card-surface scroll-mt-24 p-5 sm:p-7", className)}>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        {icon ? <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&_svg]:size-[18px]">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <h2 id={`${id ?? title}-h`} className="font-display text-[1.9rem] leading-none">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3.5 first:border-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-[15px]">{label}</p>
        {hint ? <p className="text-[12.5px] text-pretty text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
