"use client";

// Dark rounded sheet with the mockup's grab handle. Sheets stack: "Add
// balance" opens over "Send a gift" (pass a higher `z`), leaving the gift
// sheet's top edge visible behind it.
export function BottomSheet({ children, onClose, z = "z-50" }: { children: React.ReactNode; onClose: () => void; z?: string }) {
  return (
    <div className={`fixed inset-0 ${z} flex items-end bg-black/50`} onClick={onClose}>
      <div
        className="w-full rounded-t-[28px] border-t border-white/10 bg-[#121214] px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/25" aria-hidden />
        {children}
      </div>
    </div>
  );
}
