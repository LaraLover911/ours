import { redirect } from "next/navigation";
import { AppProvider } from "@/components/providers/app-provider";
import { AppShell } from "@/components/navigation/app-shell";
import { NoAccess } from "@/components/auth/no-access";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function PrivateLayout({ children }: LayoutProps<"/">) {
  const supabase = await getSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) redirect("/login");

  const [{ data: profiles }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*").order("role"),
    supabase.from("couple_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  const me = profiles?.find((p) => p.id === uid);
  if (!me || !settings) return <NoAccess />;

  return (
    <AppProvider initialMe={me} initialProfiles={profiles ?? []} initialSettings={settings}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
