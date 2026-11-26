import {
  BookHeart,
  CalendarHeart,
  Gamepad2,
  Joystick,
  Headphones,
  PawPrint,
  Gift,
  House,
  Images,
  Mail,
  MessageCircleHeart,
  MessageCircleQuestion,
  Music2,
  Clapperboard,
  PhoneCall,
  Settings,
  Wand2,
  Activity,
  Bell,
  MonitorSmartphone,
  ShieldCheck,
  Plug,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "us" | "together" | "words" | "plans" | "you";
export type NavItem = { href: string; label: string; hint: string; icon: LucideIcon; group: NavGroup };

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: "us", label: "us" },
  { id: "together", label: "together" },
  { id: "words", label: "words" },
  { id: "plans", label: "plans" },
  { id: "you", label: "you & privacy" },
];

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", hint: "our little world", icon: House, group: "us" },
  { href: "/chat", label: "Chat", hint: "miss you", icon: MessageCircleHeart, group: "us" },
  { href: "/calls", label: "Calls", hint: "hear your voice", icon: PhoneCall, group: "us" },
  { href: "/clips", label: "Clips", hint: "our little feed", icon: Clapperboard, group: "us" },
  { href: "/memories", label: "Memories", hint: "our story so far", icon: Images, group: "us" },
  { href: "/play", label: "Play", hint: "game night", icon: Joystick, group: "together" },
  { href: "/games", label: "Games", hint: "just for fun", icon: Gamepad2, group: "together" },
  { href: "/pet", label: "Mochi", hint: "our little pet", icon: PawPrint, group: "together" },
  { href: "/listen", label: "Listen", hint: "same song, same second", icon: Headphones, group: "together" },
  { href: "/music", label: "Music", hint: "this song reminds me of you", icon: Music2, group: "together" },
  { href: "/surprises", label: "Surprises", hint: "for you", icon: Gift, group: "together" },
  { href: "/studio", label: "Studio", hint: "secret surprises", icon: Wand2, group: "together" },
  { href: "/letters", label: "Letters", hint: "open when…", icon: Mail, group: "words" },
  { href: "/diary", label: "Diary", hint: "dear us", icon: BookHeart, group: "words" },
  { href: "/questions", label: "Questions", hint: "one a day", icon: MessageCircleQuestion, group: "words" },
  { href: "/dates", label: "Dates", hint: "our next little adventure", icon: CalendarHeart, group: "plans" },
  { href: "/activity", label: "Activity", hint: "little moments", icon: Activity, group: "you" },
  { href: "/devices", label: "Devices", hint: "where we are", icon: MonitorSmartphone, group: "you" },
  { href: "/integrations", label: "Integrations", hint: "connected, carefully", icon: Plug, group: "you" },
  { href: "/notifications", label: "Notifications", hint: "stay close", icon: Bell, group: "you" },
  { href: "/privacy", label: "Privacy", hint: "just us two", icon: ShieldCheck, group: "you" },
  { href: "/settings", label: "Settings", hint: "make it ours", icon: Settings, group: "you" },
];

export const MOBILE_PRIMARY = ["/", "/chat", "/clips", "/memories"];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
