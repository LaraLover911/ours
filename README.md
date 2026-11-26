# ours. — Abdullah & Lara

> just us, in our own little universe.

Eine private Web-App nur für zwei: Chat in Echtzeit, Erinnerungen, „Open when…“-Briefe, ein gemeinsames Tagebuch, Date-Planer, tägliche Fragen, Mini-Games, Musik und eine Überraschungsbox.
Gebaut mit Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui-Komponenten (Radix), GSAP, Motion, Lenis und Supabase (Postgres, Auth, Realtime, Storage).

Die App erfindet nichts: keine gemeinsamen Erinnerungen, keine Daten und keine Fotos. Alles, was ihr seht, habt ihr selbst eingetragen oder hochgeladen. Solange etwas fehlt, zeigt die App schöne leere Zustände mit einem Hinweis, was man tun kann.

---

## Was funktioniert

| Bereich | Was drin ist |
| --- | --- |
| **Login & Sicherheit** | Login, Registrierung nur für eingeladene E-Mails, Logout, Passwort vergessen/zurücksetzen, geschützte Routen. Datenbankseitig sind maximal 2 Konten möglich. Row Level Security auf jeder Tabelle. |
| **Home** | Hero „somewhere between / you & me.“, Love Counter (Startdatum einstellbar), nächster Jahrestag, Countdown zum nächsten Date, gemeinsame Notiz, letzte Erinnerung, letzte Chatnachricht, Schnellzugriff. |
| **Chat** | Echtzeit-Nachrichten, Online-Status, „tippt gerade…“, Lesebestätigung, Antworten, Bearbeiten, Löschen, Reaktionen, Bilder, Videos, Sprachnachrichten, **Snaps** (Foto oder Video direkt aus der Kamera, kann einmal geöffnet werden und wird danach gelöscht; Button rechts neben dem Namen), Suche, Entwürfe, ungelesene Nachrichten, mehrere Unterhaltungen, Benachrichtigungen im Browser (solange die App offen ist). |
| **Memories** | Masonry-Album, Kategorien, Favoriten, Lightbox mit Wischen, Kommentare, Timeline „our story so far“. |
| **Love Letters** | „Open when…“-Kategorien, Umschlag-Animation, zeitgesteuert (bleiben bis zum Datum versiegelt, auch in der Datenbank), privat oder geteilt. |
| **Diary** | Abdullahs, Laras und gemeinsame Einträge, Stimmung, Fotos, Kommentare. Private Einträge sieht wirklich nur der Ersteller. |
| **Dates** | Ideen sammeln, abstimmen, planen, Kalenderansicht, Status. |
| **Daily Questions** | Eine Frage pro Tag, eigene Fragen. Die Antwort des anderen erscheint erst, wenn beide geantwortet haben (in der Datenbank erzwungen). |
| **Mini Games** | How well do you know me?, Who is more likely to?, This or That, Couple Quiz, Guess the Memory, Random Date Generator. Antworten werden gespeichert und synchronisiert. |
| **Surprises** | Geschenke, Nachrichten und versteckte Überraschungen mit Timer und Geschenkpapier-Animation. |
| **Studio** | Geheime Überraschungen für den anderen: Jumpscare (mit eigenem Gruselbild/-video oder eingebautem Gesicht und synthetischem Schrei), Video, Foto oder Nachricht. Sie erscheinen im Vollbild, sobald der andere ours. das nächste Mal öffnet. Zuerst kommt eine harmlose Karte („Ich hab dir was Süßes geschickt 💌“), der Tipp darauf startet den Ton. Im Studio siehst du, wann es gesehen wurde. |
| **Clips** | Eigener Video-Feed wie TikTok: Hochformat-Videos hochladen (bis 50 MB), vertikal durchwischen, Autoplay, Ton an/aus, Doppeltipp = Herz, Likes in Echtzeit. Umschalten zwischen neuesten und ältesten Clips, genaues Upload-Datum, Aufnahmedatum und Ort aus den Metadaten des Videos (nur der Ortsname, abschaltbar vor dem Posten). |
| **Anrufe** | Video- und Sprachanrufe direkt im Browser (WebRTC, Ende-zu-Ende verschlüsselt): Klingeln, Annehmen/Ablehnen, Stummschalten, Kamera aus, Kamera wechseln. Bis 1080p, Opus-Audio mit 128 kbit/s. Anrufen über Home oder den Chat. |
| **Status** | „Heute denke ich…“ (gilt nur für den Tag) und letzte Aktivität des anderen („schaut Clips“, „zuletzt aktiv vor 5 Minuten · Chat“). Respektiert die Einstellung „Online-Status zeigen“. |
| **Settings** | Profil, Profilbild, Startdatum, Hero-/Hintergrundbild, Farben, Hell/Dunkel, Benachrichtigungen, Privatsphäre, Konto. |

