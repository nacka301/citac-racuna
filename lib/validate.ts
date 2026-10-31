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

  if (inv.dobavljac_oib !== null && !validOib(inv.dobavljac_oib)) {
    w.push({ polje: "dobavljac_oib", poruka: "OIB nije valjan (kontrolna znamenka se ne slaže) — provjeri na računu." });
  }
  if (inv.iban !== null && !validIban(inv.iban)) {
    w.push({ polje: "iban", poruka: "IBAN nije valjan (kontrolni zbroj se ne slaže) — provjeri na računu." });
  }
  if (inv.osnovica !== null && inv.pdv_iznos !== null && inv.ukupno !== null) {
    if (!close(inv.osnovica + inv.pdv_iznos, inv.ukupno)) {
      w.push({ polje: "ukupno", poruka: "Osnovica + PDV ne daje ukupno — provjeri iznose na računu." });
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

  return w;
}
