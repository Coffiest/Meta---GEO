"use client";

import { useRef, type ReactNode } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { project } from "@/lib/motion";
import { Icon } from "./Icon";

/**
 * 横スワイプでお気に入りに入れる行(Apple Music の一覧と同じ操作。オーナー指示)。
 * 左へ少し引くと右に星のボタンが出て、押すと登録/解除。大きく引けばそのまま登録/解除して戻る。
 * 指に 1:1 で付いて動き、離した速さを投げて行き先を決める(スプリング)。
 */
const ACTION_W = 76;

export function SwipeFavoriteRow({
  favorite,
  onToggle,
  label,
  children,
  className = "",
  style,
}: {
  favorite: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const x = useMotionValue(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const actionOpacity = useTransform(x, [-ACTION_W, -12, 0], [1, 0.4, 0]);
  const settle = (to: number, velocity = 0) => animate(x, to, { type: "spring", bounce: 0, duration: 0.28, velocity });

  return (
    <div ref={rowRef} className={`list-row relative overflow-hidden ${className}`} style={style}>
      <motion.button
        type="button"
        aria-label={label}
        style={{ opacity: actionOpacity }}
        onClick={() => {
          onToggle();
          settle(0);
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-accent text-on-accent"
      >
        <span className="flex w-[76px] flex-col items-center gap-0.5 text-[10px] font-bold">
          <Icon name="star" className="h-5 w-5" filled={!favorite} />
          {label}
        </span>
      </motion.button>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTION_W, right: 0 }}
        dragElastic={{ left: 0.6, right: 0.05 }}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={(_, info) => {
          const width = rowRef.current?.offsetWidth ?? 360;
          const landing = x.get() + project(info.velocity.x);
          if (landing < -width * 0.55) {
            onToggle();
            settle(0, info.velocity.x);
          } else if (landing < -ACTION_W / 2) {
            settle(-ACTION_W, info.velocity.x);
          } else {
            settle(0, info.velocity.x);
          }
        }}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </div>
  );
}