Dazu: Mobile-first, Safe Areas fürs iPhone, Bottom-Navigation, die Tastatur verdeckt den Chat nicht, „Reduzierte Bewegung“ wird respektiert, Hell- und Dunkelmodus, installierbar als App (Manifest und Icons).

## Was ich wirklich getestet habe

Alle Tests liefen gegen eine echte lokale Supabase-Instanz (Docker), nicht gegen Attrappen.

- `npm run lint`: ESLint ohne Fehler und ohne Warnungen.
- `npm run typecheck`: TypeScript ohne Fehler.
- `npm run build`: Produktions-Build erfolgreich.
- `npm run test:db`: über 35 Sicherheitsprüfungen für RLS, Storage und Einladungen, alle bestanden. Geprüft wird zum Beispiel: Ein drittes Konto wird abgelehnt, private Tagebucheinträge und private Dateien sind für den Partner unsichtbar, versiegelte Briefe sind vor dem Datum nicht lesbar, Antworten auf Tagesfragen bleiben verborgen, bis beide geantwortet haben, und ohne Login gibt es keinen Zugriff.
- Chat-Test mit zwei echten Browsern (Playwright): Nachricht hin und zurück, „tippt gerade…“, Lesebestätigung und Online-Status funktionieren in Echtzeit.
- Alle 11 Seiten auf iPhone-13- und Desktop-Größe geöffnet: keine Konsolenfehler, kein horizontales Scrollen.
- Lighthouse 12, Produktions-Build lokal (eingeloggt):

  | Seite | Desktop Performance | Mobil Performance* | Barrierefreiheit | Best Practices |
  | --- | --- | --- | --- | --- |
  | Login | 100 | 90 | 100 | 100 |
  | Home | 99 | 74–78 | 100 | 96** |
  | Chat | 99 | 82 | 100 | 96** |
  | Memories | 99 | 74–82 | 100 | 96** |
  | Letters | 99 | 80–84 | 100 | 96** |

  \* Lighthouse-Standard für Mobil: simuliertes langsames 4G und 4-fach gedrosselte CPU. CLS war überall 0.
  \** Der Abzug kommt vom Messaufbau: Lighthouse bekam den Login nur als Cookie-Header, deshalb schlugen einzelne Browser-Anfragen mit 401 fehl. Im normalen Browser passiert das nicht.

## Was du noch einrichten musst

1. Ein Supabase-Projekt (kostenlos reicht).
2. Eure echten E-Mail-Adressen als Einladung eintragen.
3. Die Umgebungsvariablen lokal und auf Vercel setzen.
4. Optional: eure Fotos in `public/images/…` legen.

Schritt für Schritt:

### 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein neues Projekt erstellen (Region z. B. Frankfurt).
2. Datenbank-Schema einspielen. Dafür gibt es zwei Wege:
   - **Mit der CLI (empfohlen):**
     ```bash
     npx supabase login
     npx supabase link --project-ref DEIN-PROJECT-REF
     npx supabase db push
     ```
   - **Ohne CLI:** Im Supabase-Dashboard unter *SQL Editor* die Dateien aus `supabase/migrations/` **in dieser Reihenfolge** einzeln ausführen (`…01_core.sql` bis `…05_question_pool.sql`).

   Damit werden alle Tabellen, RLS-Regeln, der private Storage-Bucket `media` und die Realtime-Einstellungen angelegt.

