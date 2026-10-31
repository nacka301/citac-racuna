// Dijeli se između servera i klijenta — ne smije uvoziti ništa serversko.

// Ukupna veličina zahtjeva. Vercel funkcije primaju tijelo do ~4.5 MB, pa veće
// slike i PDF-ove klijent smanji prije slanja (lib/prepare-file.ts).
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Najviše stranica (slika) jednog računa.
export const MAX_PAGES = 8;
