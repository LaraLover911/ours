"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/heart";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function NoAccess() {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo className="text-4xl" />
      <h1 className="font-display mt-8 text-4xl">kein Zugang</h1>
      <p className="mt-3 text-muted-foreground">
        Dieses Konto gehört nicht zu ours. Nur Abdullah und Lara haben hier ein Profil.
      </p>
      <Button
        className="mt-8"
        variant="outline"
        onClick={async () => {
          await getSupabaseBrowserClient().auth.signOut();
          router.replace("/login");
          router.refresh();
        }}
      >
        Abmelden
      </Button>
    </main>
  );
}
