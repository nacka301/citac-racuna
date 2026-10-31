import type { Invoice, InvoiceItem, VatLine } from "./invoice";

export type FieldKind = "text" | "date" | "money" | "percent";
export type FieldKey = Exclude<keyof Invoice, "stavke" | "pdv_rekapitulacija">;

export const FIELDS: { key: FieldKey; label: string; kind: FieldKind }[] = [
  { key: "dobavljac_naziv", label: "Dobavljač", kind: "text" },
  { key: "dobavljac_oib", label: "OIB dobavljača", kind: "text" },
  { key: "kupac_naziv", label: "Kupac", kind: "text" },
  { key: "kupac_oib", label: "OIB kupca", kind: "text" },
  { key: "broj_racuna", label: "Broj računa", kind: "text" },
  { key: "datum_izdavanja", label: "Datum izdavanja", kind: "date" },
  { key: "datum_dospijeca", label: "Datum dospijeća", kind: "date" },
  { key: "nacin_placanja", label: "Način plaćanja", kind: "text" },
  { key: "osnovica", label: "Osnovica (bez PDV-a)", kind: "money" },
  { key: "pdv_stopa", label: "PDV stopa", kind: "percent" },
  { key: "pdv_iznos", label: "PDV iznos", kind: "money" },
  { key: "neoporezivo", label: "Neoporezivo (npr. povratna naknada)", kind: "money" },
  { key: "ukupno", label: "Ukupno", kind: "money" },
  { key: "valuta", label: "Valuta", kind: "text" },
  { key: "iban", label: "IBAN", kind: "text" },
  { key: "poziv_na_broj", label: "Poziv na broj", kind: "text" },
  { key: "jir", label: "JIR", kind: "text" },
  { key: "zki", label: "ZKI", kind: "text" },
];

export const ITEM_COLUMNS: { key: keyof InvoiceItem; label: string; numeric: boolean }[] = [
  { key: "opis", label: "Opis", numeric: false },
  { key: "kolicina", label: "Količina", numeric: true },
  { key: "jed_cijena", label: "Jed. cijena", numeric: true },
  { key: "iznos", label: "Iznos", numeric: true },
];

export const VAT_COLUMNS: { key: keyof VatLine; label: string; kind: FieldKind }[] = [
  { key: "stopa", label: "Stopa", kind: "percent" },
  { key: "osnovica", label: "Osnovica", kind: "money" },
  { key: "pdv", label: "PDV", kind: "money" },
  { key: "ukupno", label: "Ukupno", kind: "money" },
];

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("hr-HR", { minimumFractionDigits: min, maximumFractionDigits: max });
const money = nf(2, 2);
const precise = nf(2, 4);
const qty = nf(0, 4);

export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}.` : iso;
}

// Prikaz u tablici (hr-HR: 1.234,56). null -> null, UI sam prikazuje „—“.
export function fmtField(value: string | number | null, kind: FieldKind): string | null {
  if (value === null) return null;
  if (kind === "date") return fmtDate(String(value));
  if (kind === "money") return typeof value === "number" ? money.format(value) : String(value);
  if (kind === "percent") return typeof value === "number" ? `${qty.format(value)} %` : String(value);
  return String(value);
}

export function fmtItemCell(key: keyof InvoiceItem, value: string | number | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (key === "kolicina") return qty.format(value);
  if (key === "jed_cijena") return precise.format(value);
  return money.format(value);
}

// ---- CSV / kopiranje ----

// Za izvoz: brojevi s decimalnim zarezom bez separatora tisućica (Excel s hrvatskim postavkama).
function plain(value: string | number | null, kind: FieldKind): string {
  if (value === null) return "";
  if (kind === "date") return fmtDate(String(value));
  if (typeof value === "number") return (kind === "money" ? value.toFixed(2) : String(value)).replace(".", ",");
  return String(value);
}

function rows(inv: Invoice): string[][] {
  const out: string[][] = [["Polje", "Vrijednost"]];
  for (const f of FIELDS) out.push([f.label, plain(inv[f.key], f.kind)]);
  if (inv.pdv_rekapitulacija.length > 0) {
    out.push([]);
    out.push(["PDV po stopama"]);
    out.push(VAT_COLUMNS.map((c) => c.label));
    for (const r of inv.pdv_rekapitulacija) out.push(VAT_COLUMNS.map((c) => plain(r[c.key], c.kind)));
  }
  out.push([]);
  out.push(["Stavke"]);
  out.push(["#", ...ITEM_COLUMNS.map((c) => c.label)]);
  inv.stavke.forEach((s, i) => {
    out.push([String(i + 1), ...ITEM_COLUMNS.map((c) => plain(s[c.key], "text"))]);
  });
  return out;
}

// Tekst iz računa je nepouzdan: ćelija koja počinje s = + - @ Excel bi pokušao izvršiti kao formulu.
// Brojevi (npr. -12,50) ostaju netaknuti.
function safeCell(v: string): string {
  return /^[=+@\t\r]/.test(v) || (/^-/.test(v) && !/^-[\d.,]+$/.test(v)) ? `'${v}` : v;
}

const csvCell = (v: string) => {
  const s = safeCell(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Točka-zarez + BOM: otvara se ispravno u Excelu s hrvatskim regionalnim postavkama.
export function toCsv(inv: Invoice): string {
  return "﻿" + rows(inv).map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

// Tab-separirano: lijepi se izravno u Excel / Google Sheets.
export function toTsv(inv: Invoice): string {
  return rows(inv)
    .map((r) => r.map((v) => safeCell(v).replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

export function csvFileName(inv: Invoice): string {
  const base = (inv.broj_racuna ?? "racun").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "racun";
  return `${base}.csv`;
}
