"use client";

import { useEffect, useRef, useState } from "react";

/** Counts a stat up from 0 when scrolled into view. Shows the final value without JS. */
export default function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = value.match(/^([\d,]+(?:\.\d+)?)(.*)$/);
    if (!m) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const raw = m[1];
    const suffix = m[2];
    const target = parseFloat(raw.replace(/,/g, ""));
    const decimals = (raw.split(".")[1] || "").length;
    const useCommas = raw.includes(",");

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const duration = 1200;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          const n = target * eased;
          const s = useCommas
            ? n.toLocaleString("en-US", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              })
            : n.toFixed(decimals);
          setText(s + suffix);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
