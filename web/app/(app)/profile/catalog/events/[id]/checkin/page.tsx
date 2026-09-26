"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import jsQR from "jsqr";
import { apiFetch } from "@/lib/api";
import { BackHeader } from "@/components/ui/BackHeader";

type ScanResult = { ok: true; tierName?: string; buyer?: string } | { ok: false; error: string };

export default function EventCheckInPage() {
  const params = useParams<{ id: string }>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraSupported, setCameraSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection can't run during SSR; must happen post-mount
    setCameraSupported(typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  useEffect(() => {
    apiFetch("/api/events")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const match = data?.events?.find((e: { id: string; title: string }) => e.id === params.id);
        if (match) setEventTitle(match.title);
      });
  }, [params.id]);

  async function submitCode(code: string) {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/events/checkin", { method: "POST", body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: data.error ?? "Could not check in" });
      } else {
        setResult({ ok: true, tierName: data.tierName, buyer: data.buyer });
      }
    } catch {
      setResult({ ok: false, error: "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      video.srcObject = stream;
      await video.play();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      // jsQR decodes from raw pixel data via canvas, so it works in every
      // browser with getUserMedia (notably iOS/desktop Safari and Firefox,
      // which never shipped the native BarcodeDetector API) — unlike that
      // API, this is never the only way to check someone in; manual entry
      // below always works too.
      let stopped = false;
      const tick = () => {
        if (stopped || !videoRef.current || !ctx) return;
        if (videoRef.current.readyState < 2) {
          requestAnimationFrame(tick);
          return;
        }
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height);
        if (code) {
          stopped = true;
          stream.getTracks().forEach((t) => t.stop());
          setScanning(false);
          void submitCode(code.data);
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setScanning(false);
      setResult({ ok: false, error: "Could not access the camera" });
    }
  }

  return (
    <div className="pb-6 max-w-sm mx-auto">
      <BackHeader title="Check in tickets" />
      <div className="px-4">
        {eventTitle && <p className="text-xs text-ink-3 -mt-3 mb-6">{eventTitle}</p>}

      {cameraSupported && (
        <div className="mb-6">
          {scanning ? (
            <video ref={videoRef} className="w-full rounded-lg bg-black aspect-square object-cover" muted playsInline />
          ) : (
            <button
              onClick={startCamera}
              className="w-full rounded-lg border border-line px-4 py-3 text-sm font-semibold"
            >
              Scan QR code
            </button>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">Or enter the code manually</p>
      <div className="flex gap-2 mb-4">
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Ticket code"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
        />
        <button
          onClick={() => manualCode.trim() && submitCode(manualCode.trim())}
          disabled={busy || !manualCode.trim()}
          className="rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Check in
        </button>
      </div>

        {result && (
          <div
            className={`rounded-lg border p-4 text-sm ${
              result.ok ? "border-green/40 text-green" : "border-red/40 text-red-soft"
            }`}
          >
            {result.ok ? (
              <>
                Checked in{result.buyer ? ` ${result.buyer}` : ""}
                {result.tierName ? ` · ${result.tierName}` : ""}
              </>
            ) : (
              result.error
            )}
          </div>
        )}
      </div>
    </div>
  );
}
