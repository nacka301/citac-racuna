"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Invoice } from "@/lib/invoice";
import { PrepareError, prepareFiles } from "@/lib/prepare-file";
import Results from "./results";
import { btnPrimary, btnSecondary, card } from "./ui";

type Result = { data: Invoice };
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: Result }
  | { status: "error"; message: string };

const ACCEPT = "image/*,application/pdf";

const BENEFITS = [
  { title: "Provjera OIB-a i IBAN-a", text: "Kontrolni broj se računa, a sumnjivo se označi za provjeru." },
  { title: "Zbrojevi i PDV po stopama", text: "Osnovica, PDV i ukupno provjeravaju se međusobno." },
  { title: "Fiskalni podaci i stavke", text: "Broj računa, IBR, JIR, ZKI i sve stavke računa." },
  { title: "Spremno za Excel", text: "Preuzmi CSV ili kopiraj podatke u svoju tablicu." },
];

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
      const { files, mode } = await prepareFiles(f);
      if (ctrl.signal.aborted) return;

      const body = new FormData();
      body.append("mode", mode);
      for (const p of files) body.append("file", p);
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
      <div className="grid animate-rise gap-6 motion-reduce:animate-none lg:grid-cols-[1.1fr_1fr] lg:gap-x-16 lg:gap-y-8 lg:py-16">
        <div>
          <h2 className="font-serif text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            Ulazni račun u tablici, bez prepisivanja.
          </h2>
          <p className="mt-3 max-w-xl text-stone-600 sm:mt-4 sm:text-lg">
            Učitaj fotografiju ili PDF. Podaci za knjiženje stižu u uredne tablice, a original ti je stalno pred očima.
          </p>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
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
            className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center shadow-sm transition-colors sm:py-20 ${
              dragging ? "border-brand bg-brand-soft" : "border-stone-300 bg-white"
            }`}
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand">
              <svg aria-hidden viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
            </span>
            <div>
              <p className="font-serif text-xl font-semibold">
                <span className="sm:hidden">Učitaj račun</span>
                <span className="hidden sm:inline">Povuci račun ovdje</span>
              </p>
              <p className="mt-1 text-sm text-stone-500">Fotografija, sken ili PDF</p>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} className={btnPrimary}>
              Odaberi račun
            </button>
          </div>

          {state.status === "error" && <ErrorBox message={state.message} />}
        </div>

        <ul className="grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold">{b.title}</p>
                <p className="mt-0.5 text-sm text-stone-600">{b.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
    );
  }

  // ---- original lijevo, rezultat desno ----
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section aria-label="Original računa" className="min-w-0 lg:sticky lg:top-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="truncate font-serif font-semibold text-stone-800" title={file.name}>
            Original <span className="font-sans text-sm font-normal text-stone-500">· {file.name}</span>
          </h2>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-brand hover:underline">
              Otvori
            </a>
          )}
        </div>
        <div className={`relative ${card}`}>
          {previewUrl &&
            (isPdf ? (
              <iframe src={previewUrl} title="Pregled PDF-a" className="h-[45vh] w-full sm:h-[65vh] lg:h-[80vh]" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Učitani račun" className="max-h-[40vh] w-full object-contain sm:max-h-[65vh] lg:max-h-[80vh]" />
            ))}
          {state.status === "loading" && (
            <div aria-hidden className="absolute inset-x-0 h-[3px] animate-scan bg-emerald-500 shadow-[0_0_18px_6px_rgb(16_185_129/0.45)] motion-reduce:hidden" />
          )}
        </div>
      </section>

      <section aria-label="Izvučeni podaci" className="min-w-0">
        {state.status === "loading" && <Loading />}
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
        {state.status === "done" && <Results data={state.result.data} onReset={reset} />}
      </section>
    </div>
  );
}

function Loading() {
  return (
    <div role="status" className={`${card} animate-rise p-6 motion-reduce:animate-none`}>
      <div className="flex items-center gap-4">
        <div className="size-9 shrink-0 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
        <div>
          <p className="font-serif text-lg font-semibold">Čitam račun…</p>
          <p className="text-sm text-stone-500">Obično traje do minute.</p>
        </div>
      </div>
      <div aria-hidden className="mt-6 space-y-4">
        {["72%", "54%", "88%", "46%", "64%", "80%"].map((width) => (
          <div key={width} className="h-3 animate-pulse rounded-full bg-stone-100" style={{ width }} />
        ))}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 first:mt-0">
      {message}
    </div>
  );
}
