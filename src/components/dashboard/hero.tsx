"use client";

import * as React from "react";
import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/shared/avatar";
import { HeartGlyph, Logo, Sparkle } from "@/components/shared/heart";
import { LocalImage, PhotoRefImage } from "@/components/shared/media";
import { SplitHeadline } from "@/components/animations/split-headline";
import { useGsapEffect } from "@/components/animations/reveal";
import { FloatingDecor } from "@/components/animations/floating-decor";
import { Button } from "@/components/ui/button";
import { localPhotos } from "@/lib/photos";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "still awake?";
  if (h < 11) return "good morning";
  if (h < 17) return "hey you two";
  if (h < 22) return "good evening";
  return "sweet dreams soon";
}

export function DashboardTopBar() {
  const { me, partner, partnerOnline } = useApp();
  return (
    <div className="flex items-center justify-between gap-3 lg:hidden">
      <div className="flex items-center gap-2.5">
        <Logo />
        <span className="rounded-full border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground">a space for two</span>
      </div>
      <Link href="/settings" className="flex items-center" aria-label="Profile & Einstellungen">
        <Avatar profile={me} size="sm" ring />
        <HeartGlyph className="relative z-10 -mx-1 size-3.5 animate-heartbeat text-primary" />
        <Avatar profile={partner} size="sm" ring online={partnerOnline} />
      </Link>
    </div>
  );
}

const noopSubscribe = () => () => {};

export function Hero() {
  const { me, partner, settings } = useApp();
  const together = localPhotos("together");
  const heroValue = settings.hero_image ?? (together[0] ? `local:${together[0].id}` : null);
  const secondary = together.find((p) => `local:${p.id}` !== heroValue);
  const ref = React.useRef<HTMLElement>(null);
  const hello = React.useSyncExternalStore(noopSubscribe, greeting, () => "hey");

  useGsapEffect(ref, ({ gsap }, el) => {
    const frame = el.querySelector("[data-hero-frame]");
    const img = el.querySelector("[data-hero-img]");
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.from(el.querySelectorAll("[data-hero-fade]"), { autoAlpha: 0, y: 16, duration: 0.9, stagger: 0.08 }, 0.35);
    if (frame) tl.from(frame, { clipPath: "inset(18% 12% 18% 12% round 28px)", duration: 1.4 }, 0.1);
    if (img) tl.from(img, { scale: 1.18, duration: 1.8 }, 0.1);
    tl.from(el.querySelectorAll("[data-hero-polaroid]"), { autoAlpha: 0, y: 40, rotate: 0, duration: 1.1, stagger: 0.12 }, 0.7);
    if (window.innerWidth >= 1024 && img) {
      gsap.to(img, { yPercent: 8, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true } });
    }
  });

  return (
    <section ref={ref} aria-label="Willkommen" className="relative grid items-center gap-8 pt-4 pb-6 md:pt-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-12">
      <div className="relative z-10 order-2 lg:order-1">
        <p data-hero-fade className="eyebrow flex items-center gap-2">
          <span className="inline-block size-1.5 rounded-full bg-primary" /> {hello}
        </p>
        <p data-hero-fade className="mt-3 text-[15px] text-muted-foreground">
          hey {me.role === "abdullah" ? me.display_name : (partner?.display_name ?? "Abdullah")} &amp;{" "}
          {me.role === "lara" ? me.display_name : (partner?.display_name ?? "Lara")} <span className="text-primary">♡</span>
        </p>
        <SplitHeadline
          className="mt-4 text-[3.6rem] leading-[0.88] sm:text-[5.2rem] xl:text-[6.6rem]"
          lines={["somewhere between", <em key="em" className="text-primary">you &amp; me.</em>]}
        />
        <p data-hero-fade className="mt-5 max-w-md text-[17px] text-muted-foreground">
          our little world, {me.role === "abdullah" ? me.display_name : (partner?.display_name ?? "Abdullah")} &amp;{" "}
          {me.role === "lara" ? me.display_name : (partner?.display_name ?? "Lara")}.
        </p>
        <div data-hero-fade className="mt-7 flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/chat">
              <HeartGlyph className="size-4" /> miss you? schreib {partner?.display_name ?? ""}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/memories">our story so far</Link>
          </Button>
        </div>
      </div>

      <div className="relative order-1 lg:order-2">
        <div data-hero-frame className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-blush shadow-lift sm:aspect-[5/4] lg:aspect-[4/5]">
          <div data-hero-img className="absolute inset-0">
            <PhotoRefImage
              value={heroValue}
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="absolute inset-0"
              alt={`${me.display_name} & ${partner?.display_name ?? ""}`}
              fallback={<HeroFallback />}
            />
          </div>
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent" />
          <span className="glass absolute bottom-4 left-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <HeartGlyph className="size-3 animate-heartbeat text-primary" /> just us
          </span>
        </div>
        {secondary ? (
          <figure data-hero-polaroid className="polaroid absolute -bottom-8 -left-4 hidden w-40 -rotate-6 sm:block lg:-left-10 lg:w-44">
            <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-3" />
            <LocalImage photo={secondary} sizes="180px" className="aspect-square rounded-[2px]" />
            <figcaption className="font-display absolute inset-x-0 bottom-1.5 text-center text-lg text-charcoal">us ♡</figcaption>
          </figure>
        ) : null}
        <Sparkle data-hero-polaroid className="absolute -top-3 -right-2 size-7 text-dusty-rose" />
      </div>
    </section>
  );
}

function HeroFallback() {
  const { me, partner } = useApp();
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(120%_90%_at_20%_10%,#f9e9ef_0%,#f3dde5_40%,#dda9bb_100%)]">
      <FloatingDecor tone="light" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="flex items-center">
          <Avatar profile={me} size="xl" ring />
          <HeartGlyph className="relative z-10 -mx-3 size-8 animate-heartbeat text-cherry" />
          <Avatar profile={partner} size="xl" ring />
        </div>
        <p className="font-display max-w-[16rem] text-3xl leading-tight text-cherry">our photo goes right here.</p>
        <Button asChild variant="outline" size="sm" className="bg-white/70">
          <Link href="/settings#photos">
            <ImagePlus /> Foto auswählen
          </Link>
        </Button>
      </div>
    </div>
  );
}
