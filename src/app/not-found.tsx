import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-display mt-4 text-5xl">lost, but together.</h1>
      <p className="mt-3 text-muted-foreground">Diese Seite gibt es in unserer kleinen Welt nicht.</p>
      <Button asChild className="mt-8">
        <Link href="/">Nach Hause</Link>
      </Button>
    </main>
  );
}
