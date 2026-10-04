"use client";

// The "Say something…" box on the Live viewer and broadcast screens.
//
// A real <form> (not an input listening for keydown "Enter"): phone
// keyboards' return/Go/Send key reliably submits a form, but often doesn't
// emit a keydown "Enter" at all (Android keyboards especially) — so on phones
// chat messages were never sent and neither side ever saw them. The send
// arrow appears once there's text, for anyone who taps instead.
export function LiveChatInput({
  value,
  onChange,
  onSend,
  placeholder = "Say something…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder?: string;
}) {
  const hasText = value.trim().length > 0;
  return (
    <form
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasText) onSend();
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 300))}
        placeholder={placeholder}
        enterKeyHint="send"
        autoComplete="off"
        className={`w-full rounded-full border border-white/15 bg-white/10 py-3 pl-5 text-white placeholder:text-white/50 outline-none backdrop-blur-sm ${hasText ? "pr-12" : "pr-5"}`}
      />
      {hasText && (
        <button
          type="submit"
          aria-label="Send message"
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-red text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </form>
  );
}
