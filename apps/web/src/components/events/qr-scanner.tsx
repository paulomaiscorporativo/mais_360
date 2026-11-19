"use client";

import { CameraOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Leitor de QR pela câmera — reaproveitável pelo check-in de eventos, pelo
 * balcão de credenciamento e pelo leitor de acesso.
 *
 * Usa o BarcodeDetector nativo (Chrome/Android) e cai para o jsQR onde ele não
 * existe (Safari/iOS). A mesma leitura não dispara de novo por `cooldownMs`.
 * Câmera exige HTTPS (ou localhost).
 */

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

export function QrScanner({
  onScan,
  paused = false,
  cooldownMs = 2500,
  className,
}: {
  onScan: (value: string) => void;
  paused?: boolean;
  cooldownMs?: number;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const last = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const pausedRef = useRef(paused);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let detector: Detector | null = null;
    let jsqr: ((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null =
      null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador não libera a câmera. Use o campo de código ao lado.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        setError("Não conseguimos abrir a câmera. Verifique a permissão do navegador.");
        return;
      }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      if (window.BarcodeDetector) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      else jsqr = (await import("jsqr")).default;
      tick();
    }

    async function tick() {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !pausedRef.current) {
        let value: string | null = null;
        try {
          if (detector) value = (await detector.detect(v))[0]?.rawValue ?? null;
          else if (jsqr) {
            const c = (canvas.current ??= document.createElement("canvas"));
            const w = (c.width = Math.min(640, v.videoWidth));
            const h = (c.height = Math.round((v.videoHeight / v.videoWidth) * w));
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx && w && h) {
              ctx.drawImage(v, 0, 0, w, h);
              value = jsqr(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
            }
          }
        } catch {
          /* quadro ilegível — segue */
        }
        const now = Date.now();
        if (value && (value !== last.current.value || now - last.current.at > cooldownMs)) {
          last.current = { value, at: now };
          navigator.vibrate?.(60);
          onScanRef.current(value);
        }
      }
      raf = window.setTimeout(() => void tick(), 180) as unknown as number;
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cooldownMs]);

  if (error)
    return (
      <div
        className={`bg-surface-sunken text-fg-muted flex flex-col items-center justify-center gap-2 rounded-lg p-8 text-center text-sm ${className ?? ""}`}
      >
        <CameraOff className="size-6" />
        {error}
      </div>
    );

  return (
    <div className={`relative overflow-hidden rounded-lg bg-black ${className ?? ""}`}>
      <video ref={video} playsInline muted className="size-full object-cover" />
      {/* Moldura de mira */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="size-[62%] max-w-72 rounded-xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
      </div>
    </div>
  );
}
