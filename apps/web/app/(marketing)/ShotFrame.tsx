"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * App screenshot in a browser chrome frame.
 * The image pans slowly inside the frame as the page scrolls past it,
 * and clicking opens the full screenshot in a lightbox.
 */
export default function ShotFrame({
  src,
  alt,
  height = 520,
}: {
  src: string;
  alt: string;
  height?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [open, setOpen] = useState(false);

  // Scroll-linked pan of the image inside the frame.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const frame = frameRef.current;
      const img = imgRef.current;
      if (!frame || !img) return;
      const overflow = img.offsetHeight - frame.clientHeight;
      if (overflow <= 0) {
        img.style.transform = "";
        return;
      }
      const rect = frame.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
      img.style.transform = `translateY(${(-progress * overflow).toFixed(1)}px)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Lightbox: Esc to close, lock page scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[#e3e1d5] bg-white shadow-[0_8px_40px_rgba(61,57,41,0.12)] dark:border-neutral-700 dark:bg-[#30302e]">
        <div className="flex items-center gap-2 border-b border-[#efede3] bg-[#faf9f5] px-4 py-2.5 dark:border-neutral-800 dark:bg-[#262624]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e8b4ab]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e8d5ab]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#b4cdb2]" />
          <span className="ml-3 rounded-md bg-white px-3 py-0.5 text-xs text-[#a39f8d] dark:bg-neutral-800 dark:text-neutral-500">
            casewise.si/app
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Enlarge screenshot: ${alt}`}
          className="group relative block w-full cursor-zoom-in overflow-hidden text-left"
          style={{ maxHeight: height }}
        >
          <div ref={frameRef} className="overflow-hidden" style={{ maxHeight: height }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              className="w-full will-change-transform"
              loading="lazy"
              onLoad={() => window.dispatchEvent(new Event("resize"))}
            />
          </div>
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-[#3d3929]/75 px-3 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
            Click to enlarge
          </span>
        </button>
      </div>

      {open &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 overflow-y-auto bg-[#1a1915]/80 p-4 backdrop-blur-sm md:p-10"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed right-5 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition-colors hover:bg-white/25"
          >
            ×
          </button>
          <div className="mx-auto max-w-5xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="w-full rounded-xl shadow-2xl" />
            <p className="mt-3 pb-6 text-center text-xs text-white/70">{alt}</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
