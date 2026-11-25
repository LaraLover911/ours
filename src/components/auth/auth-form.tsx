"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Spinner } from "@/components/shared/states";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils/errors";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email("Bitte gib eine gültige E-Mail ein.");
const passwordSchema = z.string().min(8, "Mindestens 8 Zeichen.").max(72, "Maximal 72 Zeichen.");

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.includes("localhost")
    ? process.env.NEXT_PUBLIC_SITE_URL
    : window.location.origin;
}

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function PasswordInput(props: React.ComponentProps<"input">) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
        aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">
      {message}
    </p>
  );
}

function Heading({ eyebrow, title, text }: { eyebrow: string; title: React.ReactNode; text?: string }) {
  return (
    <div className="mb-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="font-display mt-3 text-[3.2rem] leading-[0.92]">{title}</h1>
      {text ? <p className="mt-3 text-[15px] text-muted-foreground">{text}</p> : null}
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = React.useState<string | null>(params.get("error"));
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = emailSchema.safeParse(fd.get("email"));
    const password = z.string().min(1, "Bitte gib dein Passwort ein.").safeParse(fd.get("password"));
    if (!email.success) return setError(email.error.issues[0].message);
    if (!password.success) return setError(password.error.issues[0].message);
    setPending(true);
    setError(null);
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.data, password: password.data });
    if (error) {
      setPending(false);
      return setError(errorMessage(error));
    }
    router.replace(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <>
      <Heading eyebrow="welcome back" title={<>hey love <span className="text-primary">♡</span></>} text="Melde dich an, um in unsere kleine Welt zu kommen." />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="E-Mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="du@beispiel.de" />
        </Field>
        <Field label="Passwort" htmlFor="password">
          <PasswordInput id="password" name="password" autoComplete="current-password" required placeholder="••••••••" />
        </Field>
        <div className="-mt-1 flex justify-end">
          <Link href="/forgot-password" className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Passwort vergessen?
          </Link>
        </div>
        <FormError message={error} />
        <Button type="submit" size="lg" disabled={pending} className="mt-1">
          {pending ? <Spinner /> : <>Anmelden <ArrowRight /></>}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Eingeladen, aber noch kein Konto?{" "}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          Einladung annehmen
        </Link>
      </p>
    </>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = emailSchema.safeParse(fd.get("email"));
    const password = passwordSchema.safeParse(fd.get("password"));
    if (!email.success) return setError(email.error.issues[0].message);
    if (!password.success) return setError(password.error.issues[0].message);
    if (fd.get("password") !== fd.get("password2")) return setError("Die Passwörter stimmen nicht überein.");
    setPending(true);
    setError(null);
    const { data, error } = await getSupabaseBrowserClient().auth.signUp({
      email: email.data,
      password: password.data,
      options: { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/` },
    });
    setPending(false);
    if (error) return setError(errorMessage(error));
    if (data.session) {
      router.replace("/");
      router.refresh();
    } else {
      setSentTo(email.data);
    }
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-primary-soft text-primary">
          <MailCheck className="size-7" />
        </div>
        <h1 className="font-display text-[2.6rem] leading-none">check your inbox</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          Wir haben dir eine Bestätigung an <strong className="text-foreground">{sentTo}</strong> geschickt. Klick auf den Link und du bist drin.
        </p>
        <Button asChild variant="outline" className="mt-8">
          <Link href="/login">Zum Login</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <Heading eyebrow="your invitation" title={<>come in, <em>love.</em></>} text="Nur die zwei eingeladenen E-Mails können ein Konto erstellen." />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Deine eingeladene E-Mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>
        <Field label="Passwort" htmlFor="password" hint="Mindestens 8 Zeichen.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Passwort wiederholen" htmlFor="password2">
          <PasswordInput id="password2" name="password2" autoComplete="new-password" required minLength={8} />
        </Field>
        <FormError message={error} />
        <Button type="submit" size="lg" disabled={pending} className="mt-1">
          {pending ? <Spinner /> : <>Konto erstellen <ArrowRight /></>}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Schon ein Konto?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Anmelden
        </Link>
      </p>
    </>
  );
}

export function ForgotPasswordForm() {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = emailSchema.safeParse(new FormData(e.currentTarget).get("email"));
    if (!email.success) return setError(email.error.issues[0].message);
    setPending(true);
    setError(null);
    const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.data, {
      redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
    });
    setPending(false);
    if (error) return setError(errorMessage(error));
    setSent(true);
  }

  return (
    <>
      <Heading eyebrow="happens to the best of us" title={<>forgot it?</>} text="Gib deine E-Mail ein, wir schicken dir einen Link zum Zurücksetzen." />
      {sent ? (
        <p role="status" className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary-soft-foreground">
          Wenn die E-Mail zu ours. gehört, ist der Link unterwegs. Schau auch im Spam-Ordner nach.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label="E-Mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
          <FormError message={error} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Spinner /> : "Link senden"}
          </Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Zurück zum Login
        </Link>
      </p>
    </>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = passwordSchema.safeParse(fd.get("password"));
    if (!password.success) return setError(password.error.issues[0].message);
    if (fd.get("password") !== fd.get("password2")) return setError("Die Passwörter stimmen nicht überein.");
    setPending(true);
    setError(null);
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: password.data });
    setPending(false);
    if (error) return setError(errorMessage(error));
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <Heading eyebrow="almost there" title={<>new password</>} text="Wähle ein neues Passwort für dein Konto." />
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field label="Neues Passwort" htmlFor="password" hint="Mindestens 8 Zeichen.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Wiederholen" htmlFor="password2">
          <PasswordInput id="password2" name="password2" autoComplete="new-password" required minLength={8} />
        </Field>
        <FormError message={error} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : "Passwort speichern"}
        </Button>
      </form>
    </>
  );
}
