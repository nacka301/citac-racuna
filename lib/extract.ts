import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { EXTRACT_TOOL_NAME, SYSTEM_PROMPT, extractInvoiceTool, type Invoice } from "./invoice";

// Najnoviji Opus (vision + PDF). Napomena: ovaj model odbija prisilni tool_choice
// (any/tool vraćaju 400), pa alat vodimo kroz tool_choice "auto" + strict + uputu u promptu.
export const MODEL = "claude-opus-5-5";

export { MAX_FILE_BYTES, MAX_PAGES } from "./limits";

type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
export type Detected = { kind: "pdf" } | { kind: "image"; mediaType: ImageType };

// Tip određujemo iz sadržaja, ne vjerujemo imenu ni Content-Type zaglavlju.
export function detectFile(buf: Buffer): Detected | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { kind: "pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "image", mediaType: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: "image", mediaType: "image/png" };
  }
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return { kind: "image", mediaType: "image/gif" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return { kind: "image", mediaType: "image/webp" };
  }
  return null;
}

export class ExtractError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function fileBlock(buf: Buffer, detected: Detected): Anthropic.ContentBlockParam {
  const data = buf.toString("base64");
  return detected.kind === "pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: detected.mediaType, data } };
}

// Jedan račun = jedan PDF ili jedna do MAX_PAGES slika (stranice istog računa).
export async function extractInvoice(files: { buf: Buffer; detected: Detected }[]): Promise<Invoice> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractError("Na serveru nije postavljen ANTHROPIC_API_KEY.", 500);
  }
  const client = new Anthropic(); // čita ANTHROPIC_API_KEY iz okoline (samo server)

  const instruction =
    (files.length > 1 ? `Ove ${files.length} slike su stranice istog računa, redom. ` : "") +
    `Izvuci podatke s ovog računa pozivom alata ${EXTRACT_TOOL_NAME}. ` +
    "Što nije jasno čitljivo, vrati null — ne pogađaj.";

  // tool_choice "auto" ne jamči poziv alata, pa provjeravamo i jednom ponovimo.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "high" },
      tools: [extractInvoiceTool],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [...files.map((f) => fileBlock(f.buf, f.detected)), { type: "text", text: instruction }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new ExtractError("Model je odbio obraditi ovaj dokument.", 422);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ExtractError("Račun je preopširan za obradu (odgovor je prekinut).", 422);
    }

    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === EXTRACT_TOOL_NAME,
    );
    if (call) return call.input as Invoice;
  }

  throw new ExtractError("Model nije vratio strukturirane podatke. Pokušaj ponovno.", 502);
}
