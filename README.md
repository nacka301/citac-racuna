# Čitač računa

Web alat: učitaš sliku ili PDF ulaznog računa, a Claude izvuče podatke u urednu tablicu
(dobavljač, kupac, OIB, broj računa, datumi, način plaćanja, osnovica, PDV po stopama, ukupno, IBAN, poziv na broj, JIR, ZKI, stavke).
Original se vidi uz rezultat, pa se točnost provjerava na oko. Što se ne može pročitati ostaje prazno.

Nema prijave, baze, plaćanja, eRačuna ni batch obrade. Pogledaj [PRD.md](PRD.md).

## Pokretanje lokalno

1. Instaliraj ovisnosti:

   ```bash
   npm install
   ```

2. U korijenu projekta napravi file `.env.local` s jednom linijom (ključ s <https://console.anthropic.com/>):

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   Primjer je u `.env.example`. `.env.local` je u `.gitignore` i ne smije se commitati.

3. Pokreni:

   ```bash
   npm run dev
   ```

   Otvori <http://localhost:3000>.

## Deploy na Vercel

1. Postavi projekt na GitHub (`.env.local` se ne šalje) i na <https://vercel.com/new> uvezi repozitorij.
   Framework se prepozna sam (Next.js), ništa ne mijenjaj.
2. **Prije prvog deploya** (ili nakon njega, pa Redeploy): *Project → Settings → Environment Variables* →
   dodaj `ANTHROPIC_API_KEY` s ključem, za okoline Production i Preview. Ne označavaj ništa kao javno
   i ne dodavaj `NEXT_PUBLIC_` prefiks.
3. Deploy. Nakon svake promjene env varijable treba **Redeploy** da bi se primijenila.

Alternativa s CLI-jem: `npx vercel`, pa `npx vercel env add ANTHROPIC_API_KEY`, pa `npx vercel --prod`.

### Prije nego link podijeliš

Alat nema prijavu: tko god ima link, može slati račune, a svaki poziv troši tvoje API kredite.
Za video i prikaz jednom knjigovođi preporučujem:

- uključi *Deployment Protection* na Vercelu (Settings → Deployment Protection) ili link dijeli samo uživo,
- postavi mjesečni limit potrošnje u Anthropic konzoli,
- ključ nakon prikaza ukloni ili rotiraj.

## Kako radi

- `app/page.tsx` + `components/` — jedna stranica (klijent): upload, pregled originala, tablice, CSV, kopiranje.
- `app/api/extract/route.ts` — prima jedan račun (PDF ili do 8 slika, ukupno do 4 MB), provjerava tip iz sadržaja, poziva model.
- `lib/extract.ts` — poziv Anthropic API-ja (samo server, `import "server-only"`). PDF ide kao
  `document` blok, slika kao `image` blok — bez vanjskog OCR-a. Izlaz je strogi JSON kroz alat
  `extract_invoice` (`strict: true`).
- `lib/invoice.ts` — shema polja i upute modelu; nečitljiv iznos ostaje prazan ("" za tekst, `null` za broj; server tekst pretvara u `null`). Identifikator se upisuje i kad je znak nesiguran, a model ga označi u `nesigurna_polja`.
- `lib/prepare-file.ts` — klijent: isječci fotografija i smanjivanje velikih fileova (pdf.js) prije slanja.
- `components/results.tsx` + `components/editable.tsx` — ručni ispravak svake vrijednosti i kvačica za potvrdu.
  Provjere se ponavljaju nad ispravljenim podacima, a CSV i kopiranje uzimaju ispravljene vrijednosti.
- `lib/validate.ts` — provjere nad rezultatom (OIB, IBAN, osnovica + PDV = ukupno, ...).
  Model se ne ispravlja; korisnik dobije žuto upozorenje i sam provjerava račun.

## Ograničenja i napomene

- **Rezolucija fotografija:** API smanjuje slike na 2576 px / 3,75 MP, pa bi sitan tekst na fotografiji računa
  postao nečitljiv. Zato preglednik iz prevelike fotografije pronađe papir i šalje cijelu sliku plus isječke u punoj
  rezoluciji. Jedna fotografija tako troši nekoliko slika.
- **Veliki fileovi:** Vercel funkcije primaju tijelo zahtjeva do ~4,5 MB, pa se sve što šaljemo drži ispod 4 MB.
  Veliki PDF postaje JPEG po stranici (najviše 8 stranica). PDF-ovi do 4 MB šalju se netaknuti, s tekstualnim slojem.
  Iz smanjenog PDF-a model čita samo ono što se vidi na slici.
- Podržano: JPEG, PNG, WebP, GIF i PDF. Ostale slike (npr. HEIC) preglednik pokuša pretvoriti u JPEG; Safari to
  obično uspije, ostali preglednici ne moraju.
- Obrada nije trenutna (model razmišlja prije odgovora); funkcija ima limit od 120 s (`maxDuration` u `route.ts`).
- Model je postavljen u `lib/extract.ts` (`MODEL`). Taj model ne prima prisilni `tool_choice`,
  pa se alat vodi s `tool_choice: auto` + `strict` + uputom u promptu; ako alat nije pozvan, zahtjev se
  jednom ponovi.
- Ništa se ne sprema: file se obradi u memoriji i odbaci, pregled je lokalni blob u pregledniku.
- Iznosi i datumi su prikazani u hrvatskom formatu; CSV je odvojen točkom-zarezom s UTF-8 BOM-om
  (otvara se ispravno u Excelu s hrvatskim postavkama), a „Kopiraj” daje tekst odvojen tabulatorima.

## Sigurnost ključa

`ANTHROPIC_API_KEY` se čita samo u `lib/extract.ts` (`process.env`), koji je označen `server-only`.
Klijentske komponente iz `lib/` uvoze samo tipove. Nema `NEXT_PUBLIC_` varijabli. Production build je
provjeren da u klijentskom bundleu nema ključa ni SDK-a.
