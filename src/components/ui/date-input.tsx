import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface DateInputProps {
  value: Date | undefined;
  onChange: (date: Date) => void;
  className?: string;
  minYear?: number;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function DateInput({ value, onChange, className, minYear = 2015 }: DateInputProps) {
  const [day,   setDay]   = useState<string>(value ? pad(value.getDate()) : "");
  const [month, setMonth] = useState<string>(value ? pad(value.getMonth() + 1) : "");
  const [year,  setYear]  = useState<string>(value ? String(value.getFullYear()) : "");

  // editingRef: true while the user has focus anywhere inside this component
  const editingRef      = useRef(false);
  // autoAdvancingRef: true for the brief moment we programmatically move focus
  // between fields so that the blur handler on the departing field doesn't
  // mistakenly think the user left the component entirely.
  const autoAdvancingRef = useRef(false);

  const dayRef   = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef  = useRef<HTMLInputElement>(null);

  // Sync only when value changes externally (not due to our own onChange calls)
  useEffect(() => {
    if (editingRef.current) return;
    if (value) {
      setDay(pad(value.getDate()));
      setMonth(pad(value.getMonth() + 1));
      setYear(String(value.getFullYear()));
    } else {
      setDay("");
      setMonth("");
      setYear("");
    }
  }, [value]);

  // Try to fire onChange if all fields form a valid date
  const tryCommit = (d: string, m: string, y: string) => {
    if (d.length < 1 || m.length < 1 || y.length < 4) return;
    const dNum = parseInt(d, 10);
    const mNum = parseInt(m, 10);
    const yNum = parseInt(y, 10);
    if (!dNum || !mNum || !yNum || yNum < 1000) return;
    if (dNum < 1 || dNum > 31 || mNum < 1 || mNum > 12) return;
    const date = new Date(yNum, mNum - 1, dNum);
    if (!isNaN(date.getTime())) {
      onChange(date);
    }
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    editingRef.current = true;
    const val = e.target.value.replace(/\D/g, "").slice(0, 2);
    setDay(val);
    if (val.length === 2) {
      autoAdvancingRef.current = true;
      monthRef.current?.focus();
    }
    tryCommit(val, month, year);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    editingRef.current = true;
    const val = e.target.value.replace(/\D/g, "").slice(0, 2);
    setMonth(val);
    if (val.length === 2) {
      autoAdvancingRef.current = true;
      yearRef.current?.focus();
    }
    tryCommit(day, val, year);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    editingRef.current = true;
    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
    setYear(val);
    tryCommit(day, month, val);
  };

  const handleDayBlur = () => {
    // If we just programmatically moved focus to another field, don't treat
    // this as the user leaving — just clear the flag and do nothing.
    if (autoAdvancingRef.current) {
      autoAdvancingRef.current = false;
      return;
    }
    editingRef.current = false;
    const n = parseInt(day, 10);
    if (day === "") return;
    if (isNaN(n) || n < 1 || n > 31) {
      setDay(value ? pad(value.getDate()) : "");
    } else {
      const padded = pad(n);
      setDay(padded);
      tryCommit(padded, month, year);
    }
  };

  const handleMonthBlur = () => {
    if (autoAdvancingRef.current) {
      autoAdvancingRef.current = false;
      return;
    }
    editingRef.current = false;
    const n = parseInt(month, 10);
    if (month === "") return;
    if (isNaN(n) || n < 1 || n > 12) {
      setMonth(value ? pad(value.getMonth() + 1) : "");
    } else {
      const padded = pad(n);
      setMonth(padded);
      tryCommit(day, padded, year);
    }
  };

  const handleYearBlur = () => {
    editingRef.current = false;
    const n = parseInt(year, 10);
    if (year === "") return;
    if (isNaN(n) || n < 1000) {
      setYear(value ? String(value.getFullYear()) : "");
    } else {
      tryCommit(day, month, year);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>,
    min: number,
    max: number,
    current: string,
    d: string,
    m: string,
    y: string,
  ) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      editingRef.current = true;
      const delta = e.key === "ArrowUp" ? 1 : -1;
      const n = Math.min(max, Math.max(min, (parseInt(current, 10) || min) + delta));
      const padded = pad(n);
      setter(padded);
      // Pass the new value for this field directly into tryCommit
      if (setter === setDay)   tryCommit(padded, m, y);
      if (setter === setMonth) tryCommit(d, padded, y);
      if (setter === setYear)  tryCommit(d, m, padded);
    }
    // Allow Tab/Shift+Tab naturally — browser handles focus
  };

  return (
    <div
      className={cn(
        "flex items-center border border-border rounded-md px-2 py-1 bg-muted text-sm gap-0.5",
        className,
      )}
    >
      {/* DAY */}
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        placeholder="DD"
        value={day}
        onChange={handleDayChange}
        onBlur={handleDayBlur}
        onKeyDown={(e) =>
          handleKeyDown(e, setDay, 1, 31, day, day, month, year)
        }
        className="w-6 bg-transparent text-center outline-none text-foreground placeholder:text-muted-foreground"
      />
      <span className="text-muted-foreground select-none">/</span>

      {/* MONTH */}
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={month}
        onChange={handleMonthChange}
        onBlur={handleMonthBlur}
        onKeyDown={(e) =>
          handleKeyDown(e, setMonth, 1, 12, month, day, month, year)
        }
        className="w-6 bg-transparent text-center outline-none text-foreground placeholder:text-muted-foreground"
      />
      <span className="text-muted-foreground select-none">/</span>

      {/* YEAR */}
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        value={year}
        onChange={handleYearChange}
        onBlur={handleYearBlur}
        onKeyDown={(e) =>
          handleKeyDown(e, setYear, minYear, new Date().getFullYear() + 1, year, day, month, year)
        }
        className="w-9 bg-transparent text-center outline-none text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
}