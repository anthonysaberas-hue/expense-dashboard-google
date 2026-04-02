"use client";
import { useState, useRef, useEffect } from "react";

export default function EditableCell({
  value,
  field,
  type = "text",
  onSave,
  disabled = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Sync external value changes
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const handleSave = async () => {
    setEditing(false);
    const newVal = type === "number" ? parseFloat(draft) || 0 : draft;
    if (newVal === value) return;

    setSaving(true);
    try {
      await onSave(field, newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch {
      setDraft(value ?? "");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setDraft(value ?? "");
      setEditing(false);
    } else if (e.key === "Tab") {
      handleSave();
    }
  };

  if (disabled) {
    return <span className="editable-cell-disabled">{value ?? "—"}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="editable-input"
        step={type === "number" ? "0.01" : undefined}
        aria-label={`Edit ${field}`}
      />
    );
  }

  return (
    <span
      className={`editable-cell${saving ? " editable-saving" : ""}${saved ? " editable-saved" : ""}`}
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      aria-label={`${field}: ${value || "empty"}. Click to edit.`}
    >
      {value || <span className="editable-placeholder">Add {field}…</span>}
      {saved && <span className="editable-check" aria-hidden="true">✓</span>}
    </span>
  );
}
