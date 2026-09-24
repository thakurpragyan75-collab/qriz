# Qriz

Live QR generator and scanner. Type words or upload a photo. The preview updates as you type. Scan the code and the words or picture open.

## Features

- Live preview while you type
- Foreground and background colors
- Size and error-correction (L / M / Q / H)
- PNG download
- Photo upload — scanning opens the real photo
- Text codes open the words on a page (any phone camera that opens links)
- Camera scan and scan-from-picture
- Click the code to preview what opens

## Run

```bash
npm install
npm run dev
```

Then open the local URL Vite prints.

## Build

```bash
npm run build
npm run preview
```

## Notes

- A plain sentence becomes a link on this same site (`?q=...`) so a phone camera opens the words.
- A real `http` / `https` link stays that link.
- Photos are stored in this browser (IndexedDB) so the code can open the real picture. Another phone will not have that photo unless you generate it there too.
- Color contrast that is too low is drawn black on white so the code still scans.

## Stack

Vite, React 19, TypeScript, `qrcode`, `jsQR`.
