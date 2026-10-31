// Dijeli se između servera i klijenta — ne smije uvoziti ništa serversko.
// Vercel funkcije primaju tijelo zahtjeva do ~4.5 MB.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
