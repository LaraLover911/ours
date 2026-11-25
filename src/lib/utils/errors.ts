export function errorMessage(err: unknown, fallback = "Etwas ist schiefgelaufen. Bitte versuch es nochmal.") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const msg = (err as { message: string }).message;
    if (/nicht eingeladen|not invited/i.test(msg) || /Database error saving new user/i.test(msg)) {
      return "Diese E-Mail ist nicht eingeladen. ours. ist nur für Abdullah & Lara.";
    }
    if (/Invalid login credentials/i.test(msg)) return "E-Mail oder Passwort stimmt nicht.";
    if (/Email not confirmed/i.test(msg)) return "Bitte bestätige zuerst deine E-Mail-Adresse.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Keine Verbindung. Bist du online?";
    if (/row-level security|permission denied|violates/i.test(msg)) return "Das darfst du leider nicht.";
    if (/Password should be at least/i.test(msg)) return "Das Passwort muss mindestens 8 Zeichen haben.";
    if (/rate limit/i.test(msg)) return "Zu viele Versuche. Bitte warte einen Moment.";
    if (/Payload too large|exceeded the maximum allowed size/i.test(msg)) return "Die Datei ist zu groß (max. 50 MB).";
    if (/mime type/i.test(msg)) return "Dieses Dateiformat wird nicht unterstützt.";
    return msg;
  }
  return fallback;
}
