import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Camera, Copy, Download, ImagePlus } from "lucide-react";
import {
  contrastRatio,
  downloadDataUrl,
  linkFromPayload,
  photoIdFromUrl,
  quoteFromUrl,
  renderQrPng,
  shrinkPhoto,
  textQrPayload,
  type Ecc,
} from "./lib/qr";
import { readPhoto, savePhoto } from "./lib/photos";
import { cameraMessage, decodeQrFromBlob, decodeQrFromVideo, type ScanHit } from "./lib/scan";

const SETTINGS = "qriz-settings";
const LEVELS: Array<{ id: Ecc; hint: string }> = [
  { id: "L", hint: "7%" },
  { id: "M", hint: "15%" },
  { id: "Q", hint: "25%" },
  { id: "H", hint: "30%" },
];

type Photo = { id: number; blob: Blob; name: string };

export function App() {
  const [text, setText] = useState("");
  const [fg, setFg] = useState("#111111");
  const [bg, setBg] = useState("#f3f1ec");
  const [size, setSize] = useState(512);
  const [ecc, setEcc] = useState<Ecc>("M");
  const [png, setPng] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoCode, setPhotoCode] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBuilding, setPhotoBuilding] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanHit, setScanHit] = useState<ScanHit | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openView, setOpenView] = useState<null | "preview" | "scan" | "landed">(null);
  const [landedQuote, setLandedQuote] = useState<string | null>(null);
  const [landedImage, setLandedImage] = useState<string | null>(null);
  const [livePhoto, setLivePhoto] = useState<string | null>(null);
  const photoSeq = useRef(1);
  const savedPhoto = useRef<{ photoId: number; code: string } | null>(null);
  const copyTimer = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{ fg: string; bg: string; size: number; ecc: Ecc }>;
        if (saved.fg) setFg(saved.fg);
        if (saved.bg) setBg(saved.bg);
        if (typeof saved.size === "number") setSize(saved.size);
        if (saved.ecc) setEcc(saved.ecc);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS, JSON.stringify({ fg, bg, size, ecc }));
  }, [fg, bg, size, ecc]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const quote = params.get("q");
    const photoId = params.get("p");
    if (quote) {
      setLandedQuote(quote);
      setOpenView("landed");
    }
    if (photoId) {
      void readPhoto(photoId).then((record) => {
        if (!record) return;
        setLandedImage(record.image);
        if (record.caption) setLandedQuote(record.caption);
        setOpenView("landed");
      });
    }
  }, []);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo.blob);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!photo) {
      savedPhoto.current = null;
      setPhotoCode(null);
      setPhotoBuilding(false);
      return;
    }
    let cancel = false;
    const wait = window.setTimeout(() => {
      setPhotoBuilding(true);
      setPhotoError(null);
      const existing = savedPhoto.current?.photoId === photo.id ? savedPhoto.current.code : null;
      const id = existing ? photoIdFromUrl(existing) : null;
      const ready = id ? Promise.resolve(undefined as string | undefined) : shrinkPhoto(photo.blob);
      ready
        .then((image) => savePhoto(image ?? "", text.trim(), id))
        .then((savedId) => {
          if (cancel) return;
          const code = `${window.location.origin}${window.location.pathname}?p=${savedId}`;
          savedPhoto.current = { photoId: photo.id, code };
          setPhotoCode(code);
          setPhotoBuilding(false);
        })
        .catch((error: unknown) => {
          if (cancel) return;
          setPhotoCode(null);
          setPhotoBuilding(false);
          setPhotoError(error instanceof Error ? error.message : "Could not store that photo.");
        });
    }, savedPhoto.current?.photoId === photo.id ? 300 : 0);
    return () => {
      cancel = true;
      window.clearTimeout(wait);
    };
  }, [photo, text]);

  const payload = photo ? (photoCode ?? "") : textQrPayload(text, window.location.href);

  useEffect(() => {
    if (!payload) {
      setPng(null);
      setRenderError(null);
      return;
    }
    try {
      setPng(renderQrPng({ text: payload, foreground: fg, background: bg, size, ecc: photo ? "L" : ecc }));
      setRenderError(null);
    } catch (error) {
      setPng(null);
      setRenderError(error instanceof Error ? error.message : "Could not build that code.");
    }
  }, [payload, fg, bg, size, ecc, photo]);

  const recoveredQuote = scanHit ? quoteFromUrl(scanHit.text) : null;
  const recoveredLink = scanHit && !recoveredQuote ? linkFromPayload(scanHit.text) : null;
  const openedId = scanHit ? photoIdFromUrl(scanHit.text) : null;

  useEffect(() => {
    if (!openedId) {
      setLivePhoto(null);
      return;
    }
    let cancel = false;
    readPhoto(openedId).then((record) => {
      if (!cancel) setLivePhoto(record?.image ?? null);
    });
    return () => {
      cancel = true;
    };
  }, [openedId]);

  function takePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file.");
      return;
    }
    setPhoto({ id: photoSeq.current++, blob: file, name: file.name || "Photo" });
    setPhotoError(null);
  }

  async function readCodeImage(file?: File) {
    if (!file) return;
    setScanBusy(true);
    setScanError(null);
    try {
      const hit = await decodeQrFromBlob(file);
      setScanHit(hit);
      setOpenView("scan");
    } catch (error) {
      setScanHit(null);
      setScanError(error instanceof Error ? error.message : "Could not read that picture.");
    } finally {
      setScanBusy(false);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setScanError("Could not copy.");
    }
  }

  const lowContrast = contrastRatio(fg, bg) < 3;
  let status = "The code appears as you type.";
  if (photo) {
    if (photoBuilding) status = "Building a photo code…";
    else if (photoError) status = photoError;
    else if (renderError) status = renderError;
    else if (png) status = "Ready. Scanning opens the real photo.";
  } else if (text.trim()) {
    status = renderError ?? (png ? "Ready. Scanning opens these words." : "Building the code…");
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <h1 className="wordmark">Qriz</h1>
        <p className="text-muted" style={{ marginTop: 8 }}>
          Type words or upload a photo. The live code updates as you go. Scan it and the words or picture open.
        </p>
      </header>
      <div className="layout">
        <section className="card" aria-label="Words or link">
          <label htmlFor="qr-text">Words or link</label>
          <textarea id="qr-text" className="field" rows={3} value={text} placeholder="https://example.com or any text" spellCheck={false} onChange={(event) => setText(event.target.value)} />
          {photo ? <p className="text-muted">These words open with the photo. Remove the photo to make a words-only code.</p> : null}
        </section>
        <section className="card preview-card" aria-label="Preview">
          <h2>Preview</h2>
          <button type="button" className="well" id="qr-open" disabled={!png} onClick={() => setOpenView("preview")}>
            {png ? <img id="qr-preview" className="qr-img" src={png} alt="QR code preview. Click to open." /> : <p className="text-muted">Your code will show here.</p>}
          </button>
          <p className="text-muted">Click the code to open it.</p>
          <p id="qr-status" className={photoError || renderError ? undefined : "text-muted"}>{status}</p>
          {lowContrast ? <p className="text-muted">Those colors were too close, so this code is black on white.</p> : null}
          <button type="button" id="qr-download" className="btn btn-primary" disabled={!png} onClick={() => png && downloadDataUrl(png, photo ? "qriz-photo.png" : "qriz.png")}>
            <Download size={18} /> Download PNG
          </button>
        </section>
        <section className="card" aria-label="Tools">
          <p>Photo</p>
          {photo && photoUrl ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <img className="thumb" src={photoUrl} alt="" />
              <div>
                <p>{photo.name}</p>
                <p className="text-muted">The real photo opens from this code.</p>
              </div>
            </div>
          ) : (
            <p className="text-muted">Upload a picture. Scanning the code opens that photo on this device.</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <label className="btn btn-ghost">
              <ImagePlus size={18} /> {photo ? "Replace photo" : "Upload a photo"}
              <input id="photo-file" className="sr-only" type="file" accept="image/*" onChange={(event) => { takePhoto(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            {photo ? <button type="button" className="btn btn-ghost" onClick={() => setPhoto(null)}>Remove</button> : null}
          </div>
          {photoError ? <p>{photoError}</p> : null}
          <p style={{ marginTop: 16 }}>Scan</p>
          {scanning ? (
            <CameraPanel onClose={() => setScanning(false)} onScan={(hit) => { setScanHit(hit); setScanning(false); setOpenView("scan"); }} />
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setScanning(true)}><Camera size={18} /> Scan</button>
              <label className="btn btn-ghost">
                <ImagePlus size={18} /> Scan a picture
                <input id="scan-file" className="sr-only" type="file" accept="image/*" onChange={(event) => { void readCodeImage(event.target.files?.[0]); event.target.value = ""; }} />
              </label>
            </div>
          )}
          {scanBusy ? <p className="text-muted">Looking in that picture…</p> : null}
          {scanError ? <p>{scanError}</p> : null}
          {scanHit ? (
            <div style={{ marginTop: 12 }}>
              <h2>Scanned</h2>
              {livePhoto ? <img className="qr-img" src={livePhoto} alt="Photo from the code" /> : recoveredQuote ? <p className="open-quote">{recoveredQuote}</p> : <p className="break">{scanHit.text}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => void copyText(recoveredQuote || scanHit.text)}><Copy size={18} /> {copied ? "Copied" : "Copy"}</button>
                {recoveredLink ? <a className="btn btn-ghost" href={recoveredLink} target="_blank" rel="noreferrer">Open link <ArrowUpRight size={18} /></a> : null}
              </div>
            </div>
          ) : null}
        </section>
        <section className="card" aria-label="Style">
          <fieldset>
            <legend>Colors</legend>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <div className="color-field"><label htmlFor="qr-fg">Foreground</label><input id="qr-fg" type="color" value={fg} onChange={(event) => setFg(event.target.value)} /></div>
              <div className="color-field"><label htmlFor="qr-bg">Background</label><input id="qr-bg" type="color" value={bg} onChange={(event) => setBg(event.target.value)} /></div>
            </div>
          </fieldset>
          <div style={{ marginTop: 16 }}>
            <label htmlFor="qr-size">Size {size}px</label>
            <input id="qr-size" type="range" min={192} max={1024} value={size} onChange={(event) => setSize(Number(event.target.value))} />
          </div>
          <fieldset style={{ marginTop: 16 }}>
            <legend>Error correction</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {LEVELS.map((level) => (
                <label key={level.id} className="ecc">
                  <input className="sr-only" type="radio" name="ecc" value={level.id} checked={ecc === level.id} onChange={() => setEcc(level.id)} />
                  <span className="ecc-id">{level.id}</span>
                  <span className="ecc-hint">{level.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      </div>
      <p className="text-muted" style={{ marginTop: 20 }}>Words stay on this device. A photo is kept in this browser so the code can open the real picture.</p>
      {openView ? (
        <div className="open-sheet" role="dialog" aria-modal="true" aria-label="Opened code">
          {openView === "preview" ? (
            <>
              {photoUrl ? <img className="open-photo" src={photoUrl} alt="Photo in this code" /> : null}
              {text.trim() && !linkFromPayload(text) ? <p className="open-quote">{text.trim()}</p> : null}
              {linkFromPayload(text) && !photo ? <a className="btn btn-primary" href={linkFromPayload(text) ?? undefined} target="_blank" rel="noreferrer">Open link <ArrowUpRight size={18} /></a> : null}
            </>
          ) : openView === "landed" ? (
            <>
              {landedImage ? <img className="open-photo" src={landedImage} alt="Photo from the code" /> : null}
              {landedQuote ? <p className="open-quote">{landedQuote}</p> : null}
            </>
          ) : (
            <>
              {livePhoto ? <img className="open-photo" src={livePhoto} alt="Photo from the code" /> : null}
              {recoveredQuote ? <p className="open-quote">{recoveredQuote}</p> : null}
              {!livePhoto && !recoveredQuote && scanHit && !recoveredLink ? <p className="open-quote">{scanHit.text}</p> : null}
              {recoveredLink && !openedId ? <a className="btn btn-primary" href={recoveredLink} target="_blank" rel="noreferrer">Open link <ArrowUpRight size={18} /></a> : null}
            </>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setOpenView(null)}>Close</button>
        </div>
      ) : null}
    </main>
  );
}

function CameraPanel({ onClose, onScan }: { onClose: () => void; onScan: (hit: ScanHit) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = () => {
          if (videoRef.current) {
            const hit = decodeQrFromVideo(videoRef.current);
            if (hit) { onScan(hit); return; }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (caught) {
        setError(cameraMessage(caught));
      }
    };
    void start();
    return () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onScan]);
  return (
    <div>
      <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 12 }} />
      {error ? <p>{error}</p> : <p className="text-muted">Point the camera at a code.</p>}
      <button type="button" className="btn btn-ghost" onClick={onClose}>Close camera</button>
    </div>
  );
}
