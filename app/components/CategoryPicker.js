"use client";
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { addCustomCategory } from "../lib/categories";

// Type-to-filter category combobox. Typing "din" suggests "Dining"; the last
// option always adds a new category. Only listed (or newly added) categories
// can be picked — anything else reverts on blur.
export default function CategoryPicker({
  value = "",
  categories = [],
  onSelect,
  onCancel,
  autoFocus = false,
  className = "search-input",
  style,
  ariaLabel = "Category",
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(autoFocus);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const typed = query !== value; // untouched input shows the whole list

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const q = query.trim().toLowerCase();
  const exact = categories.find((c) => c.toLowerCase() === q);

  const options = useMemo(() => {
    let list = categories;
    if (typed && q) {
      const starts = categories.filter((c) => c.toLowerCase().startsWith(q));
      const contains = categories.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
      list = [...starts, ...contains];
    }
    const opts = list.map((c) => ({ label: c, value: c }));
    if (typed && q && !exact) opts.push({ label: `+ Add "${query.trim()}"`, add: query.trim() });
    else opts.push({ label: "+ New category", newPrompt: true });
    return opts;
  }, [categories, typed, q, exact, query]);

  useEffect(() => { setHighlight(0); }, [query]);

  // Fixed positioning so the list isn't clipped by scrolling table wrappers
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const viewH = window.visualViewport?.height || window.innerHeight;
      const below = viewH - r.bottom;
      const maxHeight = Math.min(240, Math.max(below, r.top) - 12);
      setPos({
        left: Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8),
        width: Math.max(r.width, 180),
        maxHeight,
        ...(below >= 160 || below >= r.top ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const choose = (opt) => {
    if (opt.newPrompt) {
      setQuery("");
      inputRef.current?.focus();
      return;
    }
    if (opt.add) addCustomCategory(opt.add);
    const picked = opt.add || opt.value;
    setQuery(picked);
    setOpen(false);
    onSelect?.(picked);
  };

  const handleBlur = () => {
    setOpen(false);
    if (typed && exact) {
      setQuery(exact);
      onSelect?.(exact);
    } else {
      setQuery(value);
      onCancel?.();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!typed) { setOpen(false); onCancel?.(); return; }
      const opt = options[highlight];
      if (opt) choose(opt);
    } else if (e.key === "Escape") {
      setQuery(value);
      setOpen(false);
      onCancel?.();
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        autoCapitalize="words"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
        style={style}
      />
      {open && pos && (
        <ul ref={listRef} role="listbox" className="category-picker-list" style={pos}>
          {options.map((opt, i) => (
            <li
              key={opt.value ?? opt.label}
              role="option"
              aria-selected={i === highlight}
              className={`category-picker-option${i === highlight ? " active" : ""}${opt.value === value ? " current" : ""}${opt.value ? "" : " add"}`}
              // mousedown (not click) so the input doesn't blur first
              onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
              onMouseEnter={() => setHighlight(i)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
