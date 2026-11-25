import type { Metadata } from "next";
import { Logo } from "@/components/shared/heart";

export const metadata: Metadata = { title: "Einrichtung" };

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-5 py-16">
      <Logo className="text-4xl" />
      <h1 className="font-display mt-10 text-5xl leading-none">almost ready ♡</h1>
      <p className="mt-4 text-muted-foreground">
        ours. ist noch nicht mit Supabase verbunden. Lege eine <code className="rounded bg-muted px-1.5 py-0.5 text-sm">.env.local</code> an
        (oder setze die Variablen in Vercel) und starte die App neu.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-2xl bg-charcoal p-5 text-[13px] leading-relaxed text-blush">
{`NEXT_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=https://deine-domain.vercel.app`}
      </pre>
      <p className="mt-6 text-sm text-muted-foreground">Die komplette Anleitung steht in der README.md im Projekt.</p>
    </main>
  );
}
