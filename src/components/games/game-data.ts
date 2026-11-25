/** Prompts for the mini games (game content, not memories). */

export const ABOUT_ME = [
  { key: "sunday", q: "Mein perfekter Sonntag?", options: ["Ausschlafen & Brunch", "Raus in die Natur", "Serien-Marathon", "Stadt, Café, Shopping"] },
  { key: "food", q: "Wenn ich nur noch eins essen dürfte…", options: ["Pizza", "Sushi", "Pasta", "Burger"] },
  { key: "superpower", q: "Welche Superkraft hätte ich am liebsten?", options: ["Teleportieren", "Gedanken lesen", "Zeit anhalten", "Fliegen"] },
  { key: "trip", q: "Traumreise?", options: ["Strand & Meer", "Großstadt", "Berge & Hütte", "Roadtrip"] },
  { key: "morning", q: "Morgens bin ich…", options: ["sofort wach", "erst nach Kaffee ein Mensch", "Snooze-Profi", "kommt drauf an"] },
  { key: "comfort", q: "Wenn ich traurig bin, hilft mir am meisten…", options: ["eine Umarmung", "Essen", "Musik", "Ablenkung & Lachen"] },
  { key: "movie", q: "Lieblings-Filmgenre?", options: ["Romcom", "Horror", "Action", "Drama"] },
  { key: "gift", q: "Das schönste Geschenk für mich wäre…", options: ["etwas Selbstgemachtes", "ein gemeinsames Erlebnis", "Blumen & Brief", "etwas, das ich mir gewünscht habe"] },
  { key: "season", q: "Meine Lieblings-Jahreszeit?", options: ["Frühling", "Sommer", "Herbst", "Winter"] },
  { key: "pet", q: "Wenn wir ein Haustier hätten…", options: ["Katze", "Hund", "Hase", "lieber keins"] },
  { key: "drink", q: "Mein Go-to-Getränk?", options: ["Kaffee", "Tee", "Matcha", "Softdrink"] },
  { key: "lovelang", q: "Ich fühle mich am meisten geliebt durch…", options: ["Worte", "Zeit zusammen", "Berührung", "kleine Aufmerksamkeiten"] },
];

export const LIKELY = [
  "Wer ist eher zu spät?",
  "Wer weint eher bei einem Film?",
  "Wer verliebt sich zuerst in ein Haustier auf der Straße?",
  "Wer vergisst eher, wo das Handy liegt?",
  "Wer schläft eher beim Filmabend ein?",
  "Wer plant eher den nächsten Urlaub?",
  "Wer isst eher das letzte Stück?",
  "Wer schreibt eher zuerst „guten Morgen“?",
  "Wer entschuldigt sich eher zuerst?",
  "Wer lacht eher über die eigenen Witze?",
  "Wer macht eher spontan eine Überraschung?",
  "Wer verbringt mehr Zeit am Handy?",
];

export const THIS_OR_THAT: [string, string][] = [
  ["Kaffee", "Tee"],
  ["Strand", "Berge"],
  ["Netflix", "Ausgehen"],
  ["Frühaufsteher", "Nachteule"],
  ["Pizza", "Sushi"],
  ["Sommer", "Winter"],
  ["Katze", "Hund"],
  ["Text", "Anruf"],
  ["Süß", "Salzig"],
  ["Stadt", "Land"],
  ["Romcom", "Thriller"],
  ["Sonnenaufgang", "Sonnenuntergang"],
];

export const RANDOM_DATE = {
  activity: ["Picknick", "Kochabend", "Kino", "Museum", "Spaziergang", "Minigolf", "Spieleabend", "Karaoke", "Flohmarkt", "Bowling", "Eis essen", "Fotowalk", "Bauen einer Deckenburg", "Sternegucken", "Töpferkurs"],
  place: ["im Park", "zuhause", "in der Stadt", "am Wasser", "auf dem Balkon", "in einem neuen Café", "in einem Viertel, das ihr nicht kennt", "irgendwo mit Aussicht"],
  twist: ["ohne Handys", "im Partnerlook", "mit einem Budget von 15 €", "bei Sonnenuntergang", "mit selbstgemachter Playlist", "jeder überrascht den anderen mit einer Kleinigkeit", "nur mit Fotos auf Film", "mit einem Thema: 90er"],
};
