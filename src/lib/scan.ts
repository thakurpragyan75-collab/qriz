import jsQR from "jsqr";

export type ScanHit = { text: string };

function decodeCanvas(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
  return code?.data ?? null;
}

export async function decodeQrFromBlob(blob: Blob): Promise<ScanHit> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that picture."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that picture.");
    ctx.drawImage(image, 0, 0);
    const text = decodeCanvas(canvas);
    if (!text) throw new Error("No QR code was found in that picture.");
    return { text };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function decodeQrFromVideo(video: HTMLVideoElement): ScanHit | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  const text = decodeCanvas(canvas);
  return text ? { text } : null;
}

export function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was blocked. You can still upload a picture.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. You can still upload a picture.";
  }
  return "The camera could not start. You can still upload a picture.";
}
