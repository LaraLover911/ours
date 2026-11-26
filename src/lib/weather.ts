/** WMO weather codes (as used by Open-Meteo) to a short German label and an emoji. */
export function weatherLabel(code: number | null | undefined, isDay = true): { text: string; emoji: string } {
  if (code == null) return { text: "unbekannt", emoji: "·" };
  if (code === 0) return { text: "klar", emoji: isDay ? "☀️" : "🌙" };
  if (code <= 2) return { text: "leicht bewölkt", emoji: isDay ? "🌤️" : "☁️" };
  if (code === 3) return { text: "bedeckt", emoji: "☁️" };
  if (code === 45 || code === 48) return { text: "Nebel", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { text: "Nieselregen", emoji: "🌦️" };
  if (code >= 61 && code <= 67) return { text: "Regen", emoji: "🌧️" };
  if (code >= 71 && code <= 77) return { text: "Schnee", emoji: "🌨️" };
  if (code >= 80 && code <= 82) return { text: "Regenschauer", emoji: "🌦️" };
  if (code === 85 || code === 86) return { text: "Schneeschauer", emoji: "🌨️" };
  if (code >= 95) return { text: "Gewitter", emoji: "⛈️" };
  return { text: "wechselhaft", emoji: "🌥️" };
}

export type WeatherResponse = {
  place: { name: string; country: string | null };
  current: { time: string; temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number; wind_speed_10m: number } | null;
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] } | null;
  timezone: string | null;
  source: string;
};
