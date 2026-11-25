-- ours. — prompts for the Play Together party games. Generic questions and ideas,
-- nothing about the two of you is made up. Re-running this adds nothing twice.

create or replace function pg_temp.seed(content_kind text, items jsonb)
returns void
language sql
as $$
  insert into public.game_content (kind, body)
  select content_kind, x from jsonb_array_elements(items) x
  where not exists (select 1 from public.game_content c where c.kind = content_kind and c.body = x);
$$;

select pg_temp.seed('quiz', $j$[
  {"q": "Mein perfekter Sonntag?", "options": ["Ausschlafen und Brunch", "Raus in die Natur", "Serien-Marathon", "Stadt, Café, Bummeln"]},
  {"q": "Wenn ich nur noch eins essen dürfte…", "options": ["Pizza", "Sushi", "Pasta", "Burger"]},
  {"q": "Welche Superkraft hätte ich am liebsten?", "options": ["Teleportieren", "Gedanken lesen", "Zeit anhalten", "Fliegen"]},
  {"q": "Meine Traumreise?", "options": ["Strand und Meer", "Großstadt", "Berge und Hütte", "Roadtrip"]},
  {"q": "Morgens bin ich…", "options": ["sofort wach", "erst nach Kaffee ein Mensch", "Snooze-Profi", "kommt drauf an"]},
  {"q": "Wenn ich traurig bin, hilft mir am meisten…", "options": ["eine Umarmung", "Essen", "Musik", "Ablenkung und Lachen"]},
  {"q": "Mein Lieblings-Filmgenre?", "options": ["Romcom", "Horror", "Action", "Drama"]},
  {"q": "Das schönste Geschenk für mich wäre…", "options": ["etwas Selbstgemachtes", "ein gemeinsames Erlebnis", "Blumen und ein Brief", "etwas, das ich mir gewünscht habe"]},
  {"q": "Meine Lieblings-Jahreszeit?", "options": ["Frühling", "Sommer", "Herbst", "Winter"]},
  {"q": "Ich fühle mich am meisten geliebt durch…", "options": ["Worte", "Zeit zusammen", "Berührung", "kleine Aufmerksamkeiten"]},
  {"q": "Was nervt mich am meisten?", "options": ["Unpünktlichkeit", "Lautes Kauen", "Langsames WLAN", "Wenn jemand spoilert"]},
  {"q": "Auf einer Party bin ich…", "options": ["auf der Tanzfläche", "in der Küche am Quatschen", "beim Essen", "die erste, die gehen will"]},
  {"q": "Mein Go-to-Getränk?", "options": ["Kaffee", "Tee", "Matcha", "Softdrink"]},
  {"q": "Womit kann man mich am schnellsten bestechen?", "options": ["Schokolade", "Pommes", "Kuscheln", "Ausschlafen lassen"]},
  {"q": "Wenn ich im Lotto gewinne, kaufe ich zuerst…", "options": ["eine Reise", "ein Haus", "ein Auto", "ich spare alles"]},
  {"q": "Mein geheimes Talent wäre gern…", "options": ["Singen", "Tanzen", "Kochen wie ein Profi", "Zeichnen"]},
  {"q": "Bei einem Streit brauche ich…", "options": ["sofort reden", "erst kurz Ruhe", "eine Umarmung", "Essen"]},
  {"q": "Mein Lieblingsort zum Entspannen?", "options": ["Bett", "Badewanne", "Sofa", "draußen"]},
  {"q": "Welche Tageszeit mag ich am liebsten?", "options": ["früher Morgen", "Mittag", "Abend", "mitten in der Nacht"]},
  {"q": "Mein Handy-Akku ist meistens…", "options": ["voll", "halb", "unter 20 %", "gerade leer"]}
]$j$::jsonb);

select pg_temp.seed('thisorthat', $j$[
  {"a": "Kaffee", "b": "Tee"}, {"a": "Strand", "b": "Berge"}, {"a": "Netflix", "b": "Ausgehen"},
  {"a": "Frühaufsteher", "b": "Nachteule"}, {"a": "Pizza", "b": "Sushi"}, {"a": "Sommer", "b": "Winter"},
  {"a": "Katze", "b": "Hund"}, {"a": "Schreiben", "b": "Anrufen"}, {"a": "Süß", "b": "Salzig"},
  {"a": "Stadt", "b": "Land"}, {"a": "Romcom", "b": "Thriller"}, {"a": "Sonnenaufgang", "b": "Sonnenuntergang"},
  {"a": "Kochen", "b": "Bestellen"}, {"a": "Planen", "b": "Spontan"}, {"a": "Bücher", "b": "Serien"},
  {"a": "Duschen morgens", "b": "Duschen abends"}, {"a": "Kuscheln", "b": "Platz im Bett"}, {"a": "Regen", "b": "Schnee"},
  {"a": "Konzert", "b": "Kino"}, {"a": "Pommes", "b": "Chips"}, {"a": "Schokolade", "b": "Gummibärchen"},
  {"a": "Fotos machen", "b": "Im Moment sein"}, {"a": "Fliegen", "b": "Zug fahren"}, {"a": "Hotel", "b": "Zelt"},
  {"a": "Erst Dessert", "b": "Erst Hauptgang"}, {"a": "Tanzen", "b": "Singen"}, {"a": "Laut", "b": "Leise"},
  {"a": "Altes Lieblingslied", "b": "Neue Entdeckung"}, {"a": "Frühstück", "b": "Abendessen"}, {"a": "Brettspiel", "b": "Videospiel"}
]$j$::jsonb);

