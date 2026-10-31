// Samo klijent: smanjuje velike slike i velike PDF-ove da stanu u limit zahtjeva (Vercel ~4.5 MB).
import { MAX_FILE_BYTES, MAX_PAGES } from "./limits";

export class PrepareError extends Error {}

const DIRECT_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const totalSize = (files: File[]) => files.reduce((n, f) => n + f.size, 0);

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new PrepareError("Ne mogu pretvoriti sliku."))), "image/jpeg", quality),
  );
}

// Claude ionako smanjuje slike na ~1568 px, pa 2000 px ne gubi ništa korisno za čitanje.
async function shrinkImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PrepareError("Ne mogu pročitati sliku. Probaj JPEG ili PNG.");
  }
  try {
    for (const [maxSide, quality] of [[2000, 0.85], [1600, 0.8], [1200, 0.75]] as const) {
      const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * k);
      canvas.height = Math.round(bitmap.height * k);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= MAX_FILE_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new PrepareError("Slika je prevelika i ne mogu je dovoljno smanjiti.");
}

// Veliki PDF (obično sken) -> JPEG po stranici. Računu je ionako bitno ono što se vidi.
async function pdfToImages(file: File): Promise<File[]> {
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
        out.push(new File([blob], `${file.name.replace(/\.pdf$/i, "")}-str${n}.jpg`, { type: "image/jpeg" }));
        page.cleanup();
      }
      if (totalSize(out) <= MAX_FILE_BYTES) return out;
    }
  } finally {
    await task.destroy();
  }
  throw new PrepareError("PDF je prevelik i ne mogu ga dovoljno smanjiti.");
}

// Vraća file(ove) spremne za slanje; manje od limita i podržanog formata ostaje netaknuto.
export async function prepareFiles(file: File): Promise<File[]> {
  if (file.type === "application/pdf") {
    return file.size <= MAX_FILE_BYTES ? [file] : pdfToImages(file);
  }
  if (file.type.startsWith("image/")) {
    return DIRECT_IMAGE.has(file.type) && file.size <= MAX_FILE_BYTES ? [file] : [await shrinkImage(file)];
  }
  throw new PrepareError("Nepodržan format. Dopuštene su slike i PDF.");
}
