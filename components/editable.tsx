"use client";

import { useState } from "react";

type Value = string | number | null;

const base =
  "block w-full min-w-0 rounded-md bg-transparent px-1.5 py-1 outline-none transition-colors placeholder:text-stone-300 " +
  "hover:bg-stone-100 focus:bg-white focus:ring-2 focus:ring-brand";

// Izgleda kao običan tekst dok ga ne klikneš. Vrijednost se sprema pri izlasku iz polja ili na Enter.
export function EditableValue({
  value,
  label,
  format,
  parse,
  onCommit,
  numeric = false,
}: {
  value: Value;
  label: string;
  format: (v: Value) => string | null;
  parse: (text: string) => Value | undefined;
  onCommit: (v: Value) => void;
  numeric?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? format(value) ?? "";
  const invalid = draft !== null && parse(draft) === undefined;

  const commit = () => {
    if (draft === null) return;
    const parsed = parse(draft);
    if (parsed === undefined) return; // ostaje crveno dok se ne ispravi
    if (parsed !== value) onCommit(parsed);
    setDraft(null);
  };

  const props = {
    value: text,
    "aria-label": label,
    "aria-invalid": invalid,
    placeholder: "—",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        setDraft(null);
      }
    },
  };
  const state = invalid ? " bg-red-50 ring-2 ring-red-400 focus:ring-red-500" : "";

  // Tekst se lomi u više redova (JIR, ZKI, dugi opisi); brojevi ostaju u jednom retku.
  return numeric ? (
    <input {...props} type="text" className={`${base} text-right font-mono tabular-nums${state}`} />
  ) : (
    <textarea {...props} rows={1} className={`${base} resize-none overflow-hidden [field-sizing:content] [overflow-wrap:anywhere]${state}`} />
  );
}

export function Tick({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      aria-label={label}
      title={checked ? "Potvrđeno" : "Označi kao točno"}
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        checked
          ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
          : "border-stone-300 bg-white text-stone-300 hover:border-emerald-500 hover:text-emerald-600"
      }`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3">
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
      </svg>
    </button>
  );
}