select pg_temp.seed('guess', $j$[
  {"q": "Welches Essen könnte ich jeden Tag essen?"},
  {"q": "Was würde ich als Erstes tun, wenn ich unsichtbar wäre?"},
  {"q": "Welcher Song läuft gerade in meinem Kopf?"},
  {"q": "Was ist mein liebstes Geräusch?"},
  {"q": "Wohin würde ich morgen spontan reisen?"},
  {"q": "Welches Emoji benutze ich am häufigsten?"},
  {"q": "Was war mein Lieblingsspielzeug als Kind?"},
  {"q": "Welcher Film bringt mich immer zum Lachen?"},
  {"q": "Was würde ich auf eine einsame Insel mitnehmen?"},
  {"q": "Was ist meine liebste Pizza-Sorte?"},
  {"q": "Welches Tier wäre ich?"},
  {"q": "Was ist mein schlimmster Ohrwurm?"},
  {"q": "Was würde ich mit einem freien Tag ganz allein machen?"},
  {"q": "Was ist mein Lieblingsgeruch?"},
  {"q": "Welche Farbe hätte mein Traumauto?"},
  {"q": "Welche Serie würde ich sofort nochmal schauen?"},
  {"q": "Was bestelle ich im Café immer?"},
  {"q": "Was ist das Erste, das ich morgens mache?"},
  {"q": "Welcher Promi wäre mein bester Freund?"},
  {"q": "Was ist mein liebstes Wort?"}
]$j$::jsonb);

select pg_temp.seed('truth', $j$[
  {"text": "Was war dein erster Gedanke, als du mich zum ersten Mal gesehen hast?"},
  {"text": "Was ist eine Kleinigkeit an mir, die du heimlich total süß findest?"},
  {"text": "Wann hast du zuletzt an mich gedacht und warum?"},
  {"text": "Was ist dein peinlichster Moment aus der Schulzeit?"},
  {"text": "Was würdest du an unserem perfekten Tag zusammen machen?"},
  {"text": "Welche Angewohnheit von dir würdest du gern loswerden?"},
  {"text": "Was ist ein Traum, den du noch niemandem erzählt hast?"},
  {"text": "Wovor hattest du als Kind am meisten Angst?"},
  {"text": "Was ist die verrückteste Sache, die du je gemacht hast?"},
  {"text": "Welches Lied erinnert dich an mich?"},
  {"text": "Was hast du zuletzt gegoogelt?"},
  {"text": "Was war dein schönster Moment in diesem Jahr?"},
  {"text": "Was möchtest du unbedingt einmal mit mir erleben?"},
  {"text": "Welche Eigenschaft bewunderst du an mir am meisten?"},
  {"text": "Wann hast du zuletzt geweint und warum?"},
  {"text": "Was ist dein Guilty Pleasure?"},
  {"text": "Welches Kompliment hat dir am meisten bedeutet?"},
  {"text": "Was würdest du tun, wenn du einen Tag lang ich wärst?"},
  {"text": "Was ist deine liebste Erinnerung aus deiner Kindheit?"},
  {"text": "Worüber machst du dir gerade die meisten Gedanken?"},
  {"text": "Was ist dir wichtig in einer Beziehung, das du nie laut sagst?"},
  {"text": "Welche App öffnest du am häufigsten?"},
  {"text": "Was war die beste Entscheidung deines Lebens?"},
  {"text": "Wofür bist du heute dankbar?"},
  {"text": "Was ist ein Geheimtalent, das ich noch nicht kenne?"}
]$j$::jsonb);

