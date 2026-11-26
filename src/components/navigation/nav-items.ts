import {
  BookHeart,
  CalendarHeart,
  Gamepad2,
  Joystick,
  PawPrint,
  Gift,
  House,
  Images,
  Mail,
  MessageCircleHeart,
  MessageCircleQuestion,
  Clapperboard,
  PhoneCall,
  Settings,
  Wand2,
  Bell,
  ShieldCheck,
  CalendarDays,
  Globe2,
  LayoutDashboard,
  Gift as GiftIcon,
  Target,
  NotebookPen,
  Mic,
  Camera,
  Sparkles,
  Popcorn,
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
  { href: "/photo", label: "Photo", hint: "one a day", icon: Camera, group: "us" },
  { href: "/voice", label: "Voice", hint: "just your voice", icon: Mic, group: "us" },
  { href: "/play", label: "Play", hint: "game night", icon: Joystick, group: "together" },
  { href: "/games", label: "Games", hint: "just for fun", icon: Gamepad2, group: "together" },
  { href: "/challenge", label: "Challenge", hint: "one little thing", icon: Sparkles, group: "together" },
  { href: "/watchlist", label: "Watchlist", hint: "movie night", icon: Popcorn, group: "together" },
  { href: "/moodboard", label: "Moodboard", hint: "the vibe", icon: LayoutDashboard, group: "together" },
  { href: "/surprises", label: "Surprises", hint: "for you", icon: Gift, group: "together" },
  { href: "/studio", label: "Studio", hint: "secret surprises", icon: Wand2, group: "together" },
  { href: "/letters", label: "Letters", hint: "open when…", icon: Mail, group: "words" },
  { href: "/diary", label: "Diary", hint: "dear us", icon: BookHeart, group: "words" },
  { href: "/notes", label: "Notes", hint: "written together", icon: NotebookPen, group: "words" },
  { href: "/questions", label: "Questions", hint: "one a day", icon: MessageCircleQuestion, group: "words" },
  { href: "/calendar", label: "Calendar", hint: "plans, together", icon: CalendarDays, group: "plans" },
  { href: "/dates", label: "Dates", hint: "our next little adventure", icon: CalendarHeart, group: "plans" },
  { href: "/map", label: "Our world", hint: "where we'll go", icon: Globe2, group: "plans" },
  { href: "/wishlist", label: "Wishlist", hint: "little wishes", icon: GiftIcon, group: "plans" },
  { href: "/goals", label: "Goals", hint: "step by step", icon: Target, group: "plans" },
  { href: "/notifications", label: "Notifications", hint: "stay close", icon: Bell, group: "you" },
  { href: "/privacy", label: "Privacy", hint: "just us two", icon: ShieldCheck, group: "you" },
  { href: "/settings", label: "Settings", hint: "make it ours", icon: Settings, group: "you" },
];

/** Mochi lives in its own spot at the bottom of the navigation, like a game you open. */
export const MOCHI_ITEM: NavItem = { href: "/pet", label: "Mochi", hint: "euer Spiel", icon: PawPrint, group: "together" };

export const MOBILE_PRIMARY = ["/", "/chat", "/clips", "/memories"];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
