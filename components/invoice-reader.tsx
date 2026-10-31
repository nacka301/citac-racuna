"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Invoice } from "@/lib/invoice";
import type { Warning } from "@/lib/validate";
import { PrepareError, prepareFiles } from "@/lib/prepare-file";
import Results from "./results";
import { btnPrimary, btnSecondary } from "./ui";

type Result = { data: Invoice; warnings: Warning[] };
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: Result }
  | { status: "error"; message: string };

const ACCEPT = "image/*,application/pdf";

export default function InvoiceReader() {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pregled je blob URL lokalnog filea; file ne ostaje nigdje spremljen.
  const urlRef = useRef<string | null>(null);
  const showPreview = useCallback((f: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = f ? URL.createObjectURL(f) : null;
    setPreview(f && urlRef.current ? { file: f, url: urlRef.current } : null);
  }, []);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    showPreview(null);
    setState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }, [showPreview]);

  const process = useCallback(async (f: File) => {
    abortRef.current?.abort();

    if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
      showPreview(null);
      setState({ status: "error", message: "Nepodržan format. Dopuštene su slike i PDF." });
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    showPreview(f);
    setState({ status: "loading" });

    try {
      // Velike slike i PDF-ovi se smanje u pregledniku da stanu u limit zahtjeva.
      const parts = await prepareFiles(f);
      if (ctrl.signal.aborted) return;

      const body = new FormData();
      for (const p of parts) body.append("file", p);
      const res = await fetch("/api/extract", { method: "POST", body, signal: ctrl.signal });

      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        // odgovor nije JSON (npr. platforma odbila prevelik zahtjev)
      }

      if (!res.ok) {
        const msg =
          json && typeof json === "object" && "error" in json && typeof json.error === "string"
            ? json.error
            : res.status === 413
              ? "File je prevelik za slanje."
              : `Greška servera (${res.status}).`;
        setState({ status: "error", message: msg });
        return;
      }
      setState({ status: "done", result: json as Result });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof PrepareError) {
        setState({ status: "error", message: err.message });
        return;
      }
      setState({ status: "error", message: "Nema veze s poslužiteljem. Provjeri internet i pokušaj ponovno." });
    }
  }, [showPreview]);

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void process(f);
  };

  const file = preview?.file ?? null;
  const previewUrl = preview?.url ?? null;
  const isPdf = file?.type === "application/pdf";

  // ---- početni zaslon / greška bez filea: dropzona ----
  if (!file) {
    return (
      <div className="mx-auto max-w-2xl">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-white px-6 py-14 text-center transition-colors sm:py-20 ${
            dragging ? "border-blue-500 bg-blue-50" : "border-zinc-300"
          }`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-10 w-10 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          <div>
            <p className="text-lg font-medium">Povuci račun ovdje</p>
            <p className="mt-1 text-sm text-zinc-500">slika ili PDF, jedan račun</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Odaberi file
          </button>
        </div>

        {state.status === "error" && <ErrorBox message={state.message} />}

        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
    );
  }

  // ---- original lijevo, rezultat desno ----
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section aria-label="Original računa" className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="truncate text-sm font-medium text-zinc-600" title={file.name}>
            Original · {file.name}
          </h2>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="shrink-0 text-sm text-blue-700 hover:underline">
              Otvori
            </a>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {previewUrl &&
            (isPdf ? (
              <iframe src={previewUrl} title="Pregled PDF-a" className="h-[45vh] w-full sm:h-[65vh] lg:h-[80vh]" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Učitani račun" className="max-h-[40vh] w-full object-contain sm:max-h-[65vh] lg:max-h-[80vh]" />
            ))}
        </div>
      </section>

      <section aria-label="Izvučeni podaci" className="min-w-0">
        {state.status === "loading" && <Spinner />}
        {state.status === "error" && (
          <>
            <ErrorBox message={state.message} />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => file && void process(file)} className={btnPrimary}>
                Pokušaj ponovno
              </button>
              <button type="button" onClick={reset} className={btnSecondary}>
                Drugi račun
              </button>
            </div>
          </>
        )}
        {state.status === "done" && <Results data={state.result.data} warnings={state.result.warnings} onReset={reset} />}
      </section>
    </div>
  );
}

function Spinner() {
  return (
    <div role="status" className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 bg-white px-6 py-16 text-center">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
      <div>
        <p className="font-medium">Čitam račun…</p>
        <p className="mt-1 text-sm text-zinc-500">Obično traje do pola minute.</p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 first:mt-0">
      {message}
    </div>
  );
}
