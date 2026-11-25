/**
 * Device details exactly as the browser reports them. Nothing is guessed or
 * simulated: a value the browser does not provide stays null and the UI shows
 * "Nicht verfügbar". No IP, no location, no fingerprinting.
 */
export type DeviceInfo = {
  id: string;
  name: string;
  device_type: "mobile" | "tablet" | "desktop" | "unknown";
  os: string | null;
  os_version: string | null;
  browser: string | null;
  browser_version: string | null;
  screen: string | null;
  viewport: string | null;
  pwa: boolean;
  app_version: string;
  connection: string | null;
  battery_level: number | null;
  battery_charging: boolean | null;
};

type UAData = {
  mobile?: boolean;
  platform?: string;
  brands?: { brand: string; version: string }[];
  getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string; fullVersionList?: { brand: string; version: string }[] }>;
};

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

function parseUA(ua: string) {
  let os: string | null = null;
  let osVersion: string | null = null;
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/(iPhone|iPad|iPod).*? OS (\d+[_\d]*)/))) {
    os = m[1] === "iPad" ? "iPadOS" : "iOS";
    osVersion = m[2].replace(/_/g, ".");
  } else if ((m = ua.match(/Android (\d+(?:\.\d+)*)/))) {
    os = "Android";
    osVersion = m[1];
  } else if ((m = ua.match(/Mac OS X (\d+[_.\d]*)/))) {
    os = "macOS";
    osVersion = m[1].replace(/_/g, ".");
  } else if (/Windows/.test(ua)) os = "Windows";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser: string | null = null;
  let version: string | null = null;
  const rules: [string, RegExp][] = [
    ["Edge", /Edg(?:A|iOS)?\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of rules) {
    if ((m = ua.match(re))) {
      browser = name;
      version = m[1];
      break;
    }
  }
  return { os, osVersion, browser, version };
}

function deviceType(ua: string, uad?: UAData): DeviceInfo["device_type"] {
  // iPadOS reports itself as a Mac; touch points tell them apart.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "tablet";
  if (/Tablet|Android(?!.*Mobile)/.test(ua)) return "tablet";
  if (uad?.mobile || /Mobi|iPhone|iPod|Android/.test(ua)) return "mobile";
  if (ua) return "desktop";
  return "unknown";
}

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function collectDeviceInfo(id: string): Promise<DeviceInfo> {
  const ua = navigator.userAgent;
  const uad = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  const p = parseUA(ua);
  let os = p.os;
  let osVersion = p.osVersion;
  let browser = p.browser;
  let browserVersion = p.version;

  // Chromium freezes the UA string; its User-Agent Client Hints give the real OS version.
  if (uad?.getHighEntropyValues) {
    try {
      const hi = await uad.getHighEntropyValues(["platformVersion", "fullVersionList"]);
      if (uad.platform) os = uad.platform === "macOS" ? "macOS" : uad.platform;
      if (hi.platformVersion) {
        osVersion = hi.platformVersion;
        if (os === "Windows") {
          const major = Number(hi.platformVersion.split(".")[0]);
          osVersion = major >= 13 ? "11" : major > 0 ? "10" : hi.platformVersion;
        }
      }
      const real = hi.fullVersionList?.find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand));
      if (real) {
        browser = real.brand.replace("Google ", "").replace("Microsoft ", "");
        browserVersion = real.version;
      }
    } catch {
      /* hints refused */
    }
  }

  const dpr = window.devicePixelRatio || 1;
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; type?: string; downlink?: number } }).connection;
  let connection: string | null = null;
  if (conn) {
    const parts = [conn.type && conn.type !== "unknown" ? (conn.type === "wifi" ? "WLAN" : conn.type === "cellular" ? "Mobilfunk" : conn.type) : null, conn.effectiveType?.toUpperCase()];
    connection = parts.filter(Boolean).join(" · ") || null;
  }
  let battery_level: number | null = null;
  let battery_charging: boolean | null = null;
  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }).getBattery;
  if (getBattery) {
    try {
      const b = await getBattery.call(navigator);
      battery_level = Math.round(b.level * 100);
      battery_charging = b.charging;
    } catch {
      /* not allowed */
    }
  }

  const type = deviceType(ua, uad);
  const name = [type === "mobile" ? (os === "iOS" ? "iPhone" : "Handy") : type === "tablet" ? (os === "iPadOS" ? "iPad" : "Tablet") : os === "macOS" ? "Mac" : "Computer", browser]
    .filter(Boolean)
    .join(" · ");

  return {
    id,
    name,
    device_type: type,
    os,
    os_version: osVersion,
    browser,
    browser_version: browserVersion,
    screen: `${Math.round(screen.width)}×${Math.round(screen.height)} @${Math.round(dpr * 100) / 100}x`,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    pwa: isStandalone(),
    app_version: APP_VERSION,
    connection,
    battery_level,
    battery_charging,
  };
}
