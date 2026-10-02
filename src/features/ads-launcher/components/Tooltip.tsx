import { useState } from "react";

export function HelpTip({ text }: { text: string }) {
  const [pinned, setPinned] = useState(false);
  return (
    <span className="relative inline-flex group align-middle">
      <button
        type="button"
        aria-label="More info"
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-300 hover:bg-slate-400 text-white text-[9px] font-bold transition leading-none ml-1"
        onClick={(e) => {
          e.preventDefault();
          setPinned((p) => !p);
        }}
        onBlur={() => setPinned(false)}
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`absolute left-5 top-1/2 -translate-y-1/2 z-30 whitespace-normal w-56 px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-[11px] font-normal leading-relaxed shadow-lg pointer-events-none transition-opacity ${
          pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
