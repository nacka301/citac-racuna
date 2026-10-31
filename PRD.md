# PRD — Čitač računa (demo)

## Cilj
Pokazati u ~2 minute videa da se podaci s ulaznog računa (slika ili PDF) mogu izvući u urednu tablicu bez ručnog prepisivanja. Samo demo za snimanje i prikaz jednom knjigovođi — nije proizvod.

## Korisnik
Knjigovođa koji danas ručno prepisuje podatke s ulaznih računa (dobavljač, OIB, iznosi, PDV, IBAN, poziv na broj, stavke) u knjigovodstveni softver ili Excel.

## Što demo radi
1. Jedna stranica. Korisnik povuče ili odabere jedan račun (slika `image/*` ili `application/pdf`).
2. Server (`/api/extract`) pošalje file Claudeu (slika → image block, PDF → document block, bez vanjskog OCR-a) i kroz **tool use s prisilnim `tool_choice`** dobije strogi JSON.
3. Polja (sva nullable): dobavljac_naziv, dobavljac_oib, broj_racuna, datum_izdavanja, datum_dospijeca, osnovica, pdv_stopa, pdv_iznos, ukupno, valuta, iban, poziv_na_broj, stavke[] (opis, kolicina, jed_cijena, iznos).
4. Prikaz side-by-side: lijevo original (slika / ugrađen PDF), desno tablica polja + posebna tablica stavki — za provjeru na oko.
5. Gumbi „Preuzmi CSV" i „Kopiraj".
6. Uredno prikazane greške: neispravan file, prevelik file, greška API-ja.

**Načelo točnosti:** ako polje nije čitljivo, vrijednost je `null` — model nikad ne izmišlja brojeve. Točnost > popunjenost. U UI-ju se `null` prikazuje kao „—" (jasno različito od 0).

## Što demo NE radi (stroge granice)
- Nema prijave/logina, baze podataka ni korisničkih računa
- Nema plaćanja/pretplate
- Nema slanja eRačuna ni integracije s knjigovodstvenim softverom
- Nema batch obrade — jedan račun po uploadu
- Nema više stranica — samo jedna
- Ništa se ne sprema na serveru (file se obradi u memoriji i odbaci)

## Tehnički okvir
- Next.js (App Router) + TypeScript + Tailwind
- `@anthropic-ai/sdk`, poziv samo sa servera
- Jedina env varijabla: `ANTHROPIC_API_KEY` (nikad na klijentu, bez `NEXT_PUBLIC_` prefiksa)
- Deploy: Vercel
- Model: najnoviji Claude model s vision + PDF podrškom; točan ID se provjerava u Anthropic dokumentaciji u Fazi 1

## Faze
0. PRD + scaffold ← ovdje
1. Jezgra: `/api/extract`, tool use, shema
2. UI: upload, side-by-side, CSV/kopiraj, greške
3. Polish, README, Vercel deploy, provjera da ključ ne curi na klijent

## Kriterij uspjeha dema
Na 3–4 stvarna računa (različiti dobavljači, jedan PDF i jedna fotografija) polja se podudaraju s originalom, a nečitljiva polja su prazna, ne pogođena.
