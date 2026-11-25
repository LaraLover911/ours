"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { HeartGlyph } from "@/components/shared/heart";
import { cn } from "@/lib/utils";

/** A little paper envelope with a wax-seal heart. */
export function Envelope({
  color,
  label,
  sealed,
  unread,
  className,
  open = false,
}: {
  color: string;
  label?: React.ReactNode;
  sealed?: boolean;
  unread?: boolean;
  className?: string;
  open?: boolean;
}) {
  return (
    <div className={cn("relative aspect-[1.45] w-full [perspective:900px]", className)}>
      {/* back */}
      <div className="absolute inset-0 rounded-[10px] shadow-[0_18px_40px_-22px_rgb(37_33_38/0.55)]" style={{ background: color }} />
      {/* paper peeking */}
      <motion.div
        className="absolute inset-x-[7%] top-[8%] bottom-[10%] rounded-[6px] bg-[#fffdfb] shadow-sm"
        animate={{ y: open ? "-42%" : "0%" }}
        transition={{ duration: 0.7, delay: open ? 0.35 : 0, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mx-[12%] mt-[14%] grid gap-[6%]">
          {[90, 70, 80].map((w, i) => (
            <span key={i} className="block h-[3px] rounded-full bg-[#ead8de]" style={{ width: `${w}%` }} />
          ))}
        </div>
      </motion.div>
      {/* front pocket */}
      <div
        className="absolute inset-0 rounded-[10px]"
        style={{
          background: `linear-gradient(160deg, color-mix(in oklab, ${color} 92%, white), color-mix(in oklab, ${color} 85%, black))`,
          clipPath: "polygon(0 34%, 50% 70%, 100% 34%, 100% 100%, 0 100%)",
        }}
      />
      {/* flap */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[62%] origin-top [backface-visibility:hidden]"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${color} 80%, black), ${color})`,
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          borderRadius: "10px 10px 0 0",
        }}
        animate={{ rotateX: open ? 180 : 0 }}
        transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
      />
      {/* seal */}
      <motion.div
        className="absolute top-[52%] left-1/2 grid size-[19%] max-w-12 min-w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#7a2a41] text-[#f3dde5] shadow-[inset_0_-2px_4px_rgb(0_0_0/0.3),0_3px_8px_rgb(0_0_0/0.25)]"
        animate={{ scale: open ? 0 : 1, opacity: open ? 0 : 1 }}
        transition={{ duration: 0.25 }}
      >
        {sealed ? <Lock className="size-[45%]" /> : <HeartGlyph className="size-[50%]" />}
      </motion.div>
      {unread ? <span className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-primary ring-2 ring-background" aria-label="ungeöffnet" /> : null}
      {label ? <div className="absolute inset-x-0 bottom-[7%] px-3 text-center">{label}</div> : null}
    </div>
  );
}
