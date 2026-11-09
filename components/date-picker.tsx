"use client";

import { DayPicker, TZDate } from "@daypicker/react";
import { es } from "@daypicker/react/locale/es";
import "@daypicker/react/style.css";
import { useId, useLayoutEffect, useRef, useState, type Ref } from "react";
import { fechaIsoValida, hoyIso, ZONA_ARGENTINA } from "@/lib/argentina-date";
import styles from "./date-picker.module.css";

type Mode = "date" | "month";

type Props = {
  id?: string;
  name?: string;
  ref?: Ref<HTMLInputElement>;
  mode?: Mode;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
};

function isoValue(value: string, mode: Mode) {
  const isoPattern = mode === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (isoPattern.test(value)) return value;

  const localPattern = mode === "month" ? /^\d{2}\/\d{4}$/ : /^\d{2}\/\d{2}\/\d{4}$/;
  return localPattern.test(value) ? value.split("/").reverse().join("-") : null;
}

function localDraft(value: string, mode: Mode) {
  const digits = value.replace(/\D/g, "");
  const dayOrMonth = digits.slice(0, 2);
  const month = mode === "date" ? digits.slice(2, 4) : "";
  const yearStart = mode === "date" ? 4 : 2;
  const year = digits.slice(yearStart, yearStart + 4);
  return [dayOrMonth, month, year].filter(Boolean).join("/");
}

function calendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return TZDate.tz(ZONA_ARGENTINA, year, month - 1, day);
}

const spanishMonth = new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" });
const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: spanishMonth.format(new Date(Date.UTC(2024, index, 1))),
}));

function MonthPicker({ value, min, onSelect, onClose }: {
  value: string;
  min: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const initial = /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= min ? value : min;
  const [initialYear, initialMonth] = initial.split("-");
  const [minYear, minMonth] = min.split("-");
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const firstMonth = year === minYear ? minMonth : "01";
  const selectedMonth = month < firstMonth ? firstMonth : month;
  const validYear = /^\d{4}$/.test(year) && year >= minYear;
  const select = () => onSelect(`${year}-${selectedMonth}`);

  return (
    <div className={styles.monthPicker}>
      <label className="field">
        <span>Mes</span>
        <select value={selectedMonth} onChange={(event) => setMonth(event.currentTarget.value)}>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value} disabled={option.value < firstMonth}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Año</span>
        <input
          type="number"
          inputMode="numeric"
          min={minYear}
          max="9999"
          value={year}
          onChange={(event) => setYear(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (validYear) select();
          }}
        />
      </label>
      <div className={styles.monthActions}>
        <button className="button button-secondary" type="button" onClick={onClose}>Cerrar</button>
        <button className="button button-primary" type="button" disabled={!validYear} onClick={select}>
          Seleccionar
        </button>
      </div>
    </div>
  );
}

export function DatePicker({
  mode = "date", value, onChange, placeholder, min, max, ...props
}: Props) {
  const pickerId = useId();
  const controlRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const control = controlRef.current;
    const picker = pickerRef.current;
    if (!open || !control || !picker || typeof picker.showPopover !== "function") return;

    const positionPicker = () => {
      if (!picker.matches(":popover-open")) return;
      const anchor = control.getBoundingClientRect();
      const { clientWidth, clientHeight } = document.documentElement;
      const gutter = 8;
      const gap = 4;
      if (anchor.bottom <= 0 || anchor.top >= clientHeight) {
        picker.hidePopover();
        return;
      }

      const below = clientHeight - anchor.bottom - gap - gutter;
      const above = anchor.top - gap - gutter;
      const openAbove = picker.scrollHeight > below && above > below;
      picker.style.maxHeight = `${Math.max(0, openAbove ? above : below)}px`;
      picker.style.top = `${openAbove ? anchor.top - gap - picker.offsetHeight : anchor.bottom + gap}px`;
      picker.style.left = `${Math.max(gutter, Math.min(
        anchor.right - picker.offsetWidth, clientWidth - picker.offsetWidth - gutter,
      ))}px`;
    };

    positionPicker();
    window.addEventListener("resize", positionPicker);
    window.addEventListener("scroll", positionPicker, true);
    return () => {
      window.removeEventListener("resize", positionPicker);
      window.removeEventListener("scroll", positionPicker, true);
    };
  }, [open]);

  const dayPicker = mode === "date";
  const selected = dayPicker && fechaIsoValida(value) ? calendarDate(value) : undefined;
  const earliest = min ?? (selected && value < "1900-01-01" ? value : "1900-01-01");
  const latest = max ?? hoyIso();
  const pickerLabel = dayPicker ? "Elegí una fecha" : "Elegí el mes y el año";

  function closeCalendar() {
    const picker = pickerRef.current;
    if (!picker) return;
    if (typeof picker.hidePopover === "function") picker.hidePopover();
    else picker.close();
    triggerRef.current?.focus();
  }

  function selectDate(date: string) {
    onChange(date);
    closeCalendar();
  }

  return (
    <div className={styles.control} lang="es-AR" ref={controlRef}>
      <input
        {...props}
        className={styles.input}
        type="text"
        inputMode="numeric"
        placeholder={placeholder ?? (dayPicker ? "DD/MM/AAAA" : "MM/AAAA")}
        value={value.split("-").reverse().join("/")}
        onChange={(event) => {
          const draft = localDraft(event.currentTarget.value, mode);
          onChange(isoValue(draft, mode) ?? draft);
        }}
        onPaste={(event) => {
          const pasted = isoValue(event.clipboardData.getData("text/plain").trim(), mode);
          if (!pasted) return;
          event.preventDefault();
          onChange(pasted);
        }}
      />
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={dayPicker ? "Abrir calendario" : "Elegir mes y año"}
        aria-haspopup="dialog"
        aria-controls={pickerId}
        aria-expanded={open}
        popoverTarget={pickerId}
        disabled={props.disabled}
        onClick={() => {
          const picker = pickerRef.current;
          if (!picker || typeof picker.showPopover === "function") return;
          picker.showModal();
          setOpen(true);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4m8-4v4" />
        </svg>
      </button>
      <dialog
        ref={pickerRef}
        id={pickerId}
        className={styles.picker}
        popover="auto"
        aria-label={pickerLabel}
        onToggle={(event) => setOpen(event.newState === "open")}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
      >
        {open ? (
          dayPicker ? (
            <>
              <DayPicker
                className={styles.calendar}
                locale={es}
                lang="es-AR"
                timeZone={ZONA_ARGENTINA}
                mode="single"
                required
                selected={selected}
                defaultMonth={selected ?? calendarDate(latest)}
                captionLayout="dropdown"
                navLayout="after"
                fixedWeeks
                reverseYears
                startMonth={calendarDate(earliest)}
                endMonth={calendarDate(latest)}
                disabled={[
                  { before: calendarDate(earliest) },
                  { after: calendarDate(latest) },
                ]}
                autoFocus
                onSelect={(day) => selectDate(hoyIso(day))}
              />
              <button className={`button button-secondary ${styles.closeDialog}`} type="button" onClick={closeCalendar}>
                Cerrar
              </button>
            </>
          ) : (
            <MonthPicker value={value} min={min ?? hoyIso().slice(0, 7)} onSelect={selectDate} onClose={closeCalendar} />
          )
        ) : null}
      </dialog>
    </div>
  );
}
