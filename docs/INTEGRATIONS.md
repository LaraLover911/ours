# Integrationen einrichten

Alle Integrationen sind **optional**. Ohne Schlüssel zeigt ours. auf der Seite
*Integrationen* ehrlich an, was fehlt (nur die **Namen** der fehlenden Variablen,
nie Werte), und die zugehörigen Funktionen sind aus. Es wird nichts simuliert.

Alle Schlüssel sind **Server-Variablen** (ohne `NEXT_PUBLIC_`). Du trägst sie in
**Vercel → Project → Settings → Environment Variables** ein (Production und
Preview) und deployest danach neu. Sie gehören **nicht** ins GitHub-Repository.
Lokal kommen sie in `.env.local` (steht in `.gitignore`). Vorlage: `.env.example`.

`YOUR-APP` steht unten für deine Domain, z. B. `ours-rouge-one.vercel.app`.

---

## 0. Grundschlüssel (für Spotify, Google, Discord nötig)

| Variable | Wert |
|---|---|
| `INTEGRATIONS_ENCRYPTION_KEY` | 64 Hex-Zeichen, erzeugen mit `openssl rand -hex 32` |

OAuth-Tokens und Discord-Webhook-URLs werden mit AES-256-GCM verschlüsselt,
bevor sie in Supabase landen (Tabelle `integration_tokens`, für Clients komplett
gesperrt). Wird der Schlüssel später geändert, müsst ihr euch neu verbinden.

## 1. Spotify (Suche, Playlists, ganze Songs mit Premium)

1. <https://developer.spotify.com/dashboard> → *Create app*.
2. Redirect URI: `https://YOUR-APP/api/integrations/spotify/callback`
   (für lokal zusätzlich `http://127.0.0.1:3000/api/integrations/spotify/callback`).
3. APIs: *Web API* und *Web Playback SDK*.
4. Im Dashboard unter *User Management* beide Spotify-Konten eintragen
   (Apps im Development-Modus sind auf eingetragene Nutzer beschränkt).
5. Vercel: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.

Ganze Songs im Browser gehen nur mit **Spotify Premium** (Vorgabe von Spotify).
Ohne Premium läuft die offizielle 30-Sekunden-Vorschau bzw. YouTube.

## 2. Google Kalender (nur lesen, nur deine eigenen Termine)

1. <https://console.cloud.google.com> → neues Projekt → *APIs & Services*.
2. *Google Calendar API* aktivieren.
3. *OAuth consent screen*: Typ *External*, Scope
   `https://www.googleapis.com/auth/calendar.events.readonly`,
   beide Google-Konten als *Test users* eintragen.
4. *Credentials → Create OAuth client ID → Web application*,
   Redirect URI: `https://YOUR-APP/api/integrations/google/callback`.
5. Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

Die Termine sieht nur die Person, die verbunden hat (im Kalender als
„Google (nur du)“). Sie werden nicht in Supabase gespeichert.

## 3. Discord (Benachrichtigung in euren Kanal)

Kein Server-Schlüssel nötig, nur `INTEGRATIONS_ENCRYPTION_KEY`.
In Discord: *Kanal bearbeiten → Integrationen → Webhooks → Neuer Webhook →
URL kopieren* und auf der Seite *Integrationen* einfügen. Nur URLs von
`discord.com/api/webhooks/…` werden angenommen; Erwähnungen (@everyone) sind
abgeschaltet.

## 4. Wetter (Open-Meteo) und Karte (OpenStreetMap)

Keine Schlüssel. Jede Person tippt ihre Stadt selbst ein, es gibt **keine**
Standortabfrage und keine IP-Ortung. Die Karten-Kacheln kommen von
`tile.openstreetmap.org` mit Quellenangabe. Für sehr viel Verkehr wäre ein
eigener Kachel-Anbieter nötig (OSM-Nutzungsrichtlinie), für zwei Personen reicht es.

## 5. Medien-Suche (jeweils einzeln aktivierbar)

| Dienst | Variable | Wo | Hinweis |
|---|---|---|---|
| YouTube-Suche | `YOUTUBE_API_KEY` | Google Cloud → *YouTube Data API v3* → API-Schlüssel | Abspielen von YouTube-Links geht auch ohne Schlüssel |
| GIPHY | `GIPHY_API_KEY` | <https://developers.giphy.com> → *Create an App* (API) | „Powered by GIPHY“ wird angezeigt |
| Tenor | `TENOR_API_KEY` | Google Cloud → *Tenor API* → API-Schlüssel | |
| Unsplash | `UNSPLASH_ACCESS_KEY` | <https://unsplash.com/developers> → *New Application* → Access Key | Fotograf:in + Link werden angezeigt, Downloads werden gemeldet (Unsplash-Pflicht) |
| TMDB (Watchlist) | `TMDB_API_TOKEN` | <https://www.themoviedb.org/settings/api> → **API Read Access Token** (v4) | Ohne Token: Filme/Serien von Hand eintragen |

Alle Suchen laufen über den Server (`/api/media/search`), nur für eingeloggte
Mitglieder, mit Ratenbegrenzung. Schlüssel erreichen nie den Browser.

## 6. Anrufe über schwierige Netze (TURN)

Ohne TURN klappen Anrufe, wenn eine direkte Verbindung möglich ist (meist im
WLAN). Für Mobilfunk ↔ Mobilfunk braucht es ein Relay:

- **Cloudflare Realtime TURN**: `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`
- **oder** eigener TURN-Server: `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`

## 7. Push-Benachrichtigungen (Supabase Edge Function)

Die Funktion `push` erzeugt ihre VAPID-Schlüssel beim ersten Lauf selbst und
speichert sie in `push_config` (für Clients gesperrt). Sie braucht nur die
Variablen, die Supabase automatisch setzt. Nach Änderungen an
`supabase/functions/push/index.ts`: `npx supabase functions deploy push`.
Tägliche Erinnerungen (Frage des Tages, Jahrestage, Countdowns, Zeitkapseln)
laufen über `pg_cron` in Supabase.

---

## Prüfen

Seite **Integrationen** in der App: Jede Karte zeigt „eingerichtet“ oder die
fehlenden Variablennamen. Für die Medien-Suche gibt es dort eine Testsuche.