select pg_temp.seed('dare', $j$[
  {"text": "Schick ein Selfie mit deiner lustigsten Grimasse."},
  {"text": "Sing die erste Zeile deines Lieblingsliedes als Sprachnachricht."},
  {"text": "Schreib mir ein Gedicht mit vier Zeilen, jetzt sofort."},
  {"text": "Mach 10 Hampelmänner und zähl laut mit."},
  {"text": "Beschreib mich in drei Emojis."},
  {"text": "Erzähl einen Witz. Wenn ich nicht lache, noch einen."},
  {"text": "Imitier mich, wie ich morgens aufwache."},
  {"text": "Zeig mir das letzte Foto in deiner Galerie."},
  {"text": "Sag mir drei Dinge, die du an mir liebst, ohne zu zögern."},
  {"text": "Sprich die nächste Minute nur mit Akzent."},
  {"text": "Mach ein Foto von etwas in deiner Nähe, das dich an mich erinnert."},
  {"text": "Tanz 15 Sekunden zu einem Lied, das ich aussuche."},
  {"text": "Schreib mir eine Liebeserklärung nur mit Wörtern, die mit dem gleichen Buchstaben anfangen."},
  {"text": "Zeichne mich in 30 Sekunden und schick das Bild."},
  {"text": "Erzähl mir von deinem Tag wie ein Nachrichtensprecher."},
  {"text": "Mach ein Kompliment, das du noch nie jemandem gemacht hast."},
  {"text": "Stell dein Handy für die nächste Stunde auf meinen Lieblingssong als Klingelton."},
  {"text": "Schick mir eine Sprachnachricht, in der du flüsterst, was du heute Abend vorhast."},
  {"text": "Mach eine Pose wie auf einem Filmplakat und schick ein Foto."},
  {"text": "Plane in 60 Sekunden unser nächstes Date und erzähl es mir."},
  {"text": "Lies mir die letzte Nachricht vor, die du jemand anderem geschickt hast (wenn es okay ist)."},
  {"text": "Erfinde einen Spitznamen für mich und benutze ihn den Rest des Spiels."},
  {"text": "Mach 20 Sekunden lang einen Tierlaut deiner Wahl."},
  {"text": "Schreib mir, was du an unserem ersten Date anders machen würdest."},
  {"text": "Erzähl mir eine kleine Gute-Nacht-Geschichte in drei Sätzen."}
]$j$::jsonb);

select pg_temp.seed('date', $j$[
  {"text": "Kocht zusammen ein Gericht aus einem Land, in dem ihr noch nie wart."},
  {"text": "Macht einen Fotowalk: jeder fotografiert zehn Dinge, die ihn an den anderen erinnern."},
  {"text": "Picknick an einem Ort, an dem ihr noch nie zusammen wart."},
  {"text": "Filmabend, aber jeder sucht den Film für den anderen aus, ohne ihn vorher zu verraten."},
  {"text": "Baut eine Deckenburg und verbringt den Abend darin."},
  {"text": "Geht in ein Museum und erfindet zu jedem Bild eine eigene Geschichte."},
  {"text": "Sternegucken mit Decke und heißem Kakao."},
  {"text": "Ein Abend ohne Handys: Brettspiele, Kerzen, Musik."},
  {"text": "Erstellt zusammen eine Playlist mit 20 Songs, die eure Geschichte erzählen."},
  {"text": "Frühstück im Bett, für einander zubereitet."},
  {"text": "Karaoke-Abend, zu Hause oder in einer Bar."},
  {"text": "Lauft eine Route, die ihr vorher auf der Karte als Herz gezeichnet habt."},
  {"text": "Flohmarkt-Challenge: jeder kauft für 5 € ein Geschenk für den anderen."},
  {"text": "Schreibt euch gegenseitig einen Brief und lest ihn euch beim Abendessen vor."},
  {"text": "Probiert zusammen etwas aus, was keiner von euch kann: Töpfern, Tanzen, Klettern."},
  {"text": "Sonnenaufgang anschauen, mit Kaffee aus der Thermoskanne."},
  {"text": "Ein Tag als Touristen in eurer eigenen Stadt."},
  {"text": "Backt etwas zusammen, und jeder darf eine geheime Zutat hinzufügen."},
  {"text": "Videocall-Date: gleiche Mahlzeit bestellen, gleichen Film starten."},
  {"text": "Eis-Tour: probiert drei Eisdielen und kürt einen Sieger."},
  {"text": "Spaziergang ohne Ziel, und an jeder Kreuzung entscheidet ein Münzwurf."},
  {"text": "Plant euren Traumurlaub in allen Details, als würdet ihr morgen fliegen."},
  {"text": "Minigolf oder Bowling mit einer kleinen Wette um den nächsten Abwasch."},
  {"text": "Macht ein Mini-Fotoshooting im Partnerlook."},
  {"text": "Lest euch gegenseitig ein Kapitel aus eurem Lieblingsbuch vor."}
]$j$::jsonb);
