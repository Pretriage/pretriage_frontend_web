"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";

type Props = {
  id: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
};

function normalized(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("es-AR");
}

export function SearchableCombobox({ id, value, options, onChange, disabled, placeholder, required }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = normalized(value);
  const matches = useMemo(() => {
    if (!query) return options.slice(0, 60);
    const startsWith = options.filter((option) => normalized(option).startsWith(query));
    const contains = options.filter((option) => {
      const candidate = normalized(option);
      return !candidate.startsWith(query) && candidate.includes(query);
    });
    return [...startsWith, ...contains].slice(0, 60);
  }, [options, query]);
  const exact = options.some((option) => normalized(option) === query);

  function select(option: string) {
    onChange(option);
    setActiveIndex(0);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && matches[activeIndex]) {
      event.preventDefault();
      select(matches[activeIndex]);
    } else if (event.key === "Tab" && !event.shiftKey && query && !exact && matches[activeIndex]) {
      event.preventDefault();
      select(matches[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="combobox" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <input
        aria-activedescendant={open && matches[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-required={required}
        autoComplete="off"
        disabled={disabled}
        id={id}
        placeholder={placeholder}
        role="combobox"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && !disabled ? (
        <div className="combobox-menu" id={listId} role="listbox">
          {matches.length ? matches.map((option, index) => (
            <button
              aria-selected={index === activeIndex}
              className={`combobox-option ${index === activeIndex ? "combobox-option-active" : ""}`}
              id={`${listId}-option-${index}`}
              key={option}
              role="option"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(option)}
            >{option}</button>
          )) : <div className="combobox-empty">Sin coincidencias</div>}
        </div>
      ) : null}
    </div>
  );
}
