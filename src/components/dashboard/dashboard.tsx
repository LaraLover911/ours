"use client";

import * as React from "react";
import { useNow } from "@/hooks/use-now";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, CalendarClock, Gift, Mail, MessageCircleHeart, MessageCircleQuestion, PenLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { NAV_ITEMS } from "@/components/navigation/nav-items";
import { Avatar } from "@/components/shared/avatar";
import { HeartGlyph } from "@/components/shared/heart";
import { PrivateImage } from "@/components/shared/media";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Reveal } from "@/components/animations/reveal";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { formatDate, nextAnniversary, nextMonthsary, relativeDay } from "@/lib/utils/dates";
import { PRESENCE_DOT, usePresence } from "@/hooks/use-presence";
import { DashboardTopBar, Hero } from "./hero";
import { LoveCounter, SetStartDate } from "./love-counter";
import { StatusCards } from "./status-cards";
import { HiddenSurprises } from "@/components/surprises/hidden-surprises";
import type { Message } from "@/types/app";

function Card({ children, className, href, label }: { children: React.ReactNode; className?: string; href?: string; label?: string }) {
  const inner = (
    <div data-reveal className={cn("card-surface group relative flex h-full flex-col overflow-hidden p-5 transition-shadow duration-300 sm:p-6", href && "hover:shadow-lift", className)}>
      {children}
      {href ? <ArrowUpRight aria-hidden className="absolute top-5 right-5 size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" /> : null}
    </div>
  );
  return href ? (
    <Link href={href} aria-label={label} className="block h-full rounded-[var(--radius-xl)]">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function useDashboardData() {
  const { supabase } = useApp();
  const q = useQuery(async () => {
    const nowIso = new Date().toISOString();
    const [conv, memory, nextDate, question, sealedLetters, sealedSurprises] = await Promise.all([
      supabase.from("conversations").select("id").eq("is_default", true).maybeSingle(),
      supabase.from("memories").select("*, memory_media(path, kind, position)").order("happened_on", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("date_ideas").select("*").eq("status", "geplant").gte("planned_for", nowIso).order("planned_for").limit(1).maybeSingle(),
      supabase.rpc("question_for_day"),
      supabase.rpc("sealed_letters"),
      supabase.rpc("sealed_surprises"),
    ]);
    const convId = must(conv)?.id;
    let lastMessage: Message | null = null;
    if (convId) {
      const res = await supabase.from("messages").select("*").eq("conversation_id", convId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      lastMessage = must(res);
    }
    const todayQ = must(question)?.[0] ?? null;
    const progress = todayQ ? (must(await supabase.rpc("question_progress")) ?? []) : [];
    return {
      convId,
      lastMessage,
      memory: must(memory),
      nextDate: must(nextDate),
      question: todayQ,
      progress,
      sealedLetters: must(sealedLetters) ?? [],
      sealedSurprises: must(sealedSurprises) ?? [],
    };
  }, []);
  useRealtimeRefetch(["messages", "memories", "date_ideas", "question_answers", "love_letters", "surprises"], q.refetch, "dashboard");
  return q;
}

function LittleNote() {
  const { settings, updateSettings, me, partner, nameOf } = useApp();
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(settings.home_message ?? "");
  const [pending, setPending] = React.useState(false);

  return (
    <Card className="bg-[linear-gradient(160deg,var(--card)_40%,var(--primary-soft))]">
      <p className="eyebrow flex items-center gap-2">
        <PenLine className="size-3.5" /> a little note
      </p>
      {editing ? (
        <form
          className="mt-3 flex flex-1 flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const { error } = await updateSettings({ home_message: text.trim() || null, home_message_by: me.id });
            setPending(false);
            if (error) return toast.error(error);
            setEditing(false);
            toast.success(`Notiz für ${partner?.display_name ?? "dich"} hinterlassen ♡`);
          }}
        >
          <label htmlFor="note" className="sr-only">Kleine Nachricht</label>
          <Textarea id="note" maxLength={280} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={`Etwas Süßes für ${partner?.display_name ?? "dich"}…`} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>Speichern</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Abbrechen</Button>
          </div>
        </form>
      ) : settings.home_message ? (
        <>
          <blockquote className="font-display mt-3 flex-1 text-[1.9rem] leading-[1.05] text-pretty">“{settings.home_message}”</blockquote>
          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">— {nameOf(settings.home_message_by)}</p>
            <Button size="sm" variant="ghost" onClick={() => { setText(settings.home_message ?? ""); setEditing(true); }}>Neue Notiz</Button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-1 flex-col justify-between gap-4">
          <p className="font-display text-[1.7rem] leading-tight text-muted-foreground">leave something sweet for {partner?.display_name ?? "your love"}.</p>
          <Button size="sm" variant="soft" className="self-start" onClick={() => setEditing(true)}>
            <PenLine /> Notiz schreiben
          </Button>
        </div>
      )}
    </Card>
  );
}

function AnniversaryCard() {
  const { settings } = useApp();
  if (!settings.start_date) {
    return (
      <Card>
        <p className="eyebrow">next anniversary</p>
        <p className="font-display mt-3 text-[1.7rem] leading-tight">Wann ist unser Tag?</p>
        <div className="mt-auto pt-4"><SetStartDate compact /></div>
      </Card>
    );
  }
  const a = nextAnniversary(settings.start_date);
  const m = nextMonthsary(settings.start_date);
  return (
    <Card>
      <p className="eyebrow">next anniversary</p>
      <p className="font-display mt-3 text-6xl leading-none">
        {a.days === 0 ? "heute!" : a.days}
        {a.days !== 0 ? <span className="ml-2 text-xl text-muted-foreground">Tage</span> : null}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        bis zu unserem {a.years}. Jahrestag · {formatDate(a.date, { day: "numeric", month: "long" })}
      </p>
      <div className="mt-auto flex items-center gap-2 border-t border-border pt-4 text-[13px]">
        <HeartGlyph className="size-3.5 text-primary" />
        {m.days === 0 ? <span>Heute sind es {m.months} Monate ♡</span> : <span>{m.months}. Monat in {m.days} {m.days === 1 ? "Tag" : "Tagen"}</span>}
      </div>
    </Card>
  );
}

function CountdownCard({ idea }: { idea: { id: string; title: string; planned_for: string | null; location: string | null } | null }) {
  const now = useNow(30_000);
  if (!idea?.planned_for) {
    return (
      <Card href="/dates" label="Date planen">
        <p className="eyebrow flex items-center gap-2"><CalendarClock className="size-3.5" /> countdown</p>
        <p className="font-display mt-3 text-[1.9rem] leading-tight">our next little adventure?</p>
        <p className="mt-auto pt-4 text-sm text-muted-foreground">Plant ein Date, dann zählen wir hier runter.</p>
      </Card>
    );
  }
  const diff = Math.max(0, new Date(idea.planned_for).getTime() - (now ?? new Date(idea.planned_for).getTime()));
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const min = Math.floor((diff % 3600000) / 60000);
  return (
    <Card href="/dates" label={`Countdown: ${idea.title}`}>
      <p className="eyebrow flex items-center gap-2"><CalendarClock className="size-3.5" /> countdown</p>
      <p className="mt-3 line-clamp-2 text-lg font-medium">{idea.title}</p>
      <p className="font-display mt-2 text-5xl leading-none tabular-nums">
        {d}<span className="text-lg text-muted-foreground">T </span>{h}<span className="text-lg text-muted-foreground">Std </span>{min}<span className="text-lg text-muted-foreground">Min</span>
      </p>
      <p className="mt-auto pt-4 text-[13px] text-muted-foreground">
        {formatDate(idea.planned_for, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
        {idea.location ? ` · ${idea.location}` : ""}
      </p>
    </Card>
  );
}

export function Dashboard() {
  const { me, partner, profiles, unreadTotal, typing } = useApp();
  const presence = usePresence();
  const { data, loading } = useDashboardData();
  const iAnswered = data?.progress.some((p) => p.user_id === me.id);
  const partnerAnswered = data?.progress.some((p) => p.user_id === partner?.id);
  const partnerTyping = data?.convId ? typing[data.convId] : undefined;
  const memoryCover = data?.memory?.memory_media?.slice().sort((a, b) => a.position - b.position).find((m) => m.kind === "image");

  return (
    <PageContainer>
      <DashboardTopBar />
      <Hero />
      <HiddenSurprises />

      <Reveal className="mt-10 grid gap-4 md:mt-14 md:grid-cols-6" stagger={0.07}>
        <div className="md:col-span-6">
          <StatusCards />
        </div>
        <div data-reveal className="md:col-span-6">
          <LoveCounter />
        </div>

        <div className="md:col-span-2"><AnniversaryCard /></div>
        <div className="md:col-span-2">
          {loading ? <Skeleton className="h-full min-h-48 rounded-[var(--radius-xl)]" /> : <CountdownCard idea={data?.nextDate ?? null} />}
        </div>
        <div className="md:col-span-2"><LittleNote /></div>

        {/* Last memory */}
        <div className="md:col-span-3">
          {loading ? (
            <Skeleton className="h-72 rounded-[var(--radius-xl)]" />
          ) : data?.memory ? (
            <Link href={`/memories?open=${data.memory.id}`} data-reveal className="card-surface group relative block h-full min-h-72 overflow-hidden">
              {memoryCover ? (
                <PrivateImage path={memoryCover.path} className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.03]" alt="" />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(100%_80%_at_80%_0%,var(--primary-soft),transparent)]" />
              )}
              <div className={cn("absolute inset-0", memoryCover && "bg-gradient-to-t from-black/70 via-black/10 to-transparent")} />
              <div className={cn("absolute inset-x-0 bottom-0 p-6", memoryCover && "text-white")}>
                <p className={cn("eyebrow", memoryCover && "!text-white/75")}>latest memory</p>
                <h3 className="font-display mt-2 text-4xl leading-none">{data.memory.title}</h3>
                <p className={cn("mt-2 text-sm", memoryCover ? "text-white/80" : "text-muted-foreground")}>
                  {data.memory.happened_on ? formatDate(data.memory.happened_on) : "ohne Datum"}
                  {data.memory.location ? ` · ${data.memory.location}` : ""}
                </p>
              </div>
            </Link>
          ) : (
            <Card href="/memories" label="Erste Erinnerung anlegen" className="min-h-72">
              <p className="eyebrow">latest memory</p>
              <p className="font-display mt-3 text-[2.2rem] leading-[1.02]">our first page<br />is still blank.</p>
              <p className="mt-auto pt-4 text-sm text-muted-foreground">Leg eure erste Erinnerung an, mit Fotos, Ort und Datum.</p>
            </Card>
          )}
        </div>

        {/* Last message */}
        <div className="md:col-span-3">
          <Card href={data?.convId ? `/chat/${data.convId}` : "/chat"} label="Zum Chat" className="min-h-72">
            <p className="eyebrow flex items-center gap-2">
              <MessageCircleHeart className="size-3.5" /> last message
              {unreadTotal ? <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground normal-case">{unreadTotal} neu</span> : null}
            </p>
            {loading ? (
              <Skeleton className="mt-4 h-16" />
            ) : data?.lastMessage ? (
              <div className="mt-5 flex items-end gap-3">
                <Avatar profile={profiles[data.lastMessage.sender_id]} size="md" />
                <div className={cn("max-w-[80%] rounded-[1.2rem] rounded-bl-md px-4 py-3 text-[15px]", data.lastMessage.sender_id === me.id ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {data.lastMessage.kind === "text" ? (
                    <p className="line-clamp-4 whitespace-pre-wrap">{data.lastMessage.body}</p>
                  ) : (
                    <p>{data.lastMessage.kind === "audio" ? "🎙️ Sprachnachricht" : data.lastMessage.kind === "video" ? "🎬 Video" : "📷 Foto"}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="font-display mt-4 text-[1.9rem] leading-tight text-muted-foreground">say hi to {partner?.display_name ?? "your love"} ♡</p>
            )}
            <div className="mt-auto flex items-center justify-between gap-2 pt-5 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", PRESENCE_DOT[presence.tone])} />
                {partnerTyping ? `${partner?.display_name} tippt gerade…` : `${partner?.display_name} ${presence.label}`}
              </span>
              {data?.lastMessage ? <span>{relativeDay(data.lastMessage.created_at)}</span> : null}
            </div>
          </Card>
        </div>

        {/* Question */}
        <div className="md:col-span-4">
          <Card href="/questions" label="Frage des Tages" className="bg-charcoal text-cream [--muted-foreground:#c9bcc2] dark:bg-card">
            <p className="eyebrow flex items-center gap-2 !text-dusty-rose"><MessageCircleQuestion className="size-3.5" /> today&apos;s question</p>
            <p className="font-display mt-3 text-[2.1rem] leading-[1.02] text-pretty sm:text-[2.6rem]">{data?.question?.question ?? (loading ? "…" : "Noch keine Fragen vorhanden")}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-5 text-[13px]">
              <span className={cn("rounded-full px-3 py-1", iAnswered ? "bg-dusty-rose text-charcoal" : "bg-white/10")}>{iAnswered ? "Du hast geantwortet ✓" : "Du: noch offen"}</span>
              <span className={cn("rounded-full px-3 py-1", partnerAnswered ? "bg-dusty-rose text-charcoal" : "bg-white/10")}>{partner?.display_name ?? "…"}: {partnerAnswered ? "geantwortet ✓" : "noch offen"}</span>
            </div>
          </Card>
        </div>

        {/* Sealed letters & surprises */}
        <div className="md:col-span-2">
          <Card href="/letters" label="Briefe">
            <p className="eyebrow flex items-center gap-2"><Mail className="size-3.5" /> waiting for you</p>
            <div className="mt-4 flex items-baseline gap-3">
              <span className="font-display text-6xl leading-none">{data ? data.sealedLetters.length + data.sealedSurprises.length : "–"}</span>
              <span className="text-sm text-muted-foreground">versiegelt</span>
            </div>
            <p className="mt-auto pt-4 text-[13px] text-muted-foreground">
              {data?.sealedLetters[0]
                ? `Nächster Brief öffnet sich ${formatDate(data.sealedLetters[0].open_at, { day: "numeric", month: "long" })}`
                : data?.sealedSurprises[0]
                  ? `Eine Überraschung kommt ${formatDate(data.sealedSurprises[0].reveal_at, { day: "numeric", month: "long" })}`
                  : "Gerade nichts versiegelt. Schreib doch einen Brief ♡"}
            </p>
          </Card>
        </div>
      </Reveal>

      <QuickAccess />
    </PageContainer>
  );
}

function QuickAccess() {
  const items = NAV_ITEMS.filter((i) => i.href !== "/");
  return (
    <section aria-labelledby="quick-title" className="mt-14">
      <div className="mb-5 flex items-end justify-between">
        <h2 id="quick-title" className="font-display text-4xl leading-none">everything ours</h2>
        <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex"><Sparkles className="size-4" /> made for two</span>
      </div>
      <Reveal as="ul" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" stagger={0.04} y={16}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href} data-reveal>
              <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                <Link href={item.href} className="card-surface flex h-full flex-col gap-6 p-4 transition-shadow hover:shadow-lift">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                    {item.href === "/surprises" ? <Gift className="size-5" /> : <Icon className="size-5" />}
                  </span>
                  <span>
                    <span className="block font-medium">{item.label}</span>
                    <span className="block text-[12.5px] text-muted-foreground">{item.hint}</span>
                  </span>
                </Link>
              </motion.div>
            </li>
          );
        })}
      </Reveal>
    </section>
  );
}
