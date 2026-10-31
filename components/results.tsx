"use client";

import { useMemo, useState } from "react";
import type { Invoice, InvoiceItem, VatLine } from "@/lib/invoice";
import { validateInvoice } from "@/lib/validate";
import {
  FIELDS,
  ITEM_COLUMNS,
  VAT_COLUMNS,
  csvFileName,
  fmtDate,
  fmtField,
  fmtItemCell,
  parseDate,
  parseNumber,
  toCsv,
  toTsv,
  type FieldKey,
  type FieldKind,
} from "@/lib/format";
import { EditableValue, Tick } from "./editable";
import { btnPrimary, btnSecondary, card } from "./ui";

type Value = string | number | null;

const GROUPS = [...new Set(FIELDS.map((f) => f.group))];

const parseText = (text: string) => text.trim() || null;
const parserFor = (kind: FieldKind) => (kind === "date" ? parseDate : kind === "text" ? parseText : parseNumber);
const rowClass = (ok: boolean, warned: boolean) =>
  `transition-colors ${ok ? "bg-emerald-50" : warned ? "bg-amber-50" : ""}`;

export default function Results({ data: extracted, onReset }: { data: Invoice; onReset: () => void }) {
  const [data, setData] = useState(extracted);
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  // Provjere se vrte nad ispravljenim podacima; potvrđeno više ne traži pažnju.
  const allWarnings = useMemo(() => validateInvoice(data), [data]);
  const warnings = allWarnings.filter((w) => !confirmed.has(w.polje));
  const warned = new Set(warnings.map((w) => w.polje));

  const rowKeys = [
    ...FIELDS.map((f) => f.key as string),
    ...data.pdv_rekapitulacija.map((_, i) => `pdv[${i + 1}]`),
    ...data.stavke.map((_, i) => `stavke[${i + 1}]`),
  ];
  const done = rowKeys.filter((k) => confirmed.has(k)).length;
  const remaining = rowKeys.filter((k) => !confirmed.has(k) && !warned.has(k));
  const allDone = done === rowKeys.length;

  const toggle = (key: string) =>
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const unconfirm = (...keys: string[]) =>
    setConfirmed((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.delete(k));
      return next;
    });

  const setField = (key: FieldKey, value: Value) => {
    setData((d) => ({ ...d, [key]: value }));
    unconfirm(key);
  };
  const setVat = (index: number, key: keyof VatLine, value: Value) => {
    setData((d) => ({
      ...d,
      pdv_rekapitulacija: d.pdv_rekapitulacija.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    }));
    unconfirm(`pdv[${index + 1}]`);
  };
  const setItem = (index: number, key: keyof InvoiceItem, value: Value) => {
    setData((d) => ({ ...d, stavke: d.stavke.map((s, i) => (i === index ? { ...s, [key]: value } : s)) }));
    unconfirm(`stavke[${index + 1}]`, "stavke");
  };

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

  const issued = [
    data.broj_racuna && `Račun ${data.broj_racuna}`,
    data.datum_izdavanja && fmtDate(data.datum_izdavanja),
  ].filter(Boolean);

  return (
    <div className="animate-rise space-y-5 motion-reduce:animate-none">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rounded-2xl bg-brand-deep px-5 py-5 text-white shadow-sm sm:px-6">
        <div className="min-w-0">
          <p className="text-sm text-emerald-100/75">Dobavljač</p>
          <p className="font-serif text-xl leading-snug font-semibold [overflow-wrap:anywhere]">
            {data.dobavljac_naziv ?? "—"}
          </p>
          {issued.length > 0 && <p className="mt-1 text-sm text-emerald-100/75">{issued.join(" · ")}</p>}
        </div>
        <div>
          <p className="text-sm text-emerald-100/75">Ukupno</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {fmtField(data.ukupno, "money") ?? "—"}
            {data.valuta && <span className="ml-1.5 text-base font-normal text-emerald-100/75">{data.valuta}</span>}
          </p>
        </div>
      </div>

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

      <p className="text-sm text-stone-600">Klikni vrijednost da je ispraviš, a kvačicom potvrdi da je točna.</p>

      {warnings.length > 0 && (
        <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Provjeri ručno ({warnings.length})</p>
          <ul className="mt-2 space-y-2">
            {warnings.map((w) => (
              <li key={`${w.polje}:${w.poruka}`} className="flex items-start justify-between gap-3">
                <span>{w.poruka}</span>
                <Tick checked={false} label={`Potvrdi: ${w.poruka}`} onClick={() => toggle(w.polje)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={card}>
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Izvučena polja</caption>
          <colgroup>
            <col style={{ width: "38%" }} />
            <col />
            <col style={{ width: "3rem" }} />
          </colgroup>
          {GROUPS.map((group) => (
            <tbody key={group} className="divide-y divide-stone-100 [&+tbody]:border-t [&+tbody]:border-stone-200">
              <tr>
                <th colSpan={3} scope="colgroup" className="bg-stone-50 px-4 py-2 text-left font-serif font-semibold text-stone-800">
                  {group}
                </th>
              </tr>
              {FIELDS.filter((f) => f.group === group).map((f) => (
                <tr key={f.key} className={rowClass(confirmed.has(f.key), warned.has(f.key))}>
                  <th
                    scope="row"
                    className={`py-2 pr-1 pl-4 text-left align-top ${f.key === "ukupno" ? "font-semibold text-stone-800" : "font-normal text-stone-500"}`}
                  >
                    {f.label}
                  </th>
                  <td className={`px-1 py-1 align-top ${f.key === "ukupno" ? "font-semibold" : ""}`}>
                    <EditableValue
                      value={data[f.key]}
                      label={f.label}
                      numeric={f.kind === "money" || f.kind === "percent"}
                      format={(v) => fmtField(v, f.kind)}
                      parse={parserFor(f.kind)}
                      onCommit={(v) => setField(f.key, v)}
                    />
                  </td>
                  <td className="py-1.5 pr-3 align-top">
                    <Tick checked={confirmed.has(f.key)} label={`Potvrdi: ${f.label}`} onClick={() => toggle(f.key)} />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {data.pdv_rekapitulacija.length > 0 && (
        <div>
          <h2 className="mb-2 font-serif font-semibold text-stone-800">PDV po stopama</h2>
          <div className={card}>
            <table className="w-full table-fixed text-xs sm:text-sm">
              <colgroup>
                {VAT_COLUMNS.map((c) => (
                  <col key={c.key} />
                ))}
                <col style={{ width: "2.5rem" }} />
              </colgroup>
              <thead className="bg-stone-50 text-right text-xs text-stone-500">
                <tr>
                  {VAT_COLUMNS.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                  <th>
                    <span className="sr-only">Potvrda</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.pdv_rekapitulacija.map((r, i) => {
                  const key = `pdv[${i + 1}]`;
                  return (
                    <tr key={key} className={rowClass(confirmed.has(key), warned.has(key))}>
                      {VAT_COLUMNS.map((c) => (
                        <td key={c.key} className="px-0.5 py-1 align-top">
                          <EditableValue
                            numeric
                            value={r[c.key]}
                            label={`PDV red ${i + 1}: ${c.label}`}
                            format={(v) => fmtField(v, c.kind)}
                            parse={parseNumber}
                            onCommit={(v) => setVat(i, c.key, v)}
                          />
                        </td>
                      ))}
                      <td className="py-1 pr-2 align-top">
                        <Tick checked={confirmed.has(key)} label={`Potvrdi PDV red ${i + 1}`} onClick={() => toggle(key)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-serif font-semibold text-stone-800">
          Stavke <span className="font-sans text-sm font-normal text-stone-500">({data.stavke.length})</span>
        </h2>
        {data.stavke.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
            Stavke nisu pročitane.
          </p>
        ) : (
          <div className={card}>
            <table className="w-full table-fixed text-xs sm:text-sm">
              <colgroup>
                <col className="hidden w-9 sm:table-column" />
                <col />
                <col className="w-14 sm:w-20" />
                <col className="w-[4.25rem] sm:w-24" />
                <col className="w-[4.25rem] sm:w-24" />
                <col style={{ width: "2.5rem" }} />
              </colgroup>
              <thead className="bg-stone-50 text-left text-[11px] text-stone-500 sm:text-xs">
                <tr>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">#</th>
                  {ITEM_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`px-1.5 py-2 font-medium ${c.numeric ? "text-right" : ""}`}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th>
                    <span className="sr-only">Potvrda</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.stavke.map((s, i) => {
                  const key = `stavke[${i + 1}]`;
                  return (
                    <tr key={key} className={rowClass(confirmed.has(key), warned.has(key))}>
                      <td className="hidden px-3 py-2 align-top text-stone-400 sm:table-cell">{i + 1}</td>
                      {ITEM_COLUMNS.map((c) => (
                        <td key={c.key} className="px-0.5 py-1 align-top">
                          <EditableValue
                            value={s[c.key]}
                            label={`Stavka ${i + 1}: ${c.label}`}
                            numeric={c.numeric}
                            format={(v) => fmtItemCell(c.key, v)}
                            parse={c.numeric ? parseNumber : parseText}
                            onCommit={(v) => setItem(i, c.key, v)}
                          />
                        </td>
                      ))}
                      <td className="py-1 pr-2 align-top">
                        <Tick checked={confirmed.has(key)} label={`Potvrdi stavku ${i + 1}`} onClick={() => toggle(key)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        className={`sticky bottom-3 z-10 rounded-2xl border px-4 py-3 text-sm shadow-lg transition-colors ${
          allDone ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-stone-200 bg-white text-stone-700"
        }`}
      >
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p className="font-semibold">{allDone ? "✓ Sve je potvrđeno" : `Potvrđeno ${done} od ${rowKeys.length}`}</p>
          {remaining.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmed((prev) => new Set([...prev, ...remaining]))}
              className={btnSecondary}
              title="Potvrđuje sve redove bez upozorenja; redove s upozorenjem potvrdi sam"
            >
              Potvrdi ostalo
            </button>
          )}
        </div>
        <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
            style={{ width: `${(done / rowKeys.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
