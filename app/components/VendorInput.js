"use client";
import { useState, useMemo, forwardRef } from "react";
import { suggestVendors } from "../lib/vendors";

// Free-text vendor field that suggests vendors you've used before, each with
// its usual category. Anything typed is allowed — new vendors are fine.
const VendorInput = forwardRef(function VendorInput(
  { value, onChange, onPick, onEnter, vendorIndex = [], id, placeholder },
  ref
) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const options = useMemo(() => suggestVendors(vendorIndex, value), [vendorIndex, value]);
  // Hide the list once what's typed is exactly a suggestion
  const visible = open && options.length > 0 && !(options.length === 1 && options[0].name === value);

  const pick = (v) => {
    setOpen(false);
    setHighlight(-1);
    onPick?.(v);
  };

  return (
    <div className="vendor-input">
      <input
        id={id}
        ref={ref}
        type="text"
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        enterKeyHint="next"
        autoCapitalize="words"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && visible) {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, options.length - 1));
          } else if (e.key === "ArrowUp" && visible) {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, -1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (visible && highlight >= 0) pick(options[highlight]);
            else { setOpen(false); onEnter?.(); }
          } else if (e.key === "Escape" && visible) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="search-input"
      />
      {visible && (
        <ul className="vendor-suggest-list" role="listbox">
          {options.map((v, i) => (
            <li
              key={v.key}
              role="option"
              aria-selected={i === highlight}
              className={`vendor-suggest-option${i === highlight ? " active" : ""}`}
              // mousedown (not click) so the input doesn't blur first
              onMouseDown={(e) => { e.preventDefault(); pick(v); }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="vendor-suggest-name">{v.name}</span>
              {v.category && <span className="vendor-suggest-cat">{v.category}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default VendorInput;
