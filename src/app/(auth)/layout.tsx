import { HeartGlyph, Logo, Sparkle } from "@/components/shared/heart";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-cherry text-blush lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="absolute -top-32 -left-24 size-[34rem] rounded-full bg-[#8d3a53] opacity-70 blur-3xl" />
        <div aria-hidden className="absolute -right-24 -bottom-40 size-[30rem] rounded-full bg-dusty-rose opacity-30 blur-3xl" />
        <div aria-hidden className="paper-grain absolute inset-0 opacity-60" />
        <Logo className="relative text-[2.2rem] text-blush [&_span]:text-dusty-rose" />
        <div className="relative">
          <p className="eyebrow !text-dusty-rose">a space for two</p>
          <h2 className="font-display mt-4 text-[5.5rem] leading-[0.86] xl:text-[7rem]">
            just us,
            <br />
            <em className="text-dusty-rose">in our own</em>
            <br />
            little universe.
          </h2>
        </div>
        <div className="relative flex items-center gap-3 text-sm text-blush/80">
          <HeartGlyph className="size-4 animate-heartbeat text-dusty-rose" /> Abdullah &amp; Lara
        </div>
        <Sparkle className="absolute top-[22%] right-[18%] size-6 animate-float text-dusty-rose/70" />
        <HeartGlyph className="absolute right-[30%] bottom-[30%] size-5 animate-float text-blush/40 [--r:-12deg] [animation-delay:-3s]" />
        <Sparkle className="absolute bottom-[18%] left-[42%] size-3 animate-float text-blush/50 [animation-delay:-5s]" />
      </aside>
      <main className="relative flex min-h-dvh flex-col overflow-hidden px-5 pt-[calc(var(--safe-top)+1.5rem)] pb-[calc(var(--safe-bottom)+1.5rem)] sm:px-10">
        <div aria-hidden className="absolute -top-40 -right-40 size-[28rem] rounded-full bg-blush opacity-70 blur-3xl lg:hidden" />
        <div className="relative flex items-center justify-between lg:hidden">
          <Logo />
          <span className="eyebrow">a space for two</span>
        </div>
        <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <p className="relative text-center text-xs text-muted-foreground">nur für Abdullah &amp; Lara ♡</p>
      </main>
    </div>
  );
}
