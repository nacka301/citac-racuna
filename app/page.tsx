import InvoiceReader from "@/components/invoice-reader";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Čitač računa — demo</h1>
        <p className="mt-1 text-sm text-zinc-600 sm:text-base">
          Učitaj ulazni račun (slika ili PDF) i dobij podatke u tablici. Što se ne može pročitati ostaje prazno.
        </p>
      </header>
      <InvoiceReader />
    </main>
  );
}
