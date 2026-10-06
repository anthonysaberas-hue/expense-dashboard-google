"use client";
import { useState } from "react";
import NotesModal from "./NotesModal";

// Renders the Notes column: the note text (or a placeholder), plus a 📎 count
// badge when photos exist. Opens NotesModal on click, same keyboard pattern as
// EditableCell (role="button", tabIndex, Enter to open).
export default function NotesCell({ expense, photoCount = 0, writeEnabled = false, onSave, onPhotosChanged }) {
  const [open, setOpen] = useState(false);
  const notes = expense?.notes;

  return (
    <>
      <span
        className="editable-cell"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
        aria-label={`Notes: ${notes || "empty"}${photoCount ? `, ${photoCount} photos` : ""}. Click to open.`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {notes || <span className="editable-placeholder">Add notes…</span>}
        </span>
        {photoCount > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
            📎{photoCount}
          </span>
        )}
      </span>

      {open && (
        <NotesModal
          expense={expense}
          writeEnabled={writeEnabled}
          onSave={onSave}
          onClose={() => { setOpen(false); onPhotosChanged?.(); }}
        />
      )}
    </>
  );
}