### 2. Abdullah & Lara als Benutzer einrichten

Nur E-Mails auf der Einladungsliste können sich registrieren, und es gibt höchstens zwei Konten. Im *SQL Editor* ausführen (mit euren echten Adressen, kleingeschrieben):

```sql
insert into public.invites (email, role, display_name) values
  ('abdullah@example.com', 'abdullah', 'Abdullah'),
  ('lara@example.com',     'lara',     'Lara');
```

Danach registriert sich jeder von euch einmal unter `/register` mit seiner E-Mail und einem Passwort und bestätigt die Mail. Alternativ kannst du im Dashboard unter *Authentication → Users → Invite user* eine Einladung an die beiden Adressen schicken.

Gut zu wissen:
- Fremde Registrierungen sind schon durch die Datenbank blockiert (Einladungsliste und Maximum von 2 Profilen). Wer ganz sichergehen will, schaltet nach eurer Registrierung unter *Authentication → Sign In / Providers* die Option „Allow new users to sign up“ aus.
- Die Rolle (Abdullah oder Lara) lässt sich nach der Registrierung nicht mehr ändern.

### 3. Auth-URLs einstellen

Im Supabase-Dashboard unter *Authentication → URL Configuration*:

- **Site URL:** eure Live-Adresse, z. B. `https://ours-xyz.vercel.app`
- **Redirect URLs:** `https://ours-xyz.vercel.app/**` und für lokal `http://localhost:3000/**`

Sonst funktionieren die Links in Bestätigungs- und Passwort-Mails nicht.

### 4. Umgebungsvariablen

`.env.example` nach `.env.local` kopieren und ausfüllen. Die Werte findest du im Supabase-Dashboard unter *Project Settings → API Keys* und *Data API*.

| Variable | Wert |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://DEIN-PROJECT-REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Der **Publishable Key** (`sb_publishable_…`). Ein älterer „anon“-Key funktioniert auch, dann als `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `NEXT_PUBLIC_SITE_URL` | Lokal `http://localhost:3000`, live eure Vercel-Adresse. |

**Niemals** den `service_role`- oder `secret`-Key verwenden. Die App braucht ihn nicht, und er gehört weder ins Frontend noch zu GitHub. `.env.local` steht in `.gitignore`.

Optionale Dienste (GIPHY, Tenor, Unsplash, TMDB, TURN für Anrufe) richtest du mit **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)** ein.

### 5. Lokal starten

```bash
npm install
npm run dev
```

Dann <http://localhost:3000> öffnen. Auf Home könnt ihr direkt euer Startdatum setzen, dann läuft der Love Counter los.

### 6. Deploy auf Vercel

