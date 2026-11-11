"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Profile card bio (explicit ask, 2026-11-11): collapsed to two lines so the
// card keeps its shape; "Read more" shows the rest. The button only appears
// when the bio is actually cut off.
export function ProfileBio({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);

  return (
    <div className="mt-1.5">
      <p ref={ref} className={`whitespace-pre-line break-words text-[14px] text-white ${open ? "" : "line-clamp-2"}`}>
        {text}
      </p>
      {(clipped || open) && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-0.5 text-[13px] font-semibold text-white/70 hover:text-white">
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
