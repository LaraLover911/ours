"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CallProvider } from "@/components/call/call-provider";
import { PopDelivery } from "@/components/pops/pop-delivery";
import { PushBootstrap } from "@/components/notifications/push-bootstrap";
import { LogOut, MoreHorizontal } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/shared/avatar";
import { HeartGlyph, Logo } from "@/components/shared/heart";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SmoothScroll } from "@/components/animations/smooth-scroll";
import { PhotoRefImage } from "@/components/shared/media";
import { cn } from "@/lib/utils";
import { MOBILE_PRIMARY, NAV_ITEMS, isActive } from "./nav-items";

function UnreadDot({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} ungelesen`}
      className={cn("grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10.5px] leading-none font-semibold text-primary-foreground", className)}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function useSignOut() {
  const router = useRouter();
  const { supabase } = useApp();
  return async () => {
    await supabase.auth.signOut();
    try {
      localStorage.removeItem("ours-theme");
    } catch {
      /* ignore */
    }
    router.replace("/login");
    router.refresh();
  };
}

function Sidebar() {
  const pathname = usePathname();
  const { me, partner, partnerOnline, unreadTotal } = useApp();
  const signOut = useSignOut();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col border-r border-border bg-background/80 px-3 py-5 lg:flex xl:w-[17rem]">
      <div className="flex items-center justify-between px-3">
        <Link href="/" aria-label="ours. Home">
          <Logo />
        </Link>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground">a space for two</span>
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
        <span className="flex -space-x-2.5">
          <Avatar profile={me} size="sm" ring />
          <Avatar profile={partner} size="sm" ring online={partnerOnline} />
        </span>
        <div className="min-w-0 text-[13px] leading-tight">
          <p className="truncate font-medium">
            {me.display_name} <HeartGlyph className="inline size-3 animate-heartbeat text-primary" /> {partner?.display_name ?? "…"}
          </p>
          <p className="truncate text-muted-foreground">{partnerOnline ? `${partner?.display_name} ist online` : "just us"}</p>
        </div>
      </div>

      <nav aria-label="Hauptnavigation" className="no-scrollbar mt-5 flex-1 overflow-y-auto">
        <ul className="grid gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {active ? (
                    <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-xl bg-card shadow-soft ring-1 ring-border" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                  ) : null}
                  <Icon className={cn("relative size-[18px]", active && "text-primary")} />
                  <span className="relative flex-1">{item.label}</span>
                  {item.href === "/chat" ? <UnreadDot count={unreadTotal} className="relative" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        onClick={signOut}
        className="mt-3 flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
      >
        <LogOut className="size-[18px]" /> Abmelden
      </button>
    </aside>
  );
}

function MobileNav({ hidden }: { hidden: boolean }) {
  const pathname = usePathname();
  const { unreadTotal, me, partner } = useApp();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const signOut = useSignOut();
  const primary = NAV_ITEMS.filter((i) => MOBILE_PRIMARY.includes(i.href));
  const more = NAV_ITEMS.filter((i) => !MOBILE_PRIMARY.includes(i.href));
  const moreActive = more.some((i) => isActive(pathname, i.href));


  return (
    <>
      <nav
        aria-label="Hauptnavigation"
        className={cn(
          "glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[var(--safe-bottom)] transition-transform duration-300 lg:hidden",
          hidden && "translate-y-full",
        )}
      >
        <ul className="mx-auto grid h-[var(--bottom-nav-h)] max-w-lg grid-cols-5 px-2">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="grid">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active ? "text-primary" : "text-muted-foreground")}
                >
                  <span className="relative">
                    <Icon className="size-[22px]" strokeWidth={active ? 2.1 : 1.7} />
                    {item.href === "/chat" ? <UnreadDot count={unreadTotal} className="absolute -top-1.5 -right-2.5" /> : null}
                  </span>
                  {item.label}
                  {active ? <motion.span layoutId="tab-dot" className="absolute top-1 size-1 rounded-full bg-primary" /> : null}
                </Link>
              </li>
            );
          })}
          <li className="grid">
            <button
              onClick={() => setMoreOpen(true)}
              className={cn("flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium", moreActive ? "text-primary" : "text-muted-foreground")}
              aria-haspopup="dialog"
            >
              <MoreHorizontal className="size-[22px]" />
              Mehr
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent variant="sheet">
          <DialogHeader>
            <DialogTitle>our little world</DialogTitle>
            <DialogDescription>
              {me.display_name} &amp; {partner?.display_name ?? "…"} ♡
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="grid grid-cols-3 gap-2.5">
              {more.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[13px] font-medium transition-transform active:scale-95",
                        active && "border-primary/30 bg-primary-soft text-primary-soft-foreground",
                      )}
                    >
                      <Icon className="size-6" strokeWidth={1.7} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <button onClick={signOut} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm text-muted-foreground hover:bg-muted">
              <LogOut className="size-4" /> Abmelden
            </button>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inConversation = /^\/chat\/[^/]+/.test(pathname);

  const { settings } = useApp();
  const fullBleed = pathname.startsWith("/chat") || pathname.startsWith("/clips");
  return (
    <CallProvider>
    <div className="flex min-h-dvh">
      {settings.background_image ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 opacity-[0.10] blur-[2px] saturate-[0.8] dark:opacity-[0.07]">
          <PhotoRefImage value={settings.background_image} className="absolute inset-0" sizes="100vw" />
        </div>
      ) : null}
      <SmoothScroll disabled={fullBleed} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        Zum Inhalt springen
      </a>
      <Sidebar />
      <div className="relative min-w-0 flex-1">
          <main
            id="main"
            key={pathname.startsWith("/chat") ? "/chat" : pathname}
            className={cn(
              "animate-page-in min-w-0",
              !fullBleed && "pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+1.5rem)] lg:pb-12",
            )}
          >
            {children}
          </main>
      </div>
      <MobileNav hidden={inConversation} />
    </div>
    <PopDelivery />
        <PushBootstrap />
    </CallProvider>
  );
}

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 pt-[calc(var(--safe-top)+1rem)] sm:px-6 lg:px-10 lg:pt-8", className)}>{children}</div>
  );
}
