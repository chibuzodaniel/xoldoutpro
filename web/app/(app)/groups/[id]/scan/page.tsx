"use client";

import { use, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { apiFetch } from "@/lib/api";
import { BackHeader } from "@/components/ui/BackHeader";
import { FallbackImg } from "@/components/ui/FallbackImg";

type Result =
  | { valid: boolean; state?: string; reason?: string; member?: { displayName: string; handle: string; avatarUrl: string | null }; plan?: string; expiresAt?: string | null; cardCode?: string }
  | { error: string };

// Scan membership cards (v2, design/v2-prototype; admins). Every result comes
// from the server's records, not from what the card shows.
export default function ScanCardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const [cameraSupported, setCameraSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection must run after mount
    setCameraSupported(Boolean(navigator.mediaDevices?.getUserMedia));
    return () => stopRef.current();
  }, []);

  async function verify(raw: string) {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch(`/api/communities/${id}/verify`, { method: "POST", body: JSON.stringify({ code: raw }) });
      const d = await res.json();
      setResult(res.ok ? d : { error: typeof d.error === "string" ? d.error : "Couldn't verify" });
    } catch {
      setResult({ error: "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return stream.getTracks().forEach((t) => t.stop());
      setScanning(true);
      video.srcObject = stream;
      await video.play();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let stopped = false;
      stopRef.current = () => {
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
        setScanning(false);
      };
      const tick = () => {
        if (stopped || !ctx) return;
        if (video.readyState >= 2) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(frame.data, frame.width, frame.height);
          if (found) {
            stopRef.current();
            void verify(found.data);
            return;
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setScanning(false);
      setResult({ error: "Couldn't open the camera. Enter the code instead." });
    }
  }

  const ok = result && "valid" in result && result.valid;

  return (
    <div className="mx-auto max-w-md pb-24">
      <BackHeader title="Scan cards" />
      <div className="flex flex-col gap-4 px-4">
        {/* Kept mounted so the camera can attach as soon as it starts. */}
        <video ref={videoRef} className={`aspect-square w-full rounded-2xl bg-black object-cover ${scanning ? "" : "hidden"}`} muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {cameraSupported &&
          (scanning ? (
            <button type="button" onClick={() => stopRef.current()} className="rounded-full border border-line px-4 py-3.5 font-bold">
              Stop camera
            </button>
          ) : (
            <button type="button" onClick={startCamera} className="rounded-full bg-red px-4 py-3.5 font-bold text-white">
              Scan a card
            </button>
          ))}

        <p className="text-[12px] uppercase tracking-widest text-ink-3">Or enter the membership ID</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code.trim() && verify(code.trim())}
            placeholder="e.g. XOL-ABC2345"
            aria-label="Verification code"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm uppercase outline-none focus:border-red"
          />
          <button type="button" onClick={() => code.trim() && verify(code.trim())} disabled={busy || !code.trim()} className="rounded-xl bg-red px-4 text-sm font-bold text-white disabled:opacity-50">
            Verify
          </button>
        </div>

        {result && (
          <div className={`rounded-2xl border p-5 ${ok ? "border-green/50 bg-green/10" : "border-red/50 bg-red-tint"}`}>
            {"error" in result ? (
              <p className="text-red-soft">{result.error}</p>
            ) : (
              <>
                <p className={`text-[20px] font-extrabold ${ok ? "text-green" : "text-red-soft"}`}>{ok ? "ACTIVE MEMBERSHIP" : "EXPIRED OR INVALID"}</p>
                {result.member ? (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2">
                      <FallbackImg src={result.member.avatarUrl} alt="" className="h-full w-full object-cover" fallback={null} />
                    </span>
                    <span className="text-sm">
                      <span className="block font-bold">{result.member.displayName}</span>
                      <span className="block text-ink-3">
                        {result.plan}
                        {result.state && result.state !== "active" ? ` · ${result.state}` : ""}
                        {result.expiresAt ? ` · until ${new Date(result.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}` : " · no expiry"}
                      </span>
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-ink-3">{result.reason}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
