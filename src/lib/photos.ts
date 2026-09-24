const DB = "qriz";
const STORE = "photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function newId(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

export async function savePhoto(image: string, caption: string, existing?: string | null): Promise<string> {
  const db = await openDb();
  const id = existing && /^[a-z2-9]{8}$/.test(existing) ? existing : newId();
  const previous = existing ? await readPhoto(id) : null;
  const record = { image: image || previous?.image || "", caption };
  if (!record.image) throw new Error("That photo could not be stored.");
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return id;
}

export async function readPhoto(id: string): Promise<{ image: string; caption: string } | null> {
  if (!/^[a-z2-9]{8}$/.test(id)) return null;
  const db = await openDb();
  const record = await new Promise<{ image: string; caption: string } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record ?? null;
}
