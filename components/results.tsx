"use client";

import { useState } from "react";
import type { Invoice } from "@/lib/invoice";
import type { Warning } from "@/lib/validate";
import { FIELDS, ITEM_COLUMNS, VAT_COLUMNS, csvFileName, fmtField, fmtItemCell, toCsv, toTsv } from "@/lib/format";
import { btnPrimary, btnSecondary } from "./ui";

export default function Results({
  data,
  warnings,
  onReset,
}: {
  data: Invoice;
  warnings: Warning[];
  onReset: () => void;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  const missing = FIELDS.filter((f) => data[f.key] === null).length;
  const byField = new Map<string, string[]>();
  for (const w of warnings) byField.set(w.polje, [...(byField.get(w.polje) ?? []), w.poruka]);

  const download = () => {
    const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(data);
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toTsv(data));
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={download} className={btnPrimary}>
          Preuzmi CSV
        </button>
        <button type="button" onClick={copy} className={btnSecondary}>
          {copied === "ok" ? "Kopirano ✓" : copied === "fail" ? "Kopiranje nije uspjelo" : "Kopiraj"}
        </button>
        <button type="button" onClick={onReset} className={`${btnSecondary} ml-auto`}>
          Novi račun
        </button>
      </div>

      <p className="text-sm text-zinc-600">
        {missing === 0
          ? "Sva polja su popunjena."
          : `${missing} od ${FIELDS.length} polja je prazno (—): nema ih na računu ili nisu čitljiva.`}{" "}
        Usporedi vrijednosti s originalom.
      </p>

      {warnings.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Provjeri ručno ({warnings.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w.poruka}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Izvučena polja</caption>
          <tbody className="divide-y divide-zinc-100">
            {FIELDS.map((f) => {
              const text = fmtField(data[f.key], f.kind);
              const warn = byField.get(f.key);
              return (
                <tr key={f.key} className={warn ? "bg-amber-50" : undefined}>
                  <th scope="row" className="w-2/5 px-4 py-2.5 text-left align-top font-normal text-zinc-500">
                    {f.label}
                  </th>
                  <td
                    className={`px-4 py-2.5 align-top [overflow-wrap:anywhere] ${
                      f.kind === "money" || f.kind === "percent" ? "font-mono tabular-nums" : ""
                    }`}
                  >
                    <Value text={text} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.pdv_rekapitulacija.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-zinc-600">PDV po stopama</h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-zinc-50 text-right text-xs text-zinc-500">
                <tr>
                  {VAT_COLUMNS.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-medium sm:px-3">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.pdv_rekapitulacija.map((r, i) => {
                  const warn = byField.get(`pdv[${i + 1}]`);
                  return (
                    <tr key={i} className={warn ? "bg-amber-50" : undefined} title={warn?.join(" ")}>
                      {VAT_COLUMNS.map((c) => (
                        <td key={c.key} className="px-2 py-2 text-right font-mono tabular-nums sm:px-3">
                          <Value text={fmtField(r[c.key], c.kind)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-600">Stavke ({data.stavke.length})</h2>
        {data.stavke.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">
            Stavke nisu pročitane.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">#</th>
                  {ITEM_COLUMNS.map((c) => (
                    <th key={c.key} className={`px-2 py-2 font-medium sm:px-3 ${c.numeric ? "text-right" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.stavke.map((s, i) => {
                  const warn = byField.get(`stavke[${i + 1}]`);
                  return (
                    <tr key={i} className={warn ? "bg-amber-50" : undefined} title={warn?.join(" ")}>
                      <td className="hidden px-3 py-2 align-top text-zinc-400 sm:table-cell">{i + 1}</td>
                      {ITEM_COLUMNS.map((c) => (
                        <td
                          key={c.key}
                          className={`px-2 py-2 align-top sm:px-3 ${c.numeric ? "text-right font-mono tabular-nums" : "break-words"}`}
                        >
                          <Value text={fmtItemCell(c.key, s[c.key])} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Value({ text }: { text: string | null }) {
  return text === null ? (
    <span className="text-zinc-300" title="Nije pročitano" aria-label="nije pročitano">
      —
    </span>
  ) : (
    <>{text}</>
  );
}
