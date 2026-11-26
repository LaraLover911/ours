/**
 * Last-activity status. Stored as "<doing>|<place>", e.g. "schaut Clips|Clips":
 * "doing" is shown while she's online, "place" next to "zuletzt aktiv" afterwards.
 */
const LABELS: [prefix: string, doing: string, place: string][] = [
  ["/chat", "ist im Chat", "Chat"],
  ["/clips", "schaut Clips", "Clips"],
  ["/calls", "ist bei den Anrufen", "Calls"],
  ["/privacy", "ist im Privacy Dashboard", "Privacy"],
  ["/activity", "schaut eure Aktivität an", "Activity"],
  ["/play", "ist in der Spiele-Lobby", "Play Together"],
  ["/listen", "ist bei Listen Together", "Listen Together"],
  ["/pet", "kümmert sich um euer Haustier", "Pet"],
  ["/integrations", "ist bei den Integrationen", "Integrationen"],
  ["/notifications", "ist in den Benachrichtigungen", "Benachrichtigungen"],
  ["/memories", "schaut eure Erinnerungen an", "Memories"],
  ["/letters", "liest Briefe", "Letters"],
  ["/diary", "ist im Tagebuch", "Diary"],
  ["/dates", "plant ein Date", "Dates"],
  ["/questions", "beantwortet die Tagesfrage", "Questions"],
  ["/games", "spielt Games", "Games"],
  ["/music", "hört eure Songs", "Music"],
  ["/surprises", "schaut nach Überraschungen", "Surprises"],
  // The studio is for secret surprises, so it never reveals itself.
  ["/studio", "ist auf Home", "Home"],
  ["/settings", "ist in den Einstellungen", "Settings"],
];

export function activityFor(pathname: string): string {
  for (const [prefix, doing, place] of LABELS) if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return `${doing}|${place}`;
  return "ist auf Home|Home";
}

export function parseActivity(value: string | null | undefined): { doing: string; place: string } | null {
  if (!value) return null;
  const [doing, place] = value.split("|");
  return { doing, place: place ?? doing };
}