1. Dieses Repository auf GitHub pushen (privat).
2. Auf [vercel.com](https://vercel.com) → *Add New → Project* → Repository auswählen. Framework „Next.js“ wird automatisch erkannt.
3. Unter *Environment Variables* die drei Variablen aus Schritt 4 eintragen (`NEXT_PUBLIC_SITE_URL` = die Vercel-Adresse).
4. *Deploy*. Danach die Vercel-Adresse in Supabase als Site URL und Redirect URL eintragen (Schritt 3).

## Eure Fotos

Es gibt zwei Wege, und beide bleiben privat:

1. **In der App hochladen (empfohlen):** Profilbilder, Hero- und Hintergrundbild unter *Settings*, Fotos und Videos in Memories, Chat, Diary, Letters und Surprises. Alles landet im **privaten** Supabase-Bucket `media` und wird nur über kurzlebige, signierte Links angezeigt. Bilder werden vor dem Upload verkleinert, erlaubt sind Bilder, Videos und Audio bis 50 MB.
2. **Fest im Projekt:** Fotos in diese Ordner legen:
   ```
   public/images/abdullah/     Fotos von Abdullah (erstes Foto = Profilbild-Fallback)
   public/images/lara/         Fotos von Lara
   public/images/together/     gemeinsame Fotos (erstes Foto = Hero auf Home)
   public/images/memories/     weitere Erinnerungsfotos
   public/images/backgrounds/  Hintergründe (unter Settings wählbar)
   ```
   Beim `npm run dev` und `npm run build` werden daraus automatisch optimierte WebP-Versionen gebaut. Diese Bilder werden nur an eingeloggte Nutzer ausgeliefert. Wichtig: Sie liegen dann aber im Git-Repository. Das Repository muss also privat bleiben. Wer das nicht möchte, nutzt Weg 1.

Ohne Fotos zeigt die App überall schöne Platzhalter.

## Ehrliche Grenzen

- **Anrufe** laufen direkt zwischen euren Geräten (Ende-zu-Ende verschlüsselt). In den meisten WLANs klappt das sofort. Zwischen zwei Mobilfunknetzen oder hinter strengen Firewalls gibt es oft keinen direkten Weg, dafür braucht es einen **TURN-Server** (Relay). Ohne ihn zeigt ours. nach spätestens 30 Sekunden eine klare Fehlermeldung statt endlos „verbinde…“. Einrichten (nur auf dem Server, nie im Frontend): in Vercel → Settings → Environment Variables entweder `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN` (Cloudflare Realtime TURN, 1 TB/Monat gratis; kurzlebige Zugangsdaten werden pro Anruf erzeugt) oder `TURN_URLS` + `TURN_USERNAME` + `TURN_CREDENTIAL` (beliebiger TURN-Server). Danach neu deployen. Angerufen werden kann, wenn ours. beim anderen offen ist (mit Push-Benachrichtigungen auch im Hintergrund).
- **Jumpscare-Ton:** Browser erlauben Ton erst nach einem Tipp. Deshalb kommt zuerst die harmlose Karte.

- **Benachrichtigungen** kommen, solange ours. in einem Tab oder als installierte App geöffnet ist. Echte Push-Nachrichten bei komplett geschlossener App bräuchten zusätzlich einen Push-Dienst mit Server-Schlüssel und sind bewusst nicht eingebaut.
- **Snaps:** Ein Browser kann Screenshots nicht erkennen oder verhindern. „Einmal öffnen“ ist in der Datenbank erzwungen, schützt aber nicht vor einem Bildschirmfoto.
- **Ort bei Clips:** Steht nur in Videos, die die Kamera-App mit Ort aufgenommen hat (iPhone/Android mit Ortungsdienst für die Kamera). Bildschirmaufnahmen und viele weitergeleitete Videos haben keinen Ort.
- **Mobil-Performance:** Die Seiten laden ihre Daten nach dem Start im Browser. Auf langsamen Verbindungen erscheinen deshalb kurz Skeleton-Platzhalter (siehe Lighthouse-Werte oben).

## Für Entwickler

```bash
npm run dev         # Entwicklungsserver
npm run build       # Produktions-Build
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm run db:start    # lokale Supabase (Docker nötig)
npm run db:reset    # lokale DB neu aufsetzen (Migrationen + Test-Einladungen)
npm run db:types    # TypeScript-Typen aus der lokalen DB generieren
npm run test:db     # Sicherheitstests gegen die lokale DB
```

Für die lokale Supabase (`npm run db:start`) legt `supabase/seed.sql` zwei Test-Einladungen an: `abdullah@ours.local` und `lara@ours.local`. Die Seed-Datei läuft nie auf dem echten Projekt.

**Struktur**

```
src/app/(auth)/          Login, Registrierung, Passwort
src/app/(app)/           alle geschützten Seiten
src/components/<bereich> Features (chat, memories, letters, …)
src/components/ui/       Basis-Komponenten (shadcn/ui-Stil auf Radix)
src/lib/supabase/        Supabase-Clients, Session-Proxy, private Medien
src/proxy.ts             schützt alle Seiten und /images, /photos
supabase/migrations/     Schema, RLS, Storage, Realtime
scripts/                 Foto-Pipeline und DB-Sicherheitstests
```
