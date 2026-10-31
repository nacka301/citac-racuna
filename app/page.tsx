import InvoiceReader from "@/components/invoice-reader";

export default function Home() {
  return (
    <>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2.5 px-4 py-3 sm:px-6">
          <svg aria-hidden viewBox="0 0 24 24" className="size-8 shrink-0">
            <rect width="24" height="24" rx="6" className="fill-brand" />
            <path d="M6.5 4.5h11v15l-2.75-1.6L12 19.5l-2.75-1.6-2.75 1.6z" fill="#fff" />
            <path d="m9.25 11.25 2 2 3.5-4" fill="none" className="stroke-brand" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="font-serif text-xl font-semibold tracking-tight">Čitač računa</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <InvoiceReader />
      </main>
    </>
  );
}
