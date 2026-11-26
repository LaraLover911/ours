"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bath,
  Box,
  Coins,
  Gamepad2,
  Hand,
  History,
  Lock,
  Moon,
  PackageOpen,
  Pencil,
  RotateCw,
  ShoppingBag,
  Sparkles,
  Sprout,
  Sun,
  Trophy,
  Utensils,
  Volleyball,
  Sofa,
  ListChecks,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { ErrorState, PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReducedMotion } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils/dates";
import { ACHIEVEMENTS, EVENT_TEXT, MOOD_TEXT, QUEST_TEXT, ROOMS, STAGES, STAT_LABEL, type Cue, type RoomId, type Stats } from "@/lib/pet/catalog";
import { usePet, type Furniture, type PetData, type PetItem } from "./use-pet";
import { FloorPlan, Mochi2D } from "./mochi-2d";
import { SnackCatch } from "./snack-catch";

const PetScene = dynamic(() => import("./pet-scene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-[13px] text-muted-foreground">Mochis Zuhause wird geladen…</div>,
});

let webgl: boolean | null = null;
const hasWebGL = () => {
  if (webgl == null) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
};
const noop = () => () => {};
const subscribeTheme = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
};
const isDark = () => document.documentElement.dataset.theme === "dark";

const VIEW_KEY = "ours:pet-view";
const BURST: Record<string, string> = { feed: "🍎", pet: "💗", clean: "🫧", play: "🎵", minigame: "⭐", quest: "🪙", buy: "🛍️", evolve: "✨", wake: "☀️", sleep: "🌙", furnish: "🪄" };

