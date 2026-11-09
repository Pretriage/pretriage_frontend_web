"use client";

import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent } from "react";

type Option = { value: string; label: string; disabled?: boolean };
type Props = Omit<ComponentPropsWithRef<"input">, "type" | "role" | "value" | "defaultValue" | "onChange"> & {
  value: string;
  options: readonly (Option | string)[];
  onChange: (value: string) => void;
  allowCustomValue?: boolean;
};

function normalized(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("es-AR");
}

export function SearchableCombobox({
  id,
  name,
  ref,
  value,
  options,
  onChange,
  allowCustomValue = false,
  disabled,
  required,
  className,
  onBlur,
  onFocus,
  onClick,
  onKeyDown,
  ...inputProps
}: Props) {
  const generatedId = useId();
  const listId = generatedId + "-options";
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => inputRef.current!, []);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const items = useMemo(() => options.map((option) => typeof option === "string"
    ? { value: option, label: option, disabled: false }
    : option), [options]);
  const query = normalized(search ?? "");
  const selectedLabel = items.find((item) => item.value === value)?.label ?? value;
  const matches = useMemo(() => {
    if (!query) return items.slice(0, 60);
    const prefix: Option[] = [];
    const contains: Option[] = [];
    for (const item of items) {
      const label = normalized(item.label);
      if (label.startsWith(query)) prefix.push(item);
      else if (label.includes(query)) contains.push(item);
    }
    return [...prefix, ...contains].slice(0, 60);
  }, [items, query]);
  const expanded = open && !disabled;
  const selectable = matches.flatMap((item, index) => item.disabled ? [] : [index]);
  const activeIndex = highlight ?? (search !== null ? selectable[0] ?? -1 : -1);
  const activeOption = matches[activeIndex]?.disabled ? undefined : matches[activeIndex];

  useEffect(() => {
    if (!expanded || !activeOption) return;
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, activeOption, expanded]);

  function close() {
    setOpen(false);
    setSearch(null);
    setHighlight(null);
  }

  function select(option: Option) {
    inputRef.current?.setCustomValidity("");
    if (option.value !== value) onChange(option.value);
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const position = selectable.indexOf(activeIndex);
      const next = position < 0
        ? (direction === 1 ? 0 : selectable.length - 1)
        : Math.max(0, Math.min(position + direction, selectable.length - 1));
      setHighlight(selectable[next] ?? null);
    } else if (event.key === "Enter" && expanded && (activeOption || search !== null)) {
      event.preventDefault();
      if (activeOption) select(activeOption);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab" && !event.shiftKey && expanded && allowCustomValue && query && activeOption) {
      const exact = items.some((item) => normalized(item.label) === query);
      if (!exact) select(activeOption);
    }
  }

  return (
    <div className="combobox">
      <input
        {...inputProps}
        ref={inputRef}
        aria-activedescendant={expanded && activeOption ? listId + "-option-" + activeIndex : undefined}
        aria-autocomplete="list"
        aria-controls={expanded ? listId : undefined}
        aria-expanded={expanded}
        aria-required={inputProps["aria-required"] ?? required}
        autoComplete={inputProps.autoComplete ?? "off"}
        className={["combobox-input", className].filter(Boolean).join(" ")}
        disabled={disabled}
        id={id ?? generatedId}
        required={required}
        role="combobox"
        type="text"
        value={expanded ? search ?? selectedLabel : selectedLabel}
        onChange={(event) => {
          const text = event.target.value;
          event.currentTarget.setCustomValidity("");
          setSearch(text);
          setHighlight(null);
          setOpen(true);
          if (allowCustomValue || !text) onChange(text);
        }}
        onBlur={(event) => {
          if (search !== null && query) {
            const exact = items.find((item) => !item.disabled && normalized(item.label) === query);
            if (exact) select(exact);
            else close();
          } else {
            close();
          }
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setOpen(true);
          onFocus?.(event);
        }}
        onClick={(event) => {
          setOpen(true);
          onClick?.(event);
        }}
        onKeyDown={handleKeyDown}
      />
      <svg className="combobox-chevron" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      </svg>
      {name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null}
      {expanded ? (
        <div className="combobox-menu" id={listId} role="listbox" ref={listRef} aria-label="Opciones">
          {matches.length ? matches.map((option, index) => (
            <button
              aria-selected={index === activeIndex}
              aria-disabled={option.disabled || undefined}
              className={index === activeIndex ? "combobox-option combobox-option-active" : "combobox-option"}
              data-highlighted={index === activeIndex || undefined}
              disabled={option.disabled}
              id={listId + "-option-" + index}
              key={option.value}
              role="option"
              tabIndex={-1}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => select(option)}
            >{option.label}</button>
          )) : <div className="combobox-empty" role="option" aria-disabled="true" aria-selected="false">Sin coincidencias</div>}
        </div>
      ) : null}
    </div>
  );
}
