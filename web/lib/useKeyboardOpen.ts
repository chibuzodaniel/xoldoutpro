"use client";

import { useEffect, useState } from "react";

// Detects an on-screen keyboard by comparing the visual viewport (which
// shrinks when a mobile keyboard opens, unlike the layout viewport) against
// window.innerHeight. The threshold separates a real keyboard from ordinary
// viewport jitter (address bar show/hide, etc.) — comfortably below a
// keyboard's minimum height on any real device, comfortably above address-bar
// chrome deltas.
const KEYBOARD_HEIGHT_THRESHOLD = 150;

export function useKeyboardOpen() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      setKeyboardOpen(window.innerHeight - vv!.height > KEYBOARD_HEIGHT_THRESHOLD);
    }

    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  return keyboardOpen;
}
