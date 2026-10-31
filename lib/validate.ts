import { FIELDS } from "./format";
import type { Invoice } from "./invoice";

// Provjere se izvode na serveru nad onim što je model vratio. Model ništa ne "ispravlja":
// ako se brojevi ne slažu, korisnik dobije upozorenje i sam provjerava račun.

export type Warning = { polje: string; poruka: string };

// ISO 7064, MOD 11,10 (hrvatski OIB)
function validOib(oib: string): boolean {
  if (!/^\d{11}$/.test(oib)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(oib[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  const control = (11 - a) % 10;
  return control === Number(oib[10]);
}

// ISO 13616, MOD 97-10
function validIban(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

const close = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

export function validateInvoice(inv: Invoice): Warning[] {
  const w: Warning[] = [];

  // OIB i IBAN imaju kontrolni zbroj niže, pa za njih oznaka modela ne treba.
  for (const key of inv.nesigurna_polja) {
    if (inv[key] === null || key === "dobavljac_oib" || key === "kupac_oib" || key === "iban") continue;
    const label = FIELDS.find((f) => f.key === key)?.label ?? key;
    w.push({ polje: key, poruka: `${label}: neki znak nije siguran — provjeri na računu.` });
  }

  if (inv.dobavljac_oib !== null && !validOib(inv.dobavljac_oib)) {
    w.push({ polje: "dobavljac_oib", poruka: "OIB dobavljača nije valjan (kontrolna znamenka se ne slaže) — provjeri na računu." });
  }
  if (inv.kupac_oib !== null && !validOib(inv.kupac_oib)) {
    w.push({ polje: "kupac_oib", poruka: "OIB kupca nije valjan (kontrolna znamenka se ne slaže) — provjeri na računu." });
  }
  if (inv.iban !== null && !validIban(inv.iban)) {
    w.push({ polje: "iban", poruka: "IBAN nije valjan (kontrolni zbroj se ne slaže) — provjeri na računu." });
  }
  if (inv.jir !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inv.jir)) {
    w.push({ polje: "jir", poruka: "JIR nema ispravan oblik — provjeri na računu." });
  }
  if (inv.zki !== null && !/^[0-9a-f]{32}$/i.test(inv.zki)) {
    w.push({ polje: "zki", poruka: "ZKI nema ispravan oblik — provjeri na računu." });
  }
  if (inv.osnovica !== null && inv.pdv_iznos !== null && inv.ukupno !== null) {
    if (!close(inv.osnovica + inv.pdv_iznos + (inv.neoporezivo ?? 0), inv.ukupno)) {
      w.push({ polje: "ukupno", poruka: "Osnovica + PDV ne daje ukupno — provjeri iznose na računu." });
    }
  }
  inv.pdv_rekapitulacija.forEach((r, i) => {
    if (r.stopa !== null && r.osnovica !== null && r.pdv !== null && !close((r.osnovica * r.stopa) / 100, r.pdv, 0.05)) {
      w.push({ polje: `pdv[${i + 1}]`, poruka: `PDV po stopi ${r.stopa} %: iznos ne odgovara osnovici — provjeri na računu.` });
    }
  });
  if (inv.pdv_iznos !== null && inv.pdv_rekapitulacija.length > 0 && inv.pdv_rekapitulacija.every((r) => r.pdv !== null)) {
    const sum = inv.pdv_rekapitulacija.reduce((n, r) => n + (r.pdv ?? 0), 0);
    if (!close(sum, inv.pdv_iznos, 0.05)) {
      w.push({ polje: "pdv_iznos", poruka: "Zbroj PDV-a po stopama ne daje ukupni PDV — provjeri na računu." });
    }
  }
  if (inv.osnovica !== null && inv.pdv_stopa !== null && inv.pdv_iznos !== null) {
    if (!close((inv.osnovica * inv.pdv_stopa) / 100, inv.pdv_iznos, 0.05)) {
      w.push({ polje: "pdv_iznos", poruka: "PDV iznos ne odgovara osnovici i stopi — provjeri na računu." });
    }
  }
  if (inv.datum_izdavanja && inv.datum_dospijeca && inv.datum_dospijeca < inv.datum_izdavanja) {
    w.push({ polje: "datum_dospijeca", poruka: "Datum dospijeća je prije datuma izdavanja." });
  }
  inv.stavke.forEach((s, i) => {
    if (s.kolicina !== null && s.jed_cijena !== null && s.iznos !== null && !close(s.kolicina * s.jed_cijena, s.iznos, 0.05)) {
      w.push({ polje: `stavke[${i + 1}]`, poruka: `Stavka ${i + 1}: količina × jed. cijena ne daje iznos (možda popust ili zaokruživanje).` });
    }
  });

  // Stavke su na računu s PDV-om ili bez njega, pa zbroj smije pasti na bilo koji od ova tri iznosa.
  if (inv.ukupno !== null && inv.stavke.length > 0 && inv.stavke.every((s) => s.iznos !== null)) {
    const sum = inv.stavke.reduce((n, s) => n + (s.iznos ?? 0), 0);
    const targets = [inv.ukupno, inv.ukupno - (inv.neoporezivo ?? 0), inv.osnovica];
    if (!targets.some((t) => t !== null && close(sum, t, 0.05))) {
      w.push({ polje: "stavke", poruka: "Zbroj stavki ne odgovara ukupnom iznosu — možda neka stavka nedostaje ili je upisana dvaput." });
    }
  }

  return w;
}
