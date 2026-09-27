"use client";

import jsQR from "jsqr";
import { CameraOff, QrCode, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { detectPlatform } from "@/lib/pwa/environment";

/** How often a camera frame is checked for a QR code. */
const SCAN_EVERY_MS = 250;

/**
 * The code inside the clinic's check-in QR. The reception screen encodes a
 * link (`…/check-in?code=…`) so the phone's own camera app works too; a bare
 * code is accepted as well. Anything else isn't the clinic's QR.
 */
export function extractCheckInCode(text: string): string | null {
  const trimmed = text.trim();
  if (/^[0-9a-f]{20}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    if (url.pathname.replace(/\/$/, "").endsWith("/check-in") && code && /^[0-9a-f]{20}$/.test(code)) {
      return code;
    }
  } catch {
    // Not a URL.
  }
  return null;
}

/** Chrome/Android's built-in QR reader; not in the TS DOM lib yet. */
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => NativeBarcodeDetector;

type CameraState = "starting" | "scanning" | "denied" | "unavailable";

/**
 * Opens the rear camera and reads QR codes until it finds the clinic's
 * check-in code. Uses the browser's own QR reader where there is one
 * (Android Chrome) and jsQR elsewhere (iPhone).
 */
export function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [attempt, setAttempt] = useState(0);
  const [notOurs, setNotOurs] = useState(false);
  // The scan loop outlives renders; it always calls the latest handler.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  const retry = useCallback(() => {
    setState("starting");
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    let notOursTimer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (notOursTimer) clearTimeout(notOursTimer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (error) {
        const name = (error as { name?: string }).name;
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setState("scanning");

      const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      const detector = Native ? new Native({ formats: ["qr_code"] }) : null;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      let busy = false;

      const read = async (): Promise<string | null> => {
        if (video.readyState < video.HAVE_ENOUGH_DATA) return null;
        if (detector) {
          try {
            const found = await detector.detect(video);
            return found[0]?.rawValue ?? null;
          } catch {
            // Fall through to jsQR for this frame.
          }
        }
        if (!context) return null;
        // Scale down: faster, and QR codes on a screen are large anyway.
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
      };

      timer = setInterval(() => {
        if (busy || stopped) return;
        busy = true;
        void read()
          .then((text) => {
            if (!text || stopped) return;
            const code = extractCheckInCode(text);
            if (code) {
              navigator.vibrate?.(60);
              stop();
              onCodeRef.current(code);
            } else {
              setNotOurs(true);
              if (notOursTimer) clearTimeout(notOursTimer);
              notOursTimer = setTimeout(() => setNotOurs(false), 2500);
            }
          })
          .finally(() => {
            busy = false;
          });
      }, SCAN_EVERY_MS);
    })();

    return stop;
  }, [attempt]);

  if (state === "denied" || state === "unavailable") {
    return <CameraProblem denied={state === "denied"} onRetry={retry} />;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-neutral-900 shadow-md">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="Camera view"
          className="size-full object-cover"
        />
        <Viewfinder />
        {state === "starting" && (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm font-semibold text-neutral-0">
            Opening the camera…
          </p>
        )}
        {notOurs && (
          <p
            role="status"
            className="absolute inset-x-4 bottom-4 rounded-md bg-neutral-900/80 px-3 py-2 text-center text-sm font-semibold text-neutral-0"
          >
            That&apos;s not the clinic&apos;s check-in QR code.
          </p>
        )}
      </div>
      <p className="max-w-sm text-center text-sm text-foreground-muted">
        Point your camera at the QR code at reception. It scans by itself.
      </p>
    </div>
  );
}

/** Corner brackets over the camera view, so it's clear where the code goes. */
function Viewfinder() {
  const corner = "absolute size-12 border-neutral-0";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-[14%]">
      <span className={`${corner} left-0 top-0 rounded-tl-lg border-l-4 border-t-4`} />
      <span className={`${corner} right-0 top-0 rounded-tr-lg border-r-4 border-t-4`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-lg border-b-4 border-l-4`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-lg border-b-4 border-r-4`} />
    </div>
  );
}

function CameraProblem({ denied, onRetry }: { denied: boolean; onRetry: () => void }) {
  const platform = detectPlatform();
  const howToAllow =
    platform === "ios"
      ? "Open your iPhone's Settings → Safari → Camera and choose Allow, then come back and tap Try again."
      : platform === "android"
        ? "Tap the icon at the left of the address bar → Permissions → Camera → Allow, then tap Try again."
        : "Allow camera access for this site in your browser settings, then tap Try again.";

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface-raised p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-warning/15 text-warning">
        <CameraOff aria-hidden className="size-7" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-bold text-foreground">
          {denied ? "Camera access is off" : "We couldn't open the camera"}
        </p>
        <p className="text-sm text-foreground-muted">
          {denied
            ? `Checking in needs the camera to scan the QR code at reception. ${howToAllow}`
            : "Checking in needs the camera to scan the QR code at reception. Close other apps using the camera and try again."}
        </p>
      </div>
      <Button variant="secondary" className="rounded-full" onClick={onRetry}>
        <RefreshCw aria-hidden className="size-4" />
        Try again
      </Button>
      <p className="flex items-start gap-2 text-left text-sm text-foreground-muted">
        <QrCode aria-hidden className="mt-0.5 size-4 shrink-0" />
        You can also scan the QR code with your phone&apos;s camera app — it opens check-in for you.
      </p>
    </div>
  );
}
