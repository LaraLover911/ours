import {
  BookHeart,
  CalendarHeart,
  Gamepad2,
  Gift,
  House,
  Images,
  Mail,
  MessageCircleHeart,
  MessageCircleQuestion,
  Music2,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; hint: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", hint: "our little world", icon: House },
  { href: "/chat", label: "Chat", hint: "miss you", icon: MessageCircleHeart },
  { href: "/memories", label: "Memories", hint: "our story so far", icon: Images },
  { href: "/letters", label: "Letters", hint: "open when…", icon: Mail },
  { href: "/diary", label: "Diary", hint: "dear us", icon: BookHeart },
  { href: "/dates", label: "Dates", hint: "our next little adventure", icon: CalendarHeart },
  { href: "/questions", label: "Questions", hint: "one a day", icon: MessageCircleQuestion },
  { href: "/games", label: "Games", hint: "just for fun", icon: Gamepad2 },
  { href: "/music", label: "Music", hint: "this song reminds me of you", icon: Music2 },
  { href: "/surprises", label: "Surprises", hint: "for you", icon: Gift },
  { href: "/settings", label: "Settings", hint: "make it ours", icon: Settings },
];

export const MOBILE_PRIMARY = ["/", "/chat", "/memories", "/letters"];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
