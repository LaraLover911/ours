// Concatenates all migrations into supabase/setup-komplett.sql (for the Supabase SQL editor).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
let out = "-- ours. — komplettes Datenbank-Schema. Einmal komplett im Supabase SQL Editor ausführen.\n";
for (const f of files) out += `\n-- ===== ${f} =====\n${readFileSync(`${dir}/${f}`, "utf8")}`;
writeFileSync("supabase/setup-komplett.sql", out);
console.log(`setup-komplett.sql: ${files.length} migrations`);
