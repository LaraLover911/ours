"use client";

import * as React from "react";
import { ExternalLink, Gift, PackageCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

type Wish = Database["public"]["Tables"]["wishlist_items"]["Row"];
const PRIO = { 1: "großer Wunsch", 2: "würde mich freuen", 3: "Kleinigkeit" } as Record<number, string>;

/** Shared wishlist. Reservations are only visible to the person who reserved (RLS), so surprises stay surprises. */
export function WishlistPage() {
  const { supabase, me, partner } = useApp();
  const wishes = useQuery(async () => must(await supabase.from("wishlist_items").select("*").order("priority").order("created_at", { ascending: false })), [supabase]);
  const claims = useQuery(async () => must(await supabase.from("wishlist_claims").select("item_id")), [supabase]);
  useRealtimeRefetch(["wishlist_items"], () => void wishes.refetch());
  const [title, setTitle] = React.useState("");
  const [link, setLink] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [prio, setPrio] = React.useState("2");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (link && !/^https?:\/\//.test(link.trim())) return toast.error("Der Link muss mit https:// beginnen.");
    const { error } = await supabase.from("wishlist_items").insert({ title: title.trim(), link: link.trim() || null, price: price.trim() || null, priority: Number(prio) });
    if (error) return toast.error(errorMessage(error));
    setTitle("");
    setLink("");
    setPrice("");
    void wishes.refetch();
  };
  const claimed = new Set((claims.data ?? []).map((c) => c.item_id));
  const toggleClaim = async (w: Wish) => {
    const { error } = claimed.has(w.id) ? await supabase.from("wishlist_claims").delete().eq("item_id", w.id) : await supabase.from("wishlist_claims").insert({ item_id: w.id });
    if (error) return toast.error(errorMessage(error));
    void claims.refetch();
  };
  const mine = (wishes.data ?? []).filter((w) => w.owner_id === me.id);
  const theirs = (wishes.data ?? []).filter((w) => w.owner_id !== me.id);
  const partnerName = partner?.display_name ?? "dein Schatz";

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="wishlist"
        title={
          <>
            little <em className="text-primary">wishes</em>
          </>
        }
        description={`Wünsche für Geburtstage, Jahrestage oder einfach so. Wenn du etwas von ${partnerName}s Liste reservierst, sieht ${partnerName} das nicht.`}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Section icon={<Gift />} title="Meine Wünsche">
          <form onSubmit={add} className="mb-4 grid gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 140))} placeholder="Was wünschst du dir?" aria-label="Wunsch" required />
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Input value={link} onChange={(e) => setLink(e.target.value.slice(0, 600))} placeholder="Link (optional)" aria-label="Link" inputMode="url" />
              <Input value={price} onChange={(e) => setPrice(e.target.value.slice(0, 40))} placeholder="ca. €" aria-label="Preis" />
            </div>
            <div className="flex gap-2">
              <NativeSelect value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Wichtigkeit" className="min-w-0 flex-1">
                <option value="1">großer Wunsch</option>
                <option value="2">würde mich freuen</option>
                <option value="3">Kleinigkeit</option>
              </NativeSelect>
              <Button type="submit" disabled={!title.trim()}>
                <Plus /> Hinzufügen
              </Button>
            </div>
          </form>
          <List loading={wishes.loading} items={mine} empty="Noch keine Wünsche.">
            {(w) => (
              <>
                <Button size="icon-sm" variant="ghost" aria-label={w.received_at ? "Als offen markieren" : "Bekommen"} onClick={async () => {
                  const { error } = await supabase.from("wishlist_items").update({ received_at: w.received_at ? null : new Date().toISOString() }).eq("id", w.id);
                  if (error) toast.error(errorMessage(error));
                  else void wishes.refetch();
                }}>
                  <PackageCheck />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Löschen" onClick={async () => {
                  const { error } = await supabase.from("wishlist_items").delete().eq("id", w.id);
                  if (error) toast.error(errorMessage(error));
                  else void wishes.refetch();
                }}>
                  <Trash2 />
                </Button>
              </>
            )}
          </List>
        </Section>
        <Section icon={<Gift />} title={`${partnerName}s Wünsche`} description="Reservieren ist nur für dich sichtbar.">
          <List loading={wishes.loading} items={theirs} empty={`${partnerName} hat noch nichts eingetragen.`} claimed={claimed}>
            {(w) => (
              <Button size="sm" variant={claimed.has(w.id) ? "default" : "outline"} onClick={() => toggleClaim(w)} disabled={!!w.received_at}>
                {claimed.has(w.id) ? "Reserviert ✓" : "Reservieren"}
              </Button>
            )}
          </List>
        </Section>
      </div>
    </PageContainer>
  );
}

function List({ items, loading, empty, children, claimed }: { items: Wish[]; loading: boolean; empty: string; children: (w: Wish) => React.ReactNode; claimed?: Set<string> }) {
  if (loading) return <Skeleton className="h-24" />;
  if (!items.length) return <p className="text-[14px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((w) => (
        <li key={w.id} className={cn("flex items-center gap-3 py-3", w.received_at && "opacity-55")}>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[14.5px] font-medium break-words", w.received_at && "line-through")}>
              {w.title}
              {claimed?.has(w.id) ? <span className="ml-1 text-[12px] font-normal text-primary">· von dir reserviert</span> : null}
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              {PRIO[w.priority]}
              {w.price ? ` · ${w.price}` : ""}
              {w.received_at ? " · bekommen ♡" : ""}
              {w.link ? (
                <a href={w.link} target="_blank" rel="noopener noreferrer nofollow" className="ml-1 inline-flex items-center gap-0.5 underline underline-offset-2">
                  Link <ExternalLink className="size-3" />
                </a>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">{children(w)}</div>
        </li>
      ))}
    </ul>
  );
}
