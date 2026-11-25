"use client";

import * as React from "react";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "./avatar";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { timeAgo } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";

/** Comments for memories or diary entries (realtime). */
export function Comments({ table, parentKey, parentId }: { table: "memory_comments" | "diary_comments"; parentKey: "memory_id" | "entry_id"; parentId: string }) {
  const { supabase, me, profiles } = useApp();
  const { data, refetch, setData } = useQuery(async () => {
    if (table === "memory_comments") return must(await supabase.from("memory_comments").select("*").eq("memory_id", parentId).order("created_at"));
    return must(await supabase.from("diary_comments").select("*").eq("entry_id", parentId).order("created_at"));
  }, [table, parentId]);
  useRealtimeRefetch([table], refetch, `${table}-${parentId}`);
  const [text, setText] = React.useState("");

  return (
    <section aria-label="Kommentare" className="mt-6 border-t border-border pt-5">
      <h3 className="eyebrow mb-3">comments</h3>
      <ul className="grid gap-3">
        {(data ?? []).map((c) => (
          <li key={c.id} className="group flex gap-2.5">
            <Avatar profile={profiles[c.author_id]} size="sm" />
            <div className="min-w-0 flex-1 rounded-2xl bg-muted px-3.5 py-2">
              <p className="text-[12px] text-muted-foreground">
                {profiles[c.author_id]?.display_name} · {timeAgo(c.created_at)}
              </p>
              <p className="text-[14.5px] whitespace-pre-wrap">{c.body}</p>
            </div>
            {c.author_id === me.id ? (
              <button
                onClick={async () => {
                  setData((l) => l?.filter((x) => x.id !== c.id) as typeof l);
                  await supabase.from(table).delete().eq("id", c.id);
                }}
                className="grid size-8 place-items-center self-center rounded-full text-muted-foreground opacity-60 hover:bg-muted hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="Kommentar löschen"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
        {data?.length === 0 ? <li className="text-sm text-muted-foreground">Noch keine Kommentare.</li> : null}
      </ul>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          setText("");
          const payload = parentKey === "memory_id" ? { memory_id: parentId, body, author_id: me.id } : { entry_id: parentId, body, author_id: me.id };
          const { error } = await (table === "memory_comments"
            ? supabase.from("memory_comments").insert(payload as { memory_id: string; body: string; author_id: string })
            : supabase.from("diary_comments").insert(payload as { entry_id: string; body: string; author_id: string }));
          if (error) toast.error(errorMessage(error));
          void refetch();
        }}
      >
        <label htmlFor={`c-${parentId}`} className="sr-only">Kommentar</label>
        <input
          id={`c-${parentId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Schreib etwas Liebes…"
          className="h-11 min-w-0 flex-1 rounded-full border border-input bg-card px-4 outline-none focus-visible:ring-4 focus-visible:ring-ring"
        />
        <button type="submit" disabled={!text.trim()} className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label="Kommentar senden">
          <Send className="size-4" />
        </button>
      </form>
    </section>
  );
}
