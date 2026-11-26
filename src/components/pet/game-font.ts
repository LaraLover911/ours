import { Fredoka } from "next/font/google";

/** Rounded, chunky type for Mochi's game screen only (loaded on /pet, not app-wide). */
export const gameFont = Fredoka({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-game" });
