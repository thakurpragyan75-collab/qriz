import { create } from "qrcode";

export type Ecc = "L" | "M" | "Q" | "H";

const QUIET = 4;

export function contrastRatio(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const raw = hex.replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    const n = Number.parseInt(full, 16);
    if (!Number.isFinite(n) || full.length !== 6) return 0;
    const channel = (value: number) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  };
  const a = lum(foreground);
  const b = lum(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

export async function shrinkPhoto(blob: Blob): Promise<string> {
  const image = await blobToImage(blob);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare that photo.");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

export function renderQrPng(options: {
  text: string;
  foreground: string;
  background: string;
  size: number;
  ecc: Ecc;
}): string {
  const weak = contrastRatio(options.foreground, options.background) < 3;
  const foreground = weak ? "#111111" : options.foreground;
  const background = weak ? "#ffffff" : options.background;
  const symbol = create(options.text, { errorCorrectionLevel: options.ecc });
  const count = symbol.modules.size;
  const cells = count + QUIET * 2;
  const scale = Math.max(8, Math.floor(options.size / cells));
  const px = cells * scale;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw that code.");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = foreground;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (symbol.modules.get(row, col)) {
        ctx.fillRect((col + QUIET) * scale, (row + QUIET) * scale, scale, scale);
      }
    }
  }
  return canvas.toDataURL("image/png");
}

export function textQrPayload(text: string, href: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.toString();
    }
  } catch {
    /* words, not a link */
  }
  const base = href.split("#")[0].split("?")[0];
  return `${base}?q=${encodeURIComponent(trimmed)}`;
}

export function quoteFromUrl(value: string): string | null {
  try {
    const url = new URL(value.trim(), "https://qriz.local");
    const query = url.searchParams.get("q")?.trim();
    if (query) return query;
    if (url.hash.startsWith("#q=")) return decodeURIComponent(url.hash.slice(3)).trim() || null;
  } catch {
    return null;
  }
  return null;
}

export function photoIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value.trim(), "https://qriz.local");
    const id = url.searchParams.get("p")?.trim();
    if (id && /^[a-z2-9]{8}$/.test(id)) return id;
  } catch {
    return null;
  }
  return null;
}

export function linkFromPayload(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}
