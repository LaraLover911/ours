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
  Gamepad2,
  Hand,
  History,
  Info,
  Lock,
  Moon,
  PackageOpen,
  Pencil,
  RotateCw,
  ShoppingBag,
  Sun,
  Trophy,
  Utensils,
  Volleyball,
  Sofa,
  ListChecks,
  Check,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { ErrorState } from "@/components/shared/states";
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
import { gameFont } from "./game-font";

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
  const panelRef = React.useRef<HTMLDivElement>(null);

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
  const openTab = (t: string) => {
    setTab(t);
    panelRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  if (pet.error && !pet.data)
    return (
      <GameShell>
        <ErrorState message={pet.error} onRetry={() => void pet.load()} className="mt-10" />
      </GameShell>
    );
  const d = pet.data;
  if (!d)
    return (
      <GameShell>
        <Skeleton className="h-14 w-full rounded-3xl" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <Skeleton className="aspect-[4/3] rounded-[28px]" />
          <Skeleton className="h-80 rounded-[28px]" />
        </div>
      </GameShell>
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
  const claimable = d.quests.filter((q) => q.progress >= q.goal && !q.claimed_at).length;

  const nudge = (dx: number, dz: number, drot = 0) => {
    if (!sel) return;
    void pet.move(sel, Math.max(-1, Math.min(1, Number(sel.x) + dx)), Math.max(-1, Math.min(1, Number(sel.z) + dz)), (sel.rot + drot) % 360);
  };
  const placeNew = (item: string) => {
    const spot = freeSpot(furniture);
    void pet.place(item, room, spot.x, spot.z);
  };

  return (
    <GameShell>
      <h1 className="sr-only">{p.name}, euer Haustier</h1>
      <Hud data={d} onRename={(n) => void pet.rename(n)} />

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          {d.state.mood === "missed_you" ? (
            <p className="mb-3 rounded-2xl border-[3px] border-white bg-[#fff0c2] px-4 py-2.5 text-[14px] font-medium text-[#6b4a00] shadow-[0_4px_0_rgba(43,33,64,.08)] dark:border-white/10 dark:bg-[#4a3a12] dark:text-[#ffe3a3]">
              Ihr wart {d.state.away_hours} Std. weg. {p.name} ist nur etwas müde und freut sich riesig auf euch!
            </p>
          ) : null}

          {/* The stage */}
          <section
            aria-label={`${p.name}s Zuhause`}
            className={cn(
              "relative aspect-[4/3] w-full overflow-hidden rounded-[28px] border-[4px] border-white shadow-[0_8px_0_rgba(43,33,64,.12),0_18px_40px_-12px_rgba(43,33,64,.35)] sm:aspect-[16/10] dark:border-white/15",
              room === "garden" ? "bg-gradient-to-b from-[#a8dcff] to-[#e6f7d9] dark:from-[#1d2742] dark:to-[#22302a]" : "bg-gradient-to-b from-[#ffe1ea] to-[#fff7ef] dark:from-[#2b2140] dark:to-[#1d1830]",
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
                  <Mochi2D mood={mood} stage={p.stage} className={cn("w-full text-[#2b2140]", !reduced && "transition-transform active:scale-95")} />
                </button>
              </FloorPlan>
            )}
            <Burst cue={pet.cue} reduced={reduced} />
            {sleeping ? <span className={cn("pointer-events-none absolute top-[22%] left-[56%] text-3xl", !reduced && "animate-pulse")}>💤</span> : null}

            {/* Room chips + tools, floating over the scene */}
            <div className="absolute inset-x-2 top-2 flex items-start gap-2 sm:inset-x-3 sm:top-3">
              <Tabs value={room} onValueChange={(v) => (setRoom(v as RoomId), setSelected(null))}>
                <TabsList className="gap-1 rounded-full bg-white/75 p-1 shadow-[0_3px_0_rgba(43,33,64,.10)] backdrop-blur-md dark:bg-black/35">
                  {ROOMS.map((r) => (
                    <TabsTrigger
                      key={r.id}
                      value={r.id}
                      panel={false}
                      disabled={!unlocked(r.id)}
                      aria-label={unlocked(r.id) ? r.name : `${r.name} (noch gesperrt, im Shop freischalten)`}
                      className="h-8 rounded-full px-3 text-[13px] font-semibold text-[#2b2140]/70 data-[state=active]:bg-[#ff7aa2] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_-3px_0_rgba(0,0,0,.15)] dark:text-white/70"
                    >
                      {!unlocked(r.id) ? <Lock /> : null}
                      <span className="sm:hidden">{r.short}</span>
                      <span className="max-sm:hidden">{r.name}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="ml-auto flex gap-1.5 max-sm:absolute max-sm:top-12 max-sm:right-0 max-sm:flex-col max-sm:items-end">
                <ChipButton onClick={() => (setEditing((e) => !e), setSelected(null))} aria-pressed={editing} active={editing}>
                  <Sofa /> <span className="max-sm:sr-only">{editing ? "Fertig" : "Einrichten"}</span>
                </ChipButton>
                {gl ? (
                  <ChipButton onClick={toggleView} aria-label={view === "3d" ? "Zur 2D-Ansicht wechseln" : "Zur 3D-Ansicht wechseln"}>
                    <Box /> {view === "3d" ? "2D" : "3D"}
                  </ChipButton>
                ) : null}
              </div>
            </div>

            {/* Speech bubble */}
            <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex justify-center" aria-live="polite">
              <p className="relative max-w-full truncate rounded-2xl border-[3px] border-white bg-white/95 px-4 py-1.5 text-center text-[14px] font-medium text-[#2b2140] shadow-[0_4px_0_rgba(43,33,64,.12)] dark:border-white/15 dark:bg-[#231d3a]/95 dark:text-white">
                {partnerCue ? `${nameOf(partnerCue.by)} ${EVENT_TEXT[partnerCue.kind] ?? "war gerade bei Mochi"}` : editing ? "Zieh die Möbel an ihren Platz" : `${p.name} ${MOOD_TEXT[mood]}`}
              </p>
            </div>
          </section>

          {editing ? (
            <EditPanel
              sel={sel}
              items={d.items}
              owned={owned("furniture")}
              qty={qty}
              onNudge={nudge}
              onStore={() => sel && (void pet.store(sel), setSelected(null))}
              onPlace={placeNew}
              onShop={() => openTab("shop")}
            />
          ) : (
            <div className="mt-4 grid grid-cols-5 gap-1" role="group" aria-label="Pflegen">
              <ItemAction color="#ff9f43" icon={<Utensils />} label="Füttern" items={owned("food")} qty={qty} disabled={sleeping || pet.busy} onPick={(id) => void pet.act("feed", id)} onShop={() => openTab("shop")} />
              <ItemAction color="#4aa8ff" icon={<Volleyball />} label="Spielen" items={owned("toy")} qty={qty} disabled={sleeping || pet.busy} onPick={(id) => void pet.act("play", id)} onShop={() => openTab("shop")} />
              <ItemAction color="#2ec4b6" icon={<Bath />} label="Baden" items={owned("care")} qty={qty} disabled={sleeping || pet.busy} onPick={(id) => void pet.act("clean", id)} onShop={() => openTab("shop")} />
              <GameButton color="#ff6fa0" icon={<Hand />} label="Streicheln" onClick={() => void pet.act("pet")} disabled={pet.busy} />
              <GameButton color="#7b6cff" icon={sleeping ? <Sun /> : <Moon />} label={sleeping ? "Wecken" : "Schlafen"} onClick={() => void pet.act(sleeping ? "wake" : "sleep")} disabled={pet.busy} />
            </div>
          )}
          <div className="mt-5 max-lg:hidden">
            <Panel title="Entwicklung">
              <Evolution data={d} />
            </Panel>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <StatMeters stats={d.state.stats} />

          <div ref={panelRef} className="scroll-mt-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-5 gap-1 rounded-[20px] border-[3px] border-white bg-white/70 p-1 shadow-[0_4px_0_rgba(43,33,64,.08)] backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                <MenuTab value="quests" icon={<ListChecks />} label="Aufgaben" badge={claimable} />
                <MenuTab value="shop" icon={<ShoppingBag />} label="Shop" />
                <MenuTab value="game" icon={<Gamepad2 />} label="Snack-Fangen" short="Spiel" />
                <MenuTab value="trophies" icon={<Trophy />} label="Erfolge" />
                <MenuTab value="history" icon={<History />} label="Tagebuch" />
              </TabsList>

              <TabsContent value="quests" className="mt-3">
                <Panel title="Tagesaufgaben" subtitle="Jeder von euch hat eigene. Jede Belohnung gibt es einmal pro Tag.">
                  <ul className="space-y-2.5">
                    {d.quests.map((q) => {
                      const done = q.progress >= q.goal;
                      return (
                        <li key={q.quest} className={cn("flex items-center gap-3 rounded-2xl p-3", done && !q.claimed_at ? "bg-[#fff4c9] dark:bg-[#3d3315]" : "bg-[#f4efff] dark:bg-white/5")}>
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-[0_3px_0_rgba(43,33,64,.08)] dark:bg-white/10">{QUEST_EMOJI[q.quest] ?? "⭐"}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14.5px] font-semibold">{QUEST_TEXT[q.quest] ?? q.quest}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <Meter value={(Math.min(q.progress, q.goal) / q.goal) * 100} color="#7b6cff" className="flex-1" />
                              <span className="text-[12px] tabular-nums opacity-70">
                                {Math.min(q.progress, q.goal)}/{q.goal}
                              </span>
                            </div>
                          </div>
                          {q.claimed_at ? (
                            <span className="flex items-center gap-1 text-[13px] font-semibold text-[#2e9e5b]">
                              eingelöst ✓
                            </span>
                          ) : (
                            <CoinButton disabled={!done || pet.busy} onClick={() => void pet.claim(q.quest)} glow={done}>
                              {q.reward}
                            </CoinButton>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              </TabsContent>
              <TabsContent value="shop" className="mt-3">
                <Shop data={d} qty={qty} unlocked={unlocked} busy={pet.busy} onBuy={(id) => void pet.buy(id)} />
              </TabsContent>
              <TabsContent value="game" className="mt-3">
                <Panel title="Snack-Fangen" subtitle="Bis zu 3 Runden am Tag bringen Münzen (höchstens 20 pro Runde). Danach spielt ihr einfach zum Spaß.">
                  <SnackCatch stage={p.stage} mood={mood} onFinish={pet.minigame} />
                </Panel>
              </TabsContent>
              <TabsContent value="trophies" className="mt-3">
                <Panel title="Entwicklung & Erfolge">
                  <Evolution data={d} />
                  <ul className="mt-4 grid grid-cols-2 gap-2">
                    {ACHIEVEMENTS.map((a) => {
                      const got = d.achievements.find((x) => x.key === a.key);
                      return (
                        <li key={a.key} className={cn("flex flex-col items-center gap-1 rounded-2xl p-3 text-center", got ? "bg-[#fff4c9] dark:bg-[#3d3315]" : "bg-[#f1eef6] opacity-60 dark:bg-white/5")}>
                          <span className={cn("grid size-11 place-items-center rounded-full text-xl", got ? "bg-gradient-to-b from-[#ffd84d] to-[#ffb020] shadow-[inset_0_-3px_0_rgba(0,0,0,.15)]" : "bg-white/70 dark:bg-white/10")}>
                            {got ? "🏆" : <Lock className="size-4 opacity-60" />}
                          </span>
                          <p className="text-[13.5px] font-semibold leading-tight">{a.name}</p>
                          <p className="text-[11.5px] leading-tight opacity-70">{got ? `${nameOf(got.unlocked_by)} · ${timeAgo(got.unlocked_at)}` : a.hint}</p>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              </TabsContent>
              <TabsContent value="history" className="mt-3">
                <Panel title="Tagebuch">
                  {d.events.length ? (
                    <ul className="divide-y divide-[#2b2140]/10 dark:divide-white/10">
                      {d.events.map((e) => {
                        const item = d.items.find((i) => i.id === (e.data.item as string));
                        return (
                          <li key={e.id} className="flex items-center gap-3 py-2.5 text-[14px]">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f4efff] dark:bg-white/10">{item?.emoji ?? BURST[e.kind] ?? "·"}</span>
                            <span className="min-w-0 flex-1 truncate">
                              {e.actor === me.id ? "Du" : nameOf(e.actor)} {EVENT_TEXT[e.kind] ?? e.kind}
                              {item ? <span className="opacity-60"> · {item.name}</span> : null}
                              {e.kind === "minigame" ? <span className="opacity-60"> · {String(e.data.score)} Punkte</span> : null}
                            </span>
                            <span className="shrink-0 text-[12px] opacity-60">{timeAgo(e.created_at)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-[14px] opacity-70">Noch nichts passiert. Sag {p.name} doch mal Hallo.</p>
                  )}
                </Panel>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {process.env.NODE_ENV === "development" ? (
        <details className="mt-5 text-[12px] opacity-60">
          <summary>Debug (nur lokal)</summary>
          <pre className="overflow-x-auto">{JSON.stringify(d.state, null, 2)}</pre>
        </details>
      ) : null}
    </GameShell>
  );
}

const QUEST_EMOJI: Record<string, string> = { feed: "🍎", pet: "💗", play: "🎾", minigame: "🎮", clean: "🫧" };
const STAT_EMOJI: Record<keyof Stats, string> = { hunger: "🍎", energy: "⚡", joy: "⭐", clean: "🫧" };

/** The game's own world: sky backdrop and rounded type, inside the app frame. */
function GameShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(gameFont.className, "relative isolate min-h-dvh text-[#2b2140] dark:text-white")}>
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[#bfe5ff] via-[#e9f5ff] to-[#fff3ea] dark:from-[#141a33] dark:via-[#1b1830] dark:to-[#241b33]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(255,255,255,.9)_0,transparent_22%),radial-gradient(circle_at_85%_14%,rgba(255,255,255,.7)_0,transparent_18%)] opacity-70 dark:opacity-10" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-3 pt-[calc(var(--safe-top)+0.75rem)] pb-8 sm:px-5 lg:px-8 lg:pt-6">{children}</div>
    </div>
  );
}

function Hud({ data, onRename }: { data: PetData; onRename: (name: string) => void }) {
  const p = data.state.pet;
  const cur = STAGES[p.stage];
  const next = STAGES[p.stage + 1];
  const bond = data.state.bond;
  const bondNext = 10 * (bond.level + 1) ** 2;
  const bondCur = 10 * bond.level ** 2;
  const [name, setName] = React.useState(p.name);
  const [open, setOpen] = React.useState(false);
  return (
    <header className="flex items-center gap-2 rounded-[24px] border-[3px] border-white bg-white/80 p-2 pr-2.5 shadow-[0_5px_0_rgba(43,33,64,.10)] backdrop-blur-md dark:border-white/10 dark:bg-[#231d3a]/85">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#ffe1ea] to-[#ffc2d4] ring-[3px] ring-white sm:size-14 dark:ring-white/20">
        <Mochi2D mood={data.state.mood} stage={p.stage} className="w-[86%] text-[#2b2140]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-[19px] leading-tight font-bold sm:text-[22px]">{p.name}</p>
          <Popover open={open} onOpenChange={(o) => (setOpen(o), o && setName(p.name))}>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Umbenennen" className="relative grid size-7 shrink-0 place-items-center rounded-full opacity-50 hover:bg-black/5 hover:opacity-100 after:absolute after:-inset-2 after:content-['']">
                <Pencil className="size-3.5" />
              </button>
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
                <button type="submit" className="rounded-xl bg-[#ff6fa0] px-3 text-[14px] font-semibold text-white shadow-[inset_0_-3px_0_rgba(0,0,0,.15)]">
                  OK
                </button>
              </form>
            </PopoverContent>
          </Popover>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-[#7b6cff] px-2 py-px text-[11px] font-bold text-white">Stufe {p.stage + 1}</span>
          <div className="min-w-0 flex-1" title={next ? `Nächste Stufe „${next.name}“ bei ${next.xp} Erfahrung` : "Voll erblüht"}>
            <Meter value={next ? ((p.xp - cur.xp) / (next.xp - cur.xp)) * 100 : 100} color="#7b6cff" className="h-2" />
            <p className="mt-0.5 truncate text-[11px] opacity-70">
              {cur.name} · {next ? `${p.xp}/${next.xp} EP` : "voll erblüht"}
            </p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
        <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#ffe066] to-[#ffb020] py-1 pr-3 pl-1 text-[15px] font-bold text-[#5a3a00] shadow-[inset_0_-3px_0_rgba(0,0,0,.15),0_3px_0_rgba(43,33,64,.10)]" title="Spielmünzen, kein echtes Geld">
          <span className="grid size-6 place-items-center rounded-full bg-[#fff3b0] text-[13px] ring-2 ring-[#f0a500]">🪙</span>
          <span className="tabular-nums">{p.coins}</span>
          <span className="sr-only">Münzen</span>
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex items-center gap-1 rounded-full bg-gradient-to-b from-[#ff9cbc] to-[#ff6fa0] py-1 pr-2.5 pl-2 text-[13px] font-bold text-white shadow-[inset_0_-3px_0_rgba(0,0,0,.15),0_3px_0_rgba(43,33,64,.10)]" aria-label={`Mochis Vertrauen: Stufe ${bond.level}`}>
              💗 <span className="tabular-nums">{bond.level}</span> <Info className="size-3 opacity-80" />
            </button>
          </PopoverTrigger>
          <PopoverContent className={cn(gameFont.className, "w-72")}>
            <p className="text-[15px] font-semibold">Mochis Vertrauen · Stufe {bond.level}</p>
            <Meter value={((bond.points - bondCur) / (bondNext - bondCur)) * 100} color="#ff6fa0" className="mt-2" />
            <p className="mt-1 text-[12px] tabular-nums opacity-70">
              {bond.points} / {bondNext}
            </p>
            <p className="mt-2 text-[12.5px] opacity-80">Ein Spielwert: wie gut Mochi sich umsorgt fühlt. Er misst nichts an euch oder eurer Beziehung.</p>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}

function StatMeters({ stats }: { stats: Stats }) {
  return (
    <dl className="grid grid-cols-4 gap-1.5 rounded-[22px] border-[3px] border-white bg-white/80 p-2 shadow-[0_5px_0_rgba(43,33,64,.10)] backdrop-blur-md sm:gap-2 dark:border-white/10 dark:bg-[#231d3a]/85">
      {(Object.keys(STAT_LABEL) as (keyof Stats)[]).map((k) => {
        const v = stats[k];
        const color = v >= 60 ? "#3ccf6e" : v >= 30 ? "#ffb020" : "#ff5d5d";
        return (
          <div key={k} className="min-w-0 rounded-2xl bg-[#f4efff] px-2 py-1.5 dark:bg-white/5">
            <dt className="flex items-center gap-1 truncate text-[11.5px] font-semibold sm:text-[12.5px]">
              <span aria-hidden>{STAT_EMOJI[k]}</span>
              {STAT_LABEL[k]}
            </dt>
            <div className="mt-1 flex items-center gap-1">
              <Meter value={v} color={color} className="h-2 flex-1" />
              <dd className="text-[10.5px] font-semibold tabular-nums opacity-70">{v}%</dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}

function Evolution({ data }: { data: PetData }) {
  const p = data.state.pet;
  const next = STAGES[p.stage + 1];
  return (
    <div>
      <ol className="flex items-center" aria-label="Entwicklung">
        {STAGES.map((st, i) => {
          const reached = data.evolution.find((e) => e.stage === i);
          const on = i <= p.stage;
          return (
            <li key={st.name} className="flex flex-1 items-center last:flex-none" title={st.hint}>
              <div className="flex flex-col items-center gap-1">
                <span className={cn("grid size-12 place-items-center rounded-full ring-[3px]", on ? "bg-gradient-to-b from-[#ffe1ea] to-[#ffc2d4] ring-[#ff6fa0]" : "bg-[#f1eef6] ring-white grayscale dark:bg-white/5 dark:ring-white/10")}>
                  <Mochi2D mood="calm" stage={i} className={cn("w-[82%] text-[#2b2140]", !on && "opacity-40")} />
                </span>
                <span className="text-[11px] font-semibold">{st.name}</span>
                <span className="h-3 text-[10px] opacity-60">{reached ? new Date(reached.reached_at).toLocaleDateString("de-DE") : ""}</span>
              </div>
              {i < STAGES.length - 1 ? <span className={cn("mx-1 mb-8 h-1.5 flex-1 rounded-full", i < p.stage ? "bg-[#ff6fa0]" : "bg-[#2b2140]/10 dark:bg-white/10")} /> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-center text-[12.5px] opacity-70">{next ? `Nächste Stufe „${next.name}“ bei ${next.xp} Erfahrung (jetzt ${p.xp})` : "Mochi ist voll erblüht"}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border-[3px] border-white bg-white/90 p-4 shadow-[0_6px_0_rgba(43,33,64,.10)] backdrop-blur-md sm:p-5 dark:border-white/10 dark:bg-[#231d3a]/90">
      <h2 className="text-[20px] leading-tight font-bold">{title}</h2>
      {subtitle ? <p className="mt-0.5 mb-3 text-[13px] opacity-70">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function MenuTab({ value, icon, label, short, badge }: { value: string; icon: React.ReactNode; label: string; short?: string; badge?: number }) {
  return (
    <TabsTrigger
      value={value}
      aria-label={label}
      className="relative h-auto flex-col gap-0.5 rounded-[14px] px-1 py-1.5 text-[11px] font-semibold text-[#2b2140]/65 data-[state=active]:bg-[#7b6cff] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_-3px_0_rgba(0,0,0,.18)] sm:text-[12px] dark:text-white/65 [&_svg]:size-5"
    >
      {icon}
      <span className="max-w-full truncate">{short ?? label}</span>
      {badge ? <span className="absolute -top-1.5 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#ff5d5d] px-1 text-[11px] font-bold text-white ring-2 ring-white">{badge}</span> : null}
    </TabsTrigger>
  );
}

function Meter({ value, color, className }: { value: number; color: string; className?: string }) {
  return (
    <div className={cn("h-2.5 overflow-hidden rounded-full bg-[#2b2140]/10 dark:bg-white/10", className)} aria-hidden>
      <div className="h-full rounded-full shadow-[inset_0_-2px_0_rgba(0,0,0,.12)] transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

function ChipButton({ active, className, ...props }: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold shadow-[0_3px_0_rgba(43,33,64,.12)] backdrop-blur-md transition-transform active:translate-y-0.5 [&_svg]:size-4",
        active ? "bg-[#ff6fa0] text-white" : "bg-white/80 text-[#2b2140] dark:bg-black/35 dark:text-white",
        className,
      )}
      {...props}
    />
  );
}

function CoinButton({ glow, className, children, ...props }: React.ComponentProps<"button"> & { glow?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-10 shrink-0 items-center gap-1 rounded-full bg-gradient-to-b from-[#ffe066] to-[#ffb020] px-3.5 text-[14px] font-bold text-[#5a3a00] shadow-[inset_0_-4px_0_rgba(0,0,0,.15),0_3px_0_rgba(43,33,64,.12)] transition-transform active:translate-y-0.5 disabled:from-[#e7e3ee] disabled:to-[#d8d3e2] disabled:text-[#2b2140]/45 disabled:shadow-none dark:disabled:from-white/10 dark:disabled:to-white/5 dark:disabled:text-white/40",
        glow && !props.disabled && "animate-pulse",
        className,
      )}
      {...props}
    >
      🪙 <span className="tabular-nums">{children}</span>
    </button>
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
          className="absolute text-3xl"
          style={{ left: `${40 + i * 5}%`, top: "42%" }}
          initial={{ opacity: 0, y: 0, scale: 0.6 }}
          animate={reduced ? { opacity: [0, 1, 0] } : { opacity: [0, 1, 0], y: -80 - (i % 3) * 18, x: (i - 2) * 12, scale: 1.1 }}
          transition={{ duration: 1.6, delay: i * 0.1 }}
        >
          {e}
        </motion.span>
      ))}
    </div>
  );
}

/** A chunky round game button with a pressed-down bevel. */
function GameButton({ color, icon, label, className, ...props }: React.ComponentProps<"button"> & { color: string; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" className={cn("group flex min-w-0 flex-col items-center gap-1.5 disabled:opacity-45", className)} {...props}>
      <span
        className="grid size-14 place-items-center rounded-full text-white ring-[3px] ring-white shadow-[inset_0_-5px_0_rgba(0,0,0,.2),0_5px_0_rgba(43,33,64,.18)] transition-transform group-enabled:group-hover:-translate-y-0.5 group-enabled:group-active:translate-y-1 sm:size-16 dark:ring-white/20 [&_svg]:size-6 sm:[&_svg]:size-7"
        style={{ background: color }}
      >
        {icon}
      </span>
      <span className="max-w-full truncate text-[12.5px] font-semibold sm:text-[13.5px]">{label}</span>
    </button>
  );
}

function ItemAction({
  color,
  icon,
  label,
  items,
  qty,
  disabled,
  onPick,
  onShop,
}: {
  color: string;
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
        <GameButton color={color} icon={icon} label={label} disabled={disabled} />
      </PopoverTrigger>
      <PopoverContent className={cn(gameFont.className, "w-64 rounded-2xl p-2")}>
        {items.length ? (
          <ul>
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[15px] font-medium hover:bg-muted"
                  onClick={() => {
                    setOpen(false);
                    onPick(i.id);
                  }}
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-muted text-xl">{i.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  {i.kind !== "toy" ? <span className="rounded-full bg-muted px-2 text-[12px] tabular-nums">×{qty(i.id)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2 p-2 text-[13.5px]">
            <p className="opacity-70">Dafür ist gerade nichts da.</p>
            <button type="button" className="flex items-center gap-1.5 rounded-full bg-[#7b6cff] px-3 py-1.5 font-semibold text-white shadow-[inset_0_-3px_0_rgba(0,0,0,.18)] [&_svg]:size-4" onClick={() => (setOpen(false), onShop())}>
              <ShoppingBag /> Zum Shop
            </button>
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
  const pad = "grid size-10 place-items-center rounded-xl bg-white text-[#2b2140] shadow-[inset_0_-3px_0_rgba(0,0,0,.08)] disabled:opacity-40 dark:bg-white/10 dark:text-white [&_svg]:size-4";
  return (
    <div className="mt-4 space-y-3 rounded-[22px] border-[3px] border-white bg-white/85 p-3 shadow-[0_5px_0_rgba(43,33,64,.10)] backdrop-blur-md dark:border-white/10 dark:bg-[#231d3a]/90">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-[#f4efff] p-2 dark:bg-white/5"
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
        <span className="min-w-0 flex-1 truncate px-1 text-[14px]">{name ? <b className="font-semibold">{name}</b> : <span className="opacity-70">Tippe ein Möbelstück an, um es zu bewegen.</span>}</span>
        <button type="button" className={pad} disabled={!sel} onClick={() => onNudge(-0.1, 0)} aria-label="Nach links">
          <ArrowLeft />
        </button>
        <button type="button" className={pad} disabled={!sel} onClick={() => onNudge(0, -0.1)} aria-label="Nach hinten">
          <ArrowUp />
        </button>
        <button type="button" className={pad} disabled={!sel} onClick={() => onNudge(0, 0.1)} aria-label="Nach vorne">
          <ArrowDown />
        </button>
        <button type="button" className={pad} disabled={!sel} onClick={() => onNudge(0.1, 0)} aria-label="Nach rechts">
          <ArrowRight />
        </button>
        <button type="button" className={pad} disabled={!sel} onClick={() => onNudge(0, 0, 90)} aria-label="Drehen">
          <RotateCw />
        </button>
        <button type="button" className={cn(pad, "w-auto gap-1.5 px-3 text-[13px] font-semibold")} disabled={!sel} onClick={onStore}>
          <PackageOpen /> Wegräumen
        </button>
      </div>
      {owned.length ? (
        <div className="flex flex-wrap gap-2">
          {owned.map((i) => (
            <button key={i.id} type="button" onClick={() => onPlace(i.id)} className="flex items-center gap-1.5 rounded-full bg-[#7b6cff] py-1.5 pr-3 pl-1.5 text-[13.5px] font-semibold text-white shadow-[inset_0_-3px_0_rgba(0,0,0,.18)] active:translate-y-0.5">
              <span className="grid size-7 place-items-center rounded-full bg-white/90 text-base">{i.emoji}</span> {i.name} aufstellen <span className="opacity-75">×{qty(i.id)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13.5px] opacity-75">
          Keine Möbel im Lager.{" "}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={onShop}>
            Im Shop stöbern
          </button>
        </p>
      )}
    </div>
  );
}

const KIND_TITLE: Record<string, string> = { food: "Essen", toy: "Spielzeug", care: "Pflege", furniture: "Möbel", room: "Räume" };
const EFFECT_LABEL: Record<string, string> = { hunger: "Satt", energy: "Energie", joy: "Freude", clean: "Sauber" };

function Shop({ data, qty, unlocked, busy, onBuy }: { data: PetData; qty: (id: string) => number; unlocked: (r: RoomId) => boolean; busy: boolean; onBuy: (id: string) => void }) {
  const p = data.state.pet;
  const kinds = ["food", "toy", "care", "furniture", "room"] as const;
  const [kind, setKind] = React.useState<(typeof kinds)[number]>("food");
  return (
    <Panel title="Shop" subtitle={`Nur mit Spielmünzen, kein echtes Geld. Ihr habt ${p.coins} Münzen.`}>
      <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Kategorie">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn("h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold", kind === k ? "bg-[#2b2140] text-white dark:bg-white dark:text-[#2b2140]" : "bg-[#f4efff] dark:bg-white/5")}
          >
            {KIND_TITLE[k]}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {data.items
          .filter((i) => i.kind === kind)
          .map((i) => {
            const locked = i.min_stage > p.stage;
            const have = kind === "room" ? unlocked(i.effect.room as RoomId) : false;
            const ownedToy = kind === "toy" && qty(i.id) > 0;
            const effect = Object.entries(i.effect)
              .filter(([k]) => EFFECT_LABEL[k])
              .map(([k, v]) => `${Number(v) > 0 ? "+" : ""}${v} ${EFFECT_LABEL[k]}`)
              .join(" · ");
            return (
              <li key={i.id} className={cn("flex flex-col items-center gap-1 rounded-2xl bg-[#f4efff] p-3 text-center dark:bg-white/5", locked && "opacity-60")}>
                <span className="grid size-14 place-items-center rounded-2xl bg-white text-3xl shadow-[0_3px_0_rgba(43,33,64,.08)] dark:bg-white/10">{locked ? <Lock className="size-5 opacity-60" /> : i.emoji}</span>
                <p className="w-full truncate text-[14px] font-semibold">{i.name}</p>
                <p className="line-clamp-2 min-h-8 text-[11.5px] leading-tight opacity-70">
                  {locked ? `ab Stufe „${STAGES[i.min_stage].name}“` : effect || (kind === "toy" ? "bleibt für immer" : kind === "room" ? "neuer Raum" : "zum Aufstellen")}
                  {kind !== "room" && qty(i.id) ? ` · ${qty(i.id)} im Lager` : ""}
                </p>
                {have || ownedToy ? (
                  <span className="flex h-10 items-center gap-1 text-[13px] font-semibold text-[#2e9e5b]">
                    <Check className="size-4" /> ✓
                  </span>
                ) : (
                  <CoinButton disabled={busy || locked || p.coins < i.price} onClick={() => onBuy(i.id)} aria-label={`${i.name} für ${i.price} Münzen kaufen`}>
                    {i.price}
                  </CoinButton>
                )}
              </li>
            );
          })}
      </ul>
    </Panel>
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
