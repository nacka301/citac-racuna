// Dijeli se između servera i klijenta — ne smije uvoziti ništa serversko.

// Ukupna veličina zahtjeva. Vercel funkcije primaju tijelo do ~4.5 MB, pa veće
// slike i PDF-ove klijent smanji prije slanja (lib/prepare-file.ts).
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Najviše slika po računu (stranice PDF-a ili isječci fotografije).
export const MAX_PAGES = 8;

// Veće slike API sam smanjuje prije čitanja (vision docs: 2576 px, 4784 × 28² px).
export const MAX_LONG_EDGE = 2576;
export const MAX_PIXELS = 3_750_000;

// Kako server treba tumačiti više slika jednog računa.
export type UploadMode = "pages" | "tiles";
