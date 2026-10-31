import Anthropic from "@anthropic-ai/sdk";
import { ExtractError, MAX_FILE_BYTES, MAX_PAGES, detectFile, extractInvoice } from "@/lib/extract";
import { validateInvoice } from "@/lib/validate";

export const maxDuration = 60;

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Neispravan zahtjev. Pošalji račun u polju „file“.", 400);
  }

  const entries = form.getAll("file");
  if (entries.length === 0 || !entries.every((e): e is File => e instanceof File)) {
    return fail("Nije priložen file.", 400);
  }
  if (entries.length > MAX_PAGES) return fail(`Najviše ${MAX_PAGES} stranica po računu.`, 400);

  const total = entries.reduce((n, f) => n + f.size, 0);
  if (total === 0) return fail("File je prazan.", 400);
  if (total > MAX_FILE_BYTES) {
    return fail(`File je prevelik (${(total / 1024 / 1024).toFixed(1)} MB). Najviše je 4 MB.`, 413);
  }

  const files = [];
  for (const f of entries) {
    const buf = Buffer.from(await f.arrayBuffer());
    const detected = detectFile(buf);
    if (!detected) return fail("Nepodržan format. Dopuštene su slike (JPEG, PNG, WebP, GIF) i PDF.", 415);
    files.push({ buf, detected });
  }
  if (files.length > 1 && files.some((f) => f.detected.kind === "pdf")) {
    return fail("Pošalji ili jedan PDF ili slike stranica, ne oboje.", 400);
  }

  try {
    const data = await extractInvoice(files);
    return Response.json({ data, warnings: validateInvoice(data) });
  } catch (err) {
    if (err instanceof ExtractError) return fail(err.message, err.status);
    if (err instanceof Anthropic.AuthenticationError) {
      return fail("Neispravan ANTHROPIC_API_KEY na serveru.", 500);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return fail("Previše zahtjeva prema API-ju. Pričekaj malo i pokušaj ponovno.", 429);
    }
    if (err instanceof Anthropic.BadRequestError) {
      // npr. PDF zaštićen lozinkom ili oštećen, preveliki broj stranica
      console.error("Anthropic 400:", err.message);
      return fail("API nije prihvatio dokument (oštećen, zaštićen lozinkom ili preopširan).", 422);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", err.status, err.message);
      return fail("Greška API-ja. Pokušaj ponovno za nekoliko trenutaka.", 502);
    }
    console.error("Unexpected error:", err);
    return fail("Neočekivana greška na serveru.", 500);
  }
}