export function PetPage() {
  const { me, nameOf } = useApp();
  const pet = usePet();
  const reduced = useReducedMotion();
  const gl = React.useSyncExternalStore(noop, hasWebGL, () => true);
  const dark = React.useSyncExternalStore(subscribeTheme, isDark, () => false);
  const [view, setView] = React.useState<"3d" | "2d">("3d");
  const [room, setRoom] = React.useState<RoomId>("living");
  const [editing, setEditing] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("quests");
  const now = useNow(1000);

  React.useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read a per-device preference after hydration
      if (localStorage.getItem(VIEW_KEY) === "2d") setView("2d");
    } catch {
      /* storage blocked: keep 3D */
    }
  }, []);
  const toggleView = () => {
    const next = view === "3d" ? "2d" : "3d";
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };

  if (pet.error && !pet.data)
    return (
      <PageContainer>
        <ErrorState message={pet.error} onRetry={() => void pet.load()} className="mt-10" />
      </PageContainer>
    );
  const d = pet.data;
  if (!d)
    return (
      <PageContainer className="max-w-6xl">
        <Skeleton className="mt-8 h-14 w-64" />
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Skeleton className="aspect-[4/3]" />
          <Skeleton className="h-80" />
        </div>
      </PageContainer>
    );

  const p = d.state.pet;
  const mood = d.state.mood;
  const sleeping = p.sleeping;
  const use3d = gl && view === "3d";
  const house = d.house.find((h) => h.room === room);
  const unlocked = (r: RoomId) => d.house.find((h) => h.room === r)?.unlocked ?? false;
  const furniture = d.furniture.filter((f) => f.room === room);
  const sel = d.furniture.find((f) => f.id === selected) ?? null;
  const qty = (id: string) => d.inventory.find((r) => r.item_id === id)?.qty ?? 0;
  const owned = (kind: PetItem["kind"]) => d.items.filter((i) => i.kind === kind && qty(i.id) > 0);
  const partnerCue = pet.cue && pet.cue.by && pet.cue.by !== me.id && now != null && now - pet.cue.at < 4500 ? pet.cue : null;

  const nudge = (dx: number, dz: number, drot = 0) => {
    if (!sel) return;
    void pet.move(sel, Math.max(-1, Math.min(1, Number(sel.x) + dx)), Math.max(-1, Math.min(1, Number(sel.z) + dz)), (sel.rot + drot) % 360);
  };
  const placeNew = (item: string) => {
    const spot = freeSpot(furniture);
    void pet.place(item, room, spot.x, spot.z);
  };

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="our little pet"
        title={
          <>
            {p.name}, <em className="text-primary">unser kleiner Schatz</em>
          </>
        }
        description={`${p.name} gehört euch beiden: Was einer tut, sieht der andere sofort. ${p.name} kann nicht sterben und wird nie krank, höchstens ein bisschen müde.`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* The house */}
        <section className="card-surface min-w-0 self-start p-3 sm:p-4" aria-label={`${p.name}s Zuhause`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Tabs value={room} onValueChange={(v) => (setRoom(v as RoomId), setSelected(null))}>
              <TabsList>
                {ROOMS.map((r) => (
                  <TabsTrigger key={r.id} value={r.id} panel={false} disabled={!unlocked(r.id)} aria-label={unlocked(r.id) ? r.name : `${r.name} (noch gesperrt, im Shop freischalten)`}>
                    {!unlocked(r.id) ? <Lock /> : null}
                    <span className="sm:hidden">{r.short}</span>
                    <span className="max-sm:hidden">{r.name}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant={editing ? "default" : "soft"} onClick={() => (setEditing((e) => !e), setSelected(null))} aria-pressed={editing}>
                <Sofa /> {editing ? "Fertig" : "Einrichten"}
              </Button>
              {gl ? (
                <Button size="sm" variant="ghost" onClick={toggleView} aria-label={view === "3d" ? "Zur 2D-Ansicht wechseln" : "Zur 3D-Ansicht wechseln"}>
                  <Box /> {view === "3d" ? "2D" : "3D"}
                </Button>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              "relative aspect-[4/3] w-full overflow-hidden rounded-2xl sm:aspect-[16/10]",
              room === "garden" ? "bg-gradient-to-b from-[#cfe8f6] to-[#eef7e8] dark:from-[#1d2742] dark:to-[#22302a]" : "bg-gradient-to-b from-primary-soft to-card",
            )}
          >
            {use3d ? (
              <PetScene
                room={room}
                house={house}
                furniture={furniture}
                stage={p.stage}
                mood={mood}
                cue={pet.cue}
                editing={editing}
                selected={selected}
                reduced={reduced}
                dark={dark}
                onSelect={setSelected}
                onMove={(f, x, z) => void pet.move(f, x, z, f.rot)}
                onTapMochi={() => void pet.act("pet")}
              />
            ) : (
              <FloorPlan furniture={furniture} items={d.items} editing={editing} selected={selected} onSelect={setSelected} onMove={(f, x, z) => void pet.move(f, x, z, f.rot)} floor={room === "garden" ? "#cfe3bf" : (house?.floor ?? "#e9d5c4")}>
                <button
                  type="button"
                  className="absolute top-[58%] left-1/2 w-[34%] max-w-44 -translate-x-1/2 -translate-y-1/2"
                  onClick={() => !editing && void pet.act("pet")}
                  aria-label={`${p.name} streicheln`}
                  tabIndex={editing ? -1 : 0}
                >
                  <Mochi2D mood={mood} stage={p.stage} className={cn("w-full text-foreground", !reduced && "transition-transform active:scale-95")} />
                </button>
              </FloorPlan>
            )}
            <Burst cue={pet.cue} reduced={reduced} />
            {sleeping ? <span className={cn("pointer-events-none absolute top-[22%] left-[56%] text-3xl", !reduced && "animate-pulse")}>💤</span> : null}
            <p className="pointer-events-none absolute right-3 bottom-3 left-3 truncate rounded-full bg-background/80 px-3 py-1.5 text-center text-[13px] backdrop-blur-sm" aria-live="polite">
              {partnerCue ? `${nameOf(partnerCue.by)} ${EVENT_TEXT[partnerCue.kind] ?? "war gerade bei Mochi"}` : editing ? "Zieh die Möbel an ihren Platz" : `${p.name} ${MOOD_TEXT[mood]}`}
            </p>
          </div>

          {editing ? (
            <EditPanel
              sel={sel}
              items={d.items}
              owned={owned("furniture")}
              qty={qty}
              onNudge={nudge}
              onStore={() => sel && (void pet.store(sel), setSelected(null))}
              onPlace={placeNew}
              onShop={() => setTab("shop")}
            />
          ) : (
            <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label="Pflegen">
              <ItemAction icon={<Utensils />} label="Füttern" items={owned("food")} qty={qty} disabled={sleeping || pet.busy} onPick={(id) => void pet.act("feed", id)} onShop={() => setTab("shop")} />
              <ItemAction icon={<Volleyball />} label="Spielen" items={owned("toy")} qty={qty} disabled={sleeping || pet.busy} onPick={(id) => void pet.act("play", id)} onShop={() => setTab("shop")} />
              <ItemAction icon={<Bath />} label="Baden" items={owned("care")} qty={qty} disabled={sleeping || pet.busy} onPick={(id) => void pet.act("clean", id)} onShop={() => setTab("shop")} />
              <ActionButton icon={<Hand />} label="Streicheln" onClick={() => void pet.act("pet")} disabled={pet.busy} />
              <ActionButton icon={sleeping ? <Sun /> : <Moon />} label={sleeping ? "Wecken" : "Schlafen"} onClick={() => void pet.act(sleeping ? "wake" : "sleep")} disabled={pet.busy} />
            </div>
          )}
        </section>

        <Status data={d} onRename={(n) => void pet.rename(n)} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList>
          <TabsTrigger value="quests">
            <ListChecks /> Aufgaben
          </TabsTrigger>
          <TabsTrigger value="shop">
            <ShoppingBag /> Shop
          </TabsTrigger>
          <TabsTrigger value="game">
            <Gamepad2 /> Snack-Fangen
          </TabsTrigger>
          <TabsTrigger value="trophies">
            <Trophy /> Erfolge
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> Verlauf
          </TabsTrigger>
        </TabsList>
        <TabsContent value="quests" className="mt-4">
          <Section icon={<ListChecks />} title="Heute" description="Jeder von euch hat eigene Tagesaufgaben. Jede Belohnung gibt es einmal pro Tag.">
            <ul className="space-y-3">
              {d.quests.map((q) => {
                const done = q.progress >= q.goal;
                return (
                  <li key={q.quest} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px]">
                        {QUEST_TEXT[q.quest] ?? q.quest} <span className="text-muted-foreground tabular-nums">({Math.min(q.progress, q.goal)}/{q.goal})</span>
                      </p>
                      <Bar value={(Math.min(q.progress, q.goal) / q.goal) * 100} />
                    </div>
                    {q.claimed_at ? (
                      <span className="text-[13px] text-muted-foreground">eingelöst ✓</span>
                    ) : (
                      <Button size="sm" variant={done ? "default" : "outline"} disabled={!done || pet.busy} onClick={() => void pet.claim(q.quest)}>
                        <Coins /> {q.reward}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        </TabsContent>
        <TabsContent value="shop" className="mt-4">
          <Shop data={d} qty={qty} unlocked={unlocked} busy={pet.busy} onBuy={(id) => void pet.buy(id)} />
        </TabsContent>
        <TabsContent value="game" className="mt-4">
          <Section icon={<Gamepad2 />} title="Snack-Fangen" description="Bis zu 3 Runden am Tag bringen Münzen (höchstens 20 pro Runde). Danach spielt ihr einfach zum Spaß.">
            <SnackCatch stage={p.stage} mood={mood} onFinish={pet.minigame} />
          </Section>
        </TabsContent>
        <TabsContent value="trophies" className="mt-4">
          <Section icon={<Trophy />} title="Erfolge">
            <ul className="grid gap-2 sm:grid-cols-2">
              {ACHIEVEMENTS.map((a) => {
                const got = d.achievements.find((x) => x.key === a.key);
                return (
                  <li key={a.key} className={cn("flex items-center gap-3 rounded-xl border border-border p-3", !got && "opacity-55")}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">{got ? <Sparkles className="size-4" /> : <Lock className="size-4" />}</span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium">{a.name}</p>
                      <p className="truncate text-[12.5px] text-muted-foreground">{got ? `${a.hint} · ${nameOf(got.unlocked_by)} · ${timeAgo(got.unlocked_at)}` : a.hint}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <Section icon={<History />} title="Verlauf">
            {d.events.length ? (
              <ul className="divide-y divide-border">
                {d.events.map((e) => {
                  const item = d.items.find((i) => i.id === (e.data.item as string));
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-2.5 text-[14px]">
                      <span className="w-6 text-center">{item?.emoji ?? BURST[e.kind] ?? "·"}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {e.actor === me.id ? "Du" : nameOf(e.actor)} {EVENT_TEXT[e.kind] ?? e.kind}
                        {item ? <span className="text-muted-foreground"> · {item.name}</span> : null}
                        {e.kind === "minigame" ? <span className="text-muted-foreground"> · {String(e.data.score)} Punkte</span> : null}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{timeAgo(e.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[14px] text-muted-foreground">Noch nichts passiert. Sag {p.name} doch mal Hallo.</p>
            )}
          </Section>
        </TabsContent>
      </Tabs>

      {process.env.NODE_ENV === "development" ? (
        <details className="mt-5 text-[12px] text-muted-foreground">
          <summary>Debug (nur lokal)</summary>
          <pre className="overflow-x-auto">{JSON.stringify(d.state, null, 2)}</pre>
        </details>
      ) : null}
    </PageContainer>
  );
}

function Burst({ cue, reduced }: { cue: Cue | null; reduced: boolean }) {
  if (!cue || !BURST[cue.kind]) return null;
  const e = BURST[cue.kind];
  return (
    <div key={cue.at} className="pointer-events-none absolute inset-0" aria-hidden>
      {(reduced ? [0] : [0, 1, 2, 3, 4]).map((i) => (
        <motion.span
          key={i}
          className="absolute text-2xl"
          style={{ left: `${40 + i * 5}%`, top: "42%" }}
          initial={{ opacity: 0, y: 0, scale: 0.6 }}
          animate={reduced ? { opacity: [0, 1, 0] } : { opacity: [0, 1, 0], y: -70 - (i % 3) * 18, x: (i - 2) * 10, scale: 1 }}
          transition={{ duration: 1.6, delay: i * 0.1 }}
        >
          {e}
        </motion.span>
      ))}
    </div>
  );
}

function ActionButton({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <Button variant="soft" className="h-auto flex-col gap-1 px-1 py-2.5 text-[12px] [&_svg]:size-5" onClick={onClick} disabled={disabled}>
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  );
}

function ItemAction({
  icon,
  label,
  items,
  qty,
  disabled,
  onPick,
  onShop,
}: {
  icon: React.ReactNode;
  label: string;
  items: PetItem[];
  qty: (id: string) => number;
  disabled: boolean;
  onPick: (id: string) => void;
  onShop: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="soft" className="h-auto flex-col gap-1 px-1 py-2.5 text-[12px] [&_svg]:size-5" disabled={disabled}>
          {icon}
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2">
        {items.length ? (
          <ul>
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[14px] hover:bg-muted"
                  onClick={() => {
                    setOpen(false);
                    onPick(i.id);
                  }}
                >
                  <span className="text-xl">{i.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  {i.kind !== "toy" ? <span className="text-[12px] text-muted-foreground tabular-nums">×{qty(i.id)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2 p-2 text-[13px] text-muted-foreground">
            <p>Dafür ist gerade nichts da.</p>
            <Button size="sm" variant="outline" onClick={() => (setOpen(false), onShop())}>
              <ShoppingBag /> Zum Shop
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EditPanel({
  sel,
  items,
  owned,
  qty,
  onNudge,
  onStore,
  onPlace,
  onShop,
}: {
  sel: Furniture | null;
  items: PetItem[];
  owned: PetItem[];
  qty: (id: string) => number;
  onNudge: (dx: number, dz: number, drot?: number) => void;
  onStore: () => void;
  onPlace: (id: string) => void;
  onShop: () => void;
}) {
  const name = sel ? (items.find((i) => i.id === sel.item_id)?.name ?? sel.item_id) : null;
  return (
    <div className="mt-3 space-y-3">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted p-2"
        tabIndex={sel ? 0 : -1}
        aria-label="Ausgewähltes Möbelstück bewegen: Pfeiltasten, R dreht, Entf räumt weg"
        onKeyDown={(e) => {
          if (!sel) return;
          const step = 0.1;
          const map: Record<string, [number, number, number?]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step], r: [0, 0, 90], R: [0, 0, 90] };
          if (map[e.key]) {
            e.preventDefault();
            const [dx, dz, dr] = map[e.key];
            onNudge(dx, dz, dr ?? 0);
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onStore();
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate px-1 text-[13.5px]">{name ? <b className="font-medium">{name}</b> : <span className="text-muted-foreground">Tippe ein Möbelstück an, um es zu bewegen.</span>}</span>
        <Button size="icon-sm" variant="ghost" disabled={!sel} onClick={() => onNudge(-0.1, 0)} aria-label="Nach links">
          <ArrowLeft />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!sel} onClick={() => onNudge(0, -0.1)} aria-label="Nach hinten">
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!sel} onClick={() => onNudge(0, 0.1)} aria-label="Nach vorne">
          <ArrowDown />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!sel} onClick={() => onNudge(0.1, 0)} aria-label="Nach rechts">
          <ArrowRight />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!sel} onClick={() => onNudge(0, 0, 90)} aria-label="Drehen">
          <RotateCw />
        </Button>
        <Button size="sm" variant="ghost" disabled={!sel} onClick={onStore}>
          <PackageOpen /> Wegräumen
        </Button>
      </div>
      {owned.length ? (
        <div className="flex flex-wrap gap-2">
          {owned.map((i) => (
            <Button key={i.id} size="sm" variant="outline" onClick={() => onPlace(i.id)}>
              <span>{i.emoji}</span> {i.name} aufstellen <span className="text-muted-foreground">×{qty(i.id)}</span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Keine Möbel im Lager.{" "}
          <button type="button" className="underline underline-offset-2" onClick={onShop}>
            Im Shop stöbern
          </button>
        </p>
      )}
    </div>
  );
}

function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("mt-1 h-2 overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function Status({ data, onRename }: { data: PetData; onRename: (name: string) => void }) {
  const p = data.state.pet;
  const s = data.state.stats;
  const next = STAGES[p.stage + 1];
  const cur = STAGES[p.stage];
  const bond = data.state.bond;
  const bondNext = 10 * (bond.level + 1) ** 2;
  const bondCur = 10 * bond.level ** 2;
  const [name, setName] = React.useState(p.name);
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Section
        icon={<Sprout />}
        title={p.name}
        description={`Stufe ${p.stage + 1} von 4: ${cur.name}`}
        actions={
          <Popover open={open} onOpenChange={(o) => (setOpen(o), o && setName(p.name))}>
            <PopoverTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Umbenennen">
                <Pencil />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim()) onRename(name.trim());
                  setOpen(false);
                }}
              >
                <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} aria-label="Neuer Name" className="min-w-0 flex-1" />
                <Button type="submit" size="sm">
                  OK
                </Button>
              </form>
            </PopoverContent>
          </Popover>
        }
      >
        <dl className="space-y-2.5">
          {(Object.keys(STAT_LABEL) as (keyof Stats)[]).map((k) => (
            <div key={k}>
              <div className="flex justify-between text-[13px]">
                <dt>{STAT_LABEL[k]}</dt>
                <dd className="text-muted-foreground tabular-nums">{s[k]}%</dd>
              </div>
              <Bar value={s[k]} />
            </div>
          ))}
        </dl>
        {data.state.mood === "missed_you" ? (
          <p className="mt-4 rounded-xl bg-primary-soft p-3 text-[13.5px] text-primary-soft-foreground">
            Ihr wart eine Weile nicht da ({data.state.away_hours} Std.). {p.name} ist nur etwas müde und freut sich riesig auf euch.
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-muted p-3">
            <p className="font-display text-3xl tabular-nums">{p.coins}</p>
            <p className="text-[12px] text-muted-foreground">Münzen (nur im Spiel)</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="font-display text-3xl tabular-nums">{p.xp}</p>
            <p className="text-[12px] text-muted-foreground">Erfahrung</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[13px]">{next ? `Nächste Stufe „${next.name}“ bei ${next.xp} Erfahrung` : "Voll erblüht"}</p>
          {next ? <Bar value={((p.xp - cur.xp) / (next.xp - cur.xp)) * 100} /> : null}
          <ol className="mt-3 flex gap-1.5" aria-label="Entwicklung">
            {STAGES.map((st, i) => {
              const reached = data.evolution.find((e) => e.stage === i);
              return (
                <li key={st.name} className={cn("flex-1 rounded-lg border border-border p-1.5 text-center text-[11px]", i <= p.stage ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground")} title={st.hint}>
                  {st.name}
                  {reached ? <span className="block opacity-70">{new Date(reached.reached_at).toLocaleDateString("de-DE")}</span> : null}
                </li>
              );
            })}
          </ol>
        </div>
      </Section>
      <Section icon={<Sparkles />} title="Mochis Vertrauen" description="Ein Spielwert: wie gut Mochi sich umsorgt fühlt. Er misst nichts an euch oder eurer Beziehung.">
        <div className="flex items-end justify-between">
          <p className="font-display text-4xl">Stufe {bond.level}</p>
          <p className="text-[12.5px] text-muted-foreground tabular-nums">
            {bond.points} / {bondNext}
          </p>
        </div>
        <Bar value={((bond.points - bondCur) / (bondNext - bondCur)) * 100} />
      </Section>
    </div>
  );
}

const KIND_TITLE: Record<string, string> = { food: "Essen", toy: "Spielzeug", care: "Pflege", furniture: "Möbel", room: "Räume" };
const EFFECT_LABEL: Record<string, string> = { hunger: "Satt", energy: "Energie", joy: "Freude", clean: "Sauber" };

function Shop({ data, qty, unlocked, busy, onBuy }: { data: PetData; qty: (id: string) => number; unlocked: (r: RoomId) => boolean; busy: boolean; onBuy: (id: string) => void }) {
  const p = data.state.pet;
  return (
    <Section icon={<ShoppingBag />} title="Shop" description={`Nur mit Spielmünzen, kein echtes Geld. Ihr habt ${p.coins} Münzen.`}>
      <div className="space-y-6">
        {(["food", "toy", "care", "furniture", "room"] as const).map((kind) => (
          <div key={kind}>
            <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">{KIND_TITLE[kind]}</h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.items
                .filter((i) => i.kind === kind)
                .map((i) => {
                  const locked = i.min_stage > p.stage;
                  const have = kind === "room" ? unlocked(i.effect.room as RoomId) : false;
                  const effect = Object.entries(i.effect)
                    .filter(([k]) => EFFECT_LABEL[k])
                    .map(([k, v]) => `${Number(v) > 0 ? "+" : ""}${v} ${EFFECT_LABEL[k]}`)
                    .join(" · ");
                  return (
                    <li key={i.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-xl">{i.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">{i.name}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {locked ? `ab Stufe „${STAGES[i.min_stage].name}“` : effect || (kind === "toy" ? "bleibt für immer" : kind === "room" ? "neuer Raum" : "zum Aufstellen")}
                          {kind !== "room" && qty(i.id) ? ` · ${qty(i.id)} im Lager` : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" disabled={busy || locked || have || p.coins < i.price || (kind === "toy" && qty(i.id) > 0)} onClick={() => onBuy(i.id)}>
                        {have || (kind === "toy" && qty(i.id) > 0) ? (
                          "✓"
                        ) : (
                          <>
                            <Coins /> {i.price}
                          </>
                        )}
                      </Button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** A spot in the room that is not on top of other pieces or of Mochi. */
function freeSpot(furniture: Furniture[]) {
  let best = { x: 0, z: -0.5, d: -1 };
  for (let gx = -0.8; gx <= 0.81; gx += 0.4)
    for (let gz = -0.8; gz <= 0.81; gz += 0.4) {
      const others = [...furniture.map((f) => ({ x: Number(f.x), z: Number(f.z) })), { x: 0, z: 0.32 }];
      const d = Math.min(...others.map((o) => Math.hypot(o.x - gx, o.z - gz)));
      if (d > best.d) best = { x: Math.round(gx * 10) / 10, z: Math.round(gz * 10) / 10, d };
    }
  return best;
}
