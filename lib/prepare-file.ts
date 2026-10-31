// Samo klijent: priprema račun za slanje. Dvije stvari diktiraju što šaljemo:
// limit veličine zahtjeva (Vercel ~4.5 MB) i rezolucija koju model vidi. Fotografija od
// 12 MP prije čitanja padne na oko 3.7 MP, pa sitan tekst računa postane nečitljiv.
import { MAX_FILE_BYTES, MAX_LONG_EDGE, MAX_PAGES, MAX_PIXELS, type UploadMode } from "./limits";

export class PrepareError extends Error {}

export type Prepared = { files: File[]; mode: UploadMode };
type Rect = { x: number; y: number; w: number; h: number };

const DIRECT_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_TILES = 6;

const totalSize = (files: File[]) => files.reduce((n, f) => n + f.size, 0);
const baseName = (file: File) => file.name.replace(/\.[^.]+$/, "");
const fits = (w: number, h: number) => Math.max(w, h) <= MAX_LONG_EDGE && w * h <= MAX_PIXELS;

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new PrepareError("Ne mogu pretvoriti sliku."))), "image/jpeg", quality),
  );
}

// Isječak slike kao JPEG, smanjen samo koliko treba da stane u maxEdge i rezoluciju modela.
async function encode(bitmap: ImageBitmap, r: Rect, maxEdge: number, quality: number, name: string): Promise<File> {
  const k = Math.min(1, maxEdge / Math.max(r.w, r.h), Math.sqrt(MAX_PIXELS / (r.w * r.h)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(r.w * k);
  canvas.height = Math.round(r.h * k);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return new File([await canvasToJpeg(canvas, quality)], name, { type: "image/jpeg" });
}

// Traži papir na fotografiji: svijetli, neobojeni pikseli (stol i prsti su obojeni).
// Griješi bezopasno jer se cijela fotografija uvijek šalje uz isječke.
function findPaper(bitmap: ImageBitmap): Rect | null {
  const k = 200 / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const brightness = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) brightness[i] = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  const bright = brightness.slice().sort()[Math.floor(w * h * 0.95)];

  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const max = brightness[i];
      const min = Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      if (max >= bright * 0.7 && (max - min) / (max || 1) < 0.25) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < w * h * 0.02) return null;

  // Rubovi po percentilu, da odsjaj negdje na stolu ne proširi okvir.
  const pct = (a: number[], p: number) => a.slice().sort((m, n) => m - n)[Math.floor((a.length - 1) * p)];
  const left = Math.max(0, pct(xs, 0.01) - w * 0.05);
  const right = Math.min(w, pct(xs, 0.99) + w * 0.05);
  const top = Math.max(0, pct(ys, 0.01) - h * 0.05);
  const bottom = Math.min(h, pct(ys, 0.99) + h * 0.05);
  if ((right - left) * (bottom - top) > w * h * 0.8) return null;

  return { x: left / k, y: top / k, w: (right - left) / k, h: (bottom - top) / k };
}

// Podijeli područje po dužoj strani, s preklapanjem da nijedan red teksta ne ostane prerezan.
function tiles(r: Rect): Rect[] {
  const vertical = r.h >= r.w;
  const long = vertical ? r.h : r.w;
  const short = vertical ? r.w : r.h;
  const overlap = long * 0.04;

  let n = 1;
  while (n < MAX_TILES && !fits((long + overlap * (n - 1)) / n, short)) n++;

  const size = (long + overlap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const at = i * (size - overlap);
    return vertical ? { x: r.x, y: r.y + at, w: r.w, h: size } : { x: r.x + at, y: r.y, w: size, h: r.h };
  });
}

async function prepareImage(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (DIRECT_IMAGE.has(file.type) && file.size <= MAX_FILE_BYTES) return { files: [file], mode: "pages" };
    throw new PrepareError("Ne mogu pročitati sliku. Probaj JPEG ili PNG.");
  }

  try {
    const { width, height } = bitmap;
    const whole: Rect = { x: 0, y: 0, w: width, h: height };
    const name = baseName(file);

    if (fits(width, height)) {
      if (DIRECT_IMAGE.has(file.type) && file.size <= MAX_FILE_BYTES) return { files: [file], mode: "pages" };
      for (const quality of [0.9, 0.8, 0.65]) {
        const f = await encode(bitmap, whole, MAX_LONG_EDGE, quality, `${name}.jpg`);
        if (f.size <= MAX_FILE_BYTES) return { files: [f], mode: "pages" };
      }
    }

    // Prevelika fotografija: pregled cijele + isječci papira u punoj rezoluciji.
    const parts = tiles(findPaper(bitmap) ?? whole);
    for (const [edge, quality] of [[MAX_LONG_EDGE, 0.85], [MAX_LONG_EDGE, 0.72], [2000, 0.72], [1600, 0.65]] as const) {
      const out = [await encode(bitmap, whole, 1400, 0.7, `${name}-cijela.jpg`)];
      for (let i = 0; i < parts.length; i++) {
        out.push(await encode(bitmap, parts[i], edge, quality, `${name}-isjecak${i + 1}.jpg`));
      }
      if (totalSize(out) <= MAX_FILE_BYTES) return { files: out, mode: "tiles" };
    }

    const last = await encode(bitmap, whole, 2000, 0.7, `${name}.jpg`);
    if (last.size <= MAX_FILE_BYTES) return { files: [last], mode: "pages" };
  } finally {
    bitmap.close();
  }
  throw new PrepareError("Slika je prevelika i ne mogu je dovoljno smanjiti.");
}

// Veliki PDF (obično sken) -> JPEG po stranici. Računu je ionako bitno ono što se vidi.
async function pdfToImages(file: File): Promise<Prepared> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    throw new PrepareError("Ne mogu otvoriti PDF (oštećen ili zaštićen lozinkom).");
  }
  try {
    if (doc.numPages > MAX_PAGES) {
      throw new PrepareError(`PDF ima ${doc.numPages} stranica, a podržano ih je najviše ${MAX_PAGES}.`);
    }
    for (const [width, quality] of [[1800, 0.85], [1400, 0.8], [1000, 0.75]] as const) {
      const out: File[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, viewport, background: "#fff" }).promise;
        const blob = await canvasToJpeg(canvas, quality);
        out.push(new File([blob], `${baseName(file)}-str${n}.jpg`, { type: "image/jpeg" }));
        page.cleanup();
      }
      if (totalSize(out) <= MAX_FILE_BYTES) return { files: out, mode: "pages" };
    }
  } finally {
    await task.destroy();
  }
  throw new PrepareError("PDF je prevelik i ne mogu ga dovoljno smanjiti.");
}

// Vraća file(ove) spremne za slanje; što model može pročitati kakvo jest, ostaje netaknuto.
export async function prepareFiles(file: File): Promise<Prepared> {
  if (file.type === "application/pdf") {
    return file.size <= MAX_FILE_BYTES ? { files: [file], mode: "pages" } : pdfToImages(file);
  }
  if (file.type.startsWith("image/")) return prepareImage(file);
  throw new PrepareError("Nepodržan format. Dopuštene su slike i PDF.");
}
