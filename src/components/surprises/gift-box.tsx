"use client";

import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export const WRAPS: Record<string, { box: string; ribbon: string; label: string }> = {
  cherry: { box: "#6F293E", ribbon: "#F3DDE5", label: "Cherry" },
  blush: { box: "#F3DDE5", ribbon: "#6F293E", label: "Blush" },
  midnight: { box: "#252126", ribbon: "#DDA9BB", label: "Midnight" },
  gold: { box: "#E9C46A", ribbon: "#6F293E", label: "Gold" },
};

export function GiftBox({ wrap = "cherry", open = false, locked, className }: { wrap?: string; open?: boolean; locked?: boolean; className?: string }) {
  const w = WRAPS[wrap] ?? WRAPS.cherry;
  return (
    <div className={cn("relative aspect-square w-full", className)}>
      {/* box */}
      <div className="absolute inset-x-[12%] top-[38%] bottom-[6%] rounded-[8%] shadow-[0_20px_40px_-20px_rgb(0_0_0/0.5)]" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${w.box} 88%, white), ${w.box})` }}>
        <div className="absolute inset-y-0 left-1/2 w-[14%] -translate-x-1/2" style={{ background: w.ribbon }} />
      </div>
      {/* lid */}
      <motion.div
        className="absolute inset-x-[7%] top-[26%] h-[16%] rounded-[10%] shadow-md"
        style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${w.box} 80%, white), ${w.box})` }}
        animate={open ? { y: "-140%", rotate: -18, x: "-10%", opacity: 0 } : { y: 0, rotate: 0, x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 14 }}
      >
        <div className="absolute inset-y-0 left-1/2 w-[15%] -translate-x-1/2" style={{ background: w.ribbon }} />
        {/* bow */}
        <div className="absolute -top-[95%] left-1/2 flex -translate-x-1/2 gap-[2%]">
          <span className="block size-[clamp(14px,5vw,40px)] -rotate-[30deg] rounded-[60%_40%_60%_40%] border-[3px]" style={{ borderColor: w.ribbon }} />
          <span className="block size-[clamp(14px,5vw,40px)] rotate-[30deg] rounded-[40%_60%_40%_60%] border-[3px]" style={{ borderColor: w.ribbon }} />
        </div>
      </motion.div>
      {locked ? (
        <span className="absolute top-[62%] left-1/2 grid size-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm">
          <Lock className="size-[45%]" />
        </span>
      ) : null}
    </div>
  );
}
