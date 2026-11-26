# Optionale Dienste einrichten

Alle Dienste sind **optional**. Ohne Schlüssel sind die zugehörigen Funktionen
aus und die App sagt ehrlich, was fehlt. Es wird nichts simuliert.

Alle Schlüssel sind **Server-Variablen** (ohne `NEXT_PUBLIC_`). Du trägst sie in
**Vercel → Project → Settings → Environment Variables** ein (Production und
Preview) und deployest danach neu. Sie gehören **nicht** ins GitHub-Repository.
Lokal kommen sie in `.env.local` (steht in `.gitignore`). Vorlage: `.env.example`.

---

## 1. Medien-Suche (Moodboard, Watchlist)

| Dienst | Variable | Wo | Hinweis |
|---|---|---|---|
| GIPHY | `GIPHY_API_KEY` | <https://developers.giphy.com> → *Create an App* (API) | „Powered by GIPHY“ wird angezeigt |
| Tenor | `TENOR_API_KEY` | Google Cloud → *Tenor API* → API-Schlüssel | |
| Unsplash | `UNSPLASH_ACCESS_KEY` | <https://unsplash.com/developers> → *New Application* → Access Key | Fotograf:in + Link werden angezeigt, Downloads werden gemeldet (Unsplash-Pflicht) |
| TMDB (Watchlist) | `TMDB_API_TOKEN` | <https://www.themoviedb.org/settings/api> → **API Read Access Token** (v4) | Ohne Token: Filme/Serien von Hand eintragen |

Alle Suchen laufen über den Server (`/api/media/search`), nur für eingeloggte
Mitglieder, mit Ratenbegrenzung. Schlüssel erreichen nie den Browser.

## 2. Karte und Orte (ohne Schlüssel)

- **Karte:** Kacheln von `tile.openstreetmap.org` mit Quellenangabe.
- **Ortssuche** auf der Karte: Open-Meteo Geocoding (`/api/geo/search`).
- **Ort bei Clips:** Wenn ein Video einen Ort in seinen Metadaten hat, wird er
  auf deinem Gerät gelesen. Der Server rundet die Koordinaten auf etwa 100 m und
  fragt OpenStreetMap Nominatim nach dem Ortsnamen (`/api/geo/reverse`).
  Gespeichert wird nur der Name, und nur wenn du ihn beim Posten an lässt.
  Es gibt **keine** Standortabfrage und keine IP-Ortung.

## 3. Anrufe über schwierige Netze (TURN)

Ohne TURN klappen Anrufe, wenn eine direkte Verbindung möglich ist (meist im
WLAN). Für Mobilfunk ↔ Mobilfunk braucht es ein Relay:

- **Cloudflare Realtime TURN**: `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`
- **oder** eigener TURN-Server: `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`

## 4. Push-Benachrichtigungen (Supabase Edge Function)

Die Funktion `push` erzeugt ihre VAPID-Schlüssel beim ersten Lauf selbst und
speichert sie in `push_config` (für Clients gesperrt). Sie braucht nur die
Variablen, die Supabase automatisch setzt. Nach Änderungen an
`supabase/functions/push/index.ts`: `npx supabase functions deploy push`.
Tägliche Erinnerungen (Frage des Tages, Jahrestage, Countdowns) laufen über
`pg_cron` in Supabase.
