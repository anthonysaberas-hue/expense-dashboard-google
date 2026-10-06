"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { uploadToDrive, needsConverting } from "../lib/driveupload";

// Id for a new photo row, prefixed like the app's other ids. This is the key the
// server's idempotency check matches on (see app/api/photos/route.js), so it must
// actually be unguessable/unique — crypto.randomUUID(), like photos.js and holdings.js
// already use server- and client-side respectively.
function newPhotoId() {
  return `ph_${crypto.randomUUID()}`;
}

// Name the Drive file after the vendor, the same idea as Workout Vault's
// photoName() — a second photo of the same receipt gets " 2" appended.
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
function photoName(vendor, mime, n) {
  const title = String(vendor || "Expense").trim().replace(/[\\/:*?"<>|]/g, "-") || "Expense";
  const seq = Number(n) > 1 ? ` ${n}` : "";
  return `${title}${seq}.${EXT[mime] || "jpg"}`;
}

// iPhone HEIC (or anything else a browser cannot display) → full-size JPEG.
// Nothing else is resized or cropped.
async function toJpeg(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.95));
  if (!blob) throw new Error("that image could not be converted");
  return blob;
}

const imagesFrom = (list) => [...(list || [])].filter((f) => f && String(f.type).startsWith("image/"));

export default function NotesModal({ expense, writeEnabled = false, onSave, onClose }) {
  const expenseId = expense?.id;
  const vendor = expense?.vendor || expense?.name || "Expense";

  const [notes, setNotes] = useState(expense?.notes || "");
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(null); // { done, total, pct } | null
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState(-1);
  const fileRef = useRef(null);
  const countRef = useRef(0);
  const savedNotesRef = useRef(expense?.notes || "");

  useEffect(() => {
    let live = true;
    if (!expenseId) { setLoaded(true); return; }
    fetch(`/api/photos?expenseId=${encodeURIComponent(expenseId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!live) return;
        const list = Array.isArray(rows) ? rows : [];
        countRef.current = list.length;
        setPhotos(list);
        setLoaded(true);
      })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [expenseId]);

  const saveNotes = useCallback(async () => {
    if (!writeEnabled || !expenseId) return true;
    if (notes === savedNotesRef.current) return true;
    try {
      await onSave?.(expenseId, { notes });
      savedNotesRef.current = notes;
      return true;
    } catch (e) {
      // Surface it rather than swallowing — the textarea keeps the user's text, but
      // handleClose must not unmount the modal on a failed save or that text is lost.
      setErr(`Couldn't save your notes — ${e?.message || "you may be offline"}.`);
      return false;
    }
  }, [writeEnabled, expenseId, notes, onSave]);

  const addFiles = useCallback(async (files) => {
    const images = imagesFrom(files);
    if (!images.length || !expenseId) return;
    // Drop and paste have no UI disabled-state like the `+` tile does; without this,
    // two concurrent calls race on `busy` and on `countRef.current`, and two Drive
    // files can end up with the same generated name.
    if (busy) return;
    setErr("");
    setNote("");
    let converted = 0;

    try {
      const tRes = await fetch("/api/drive/token");
      const t = await tRes.json().catch(() => null);
      if (!tRes.ok) throw new Error((t && t.error) || "Google Drive is not connected");

      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        setBusy({ done: i, total: images.length, pct: 0 });
        let blob = file;
        if (needsConverting(file)) {
          blob = await toJpeg(file);
          converted += 1;
        }
        countRef.current += 1;
        const made = await uploadToDrive(blob, {
          token: t.token,
          folder: t.folder,
          name: photoName(vendor, blob.type || "image/jpeg", countRef.current),
          onProgress: (pct) => setBusy({ done: i, total: images.length, pct }),
        });

        const res = await fetch("/api/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: newPhotoId(), expenseId, driveFileId: made.id, mime: blob.type || "image/jpeg",
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error((j && j.error) || `the app answered ${res.status}`);
        }
        const saved = await res.json();
        setPhotos((p) => [...p, saved]);
      }
      if (converted) {
        setNote(`Converted to JPEG so ${converted === 1 ? "it displays" : "they display"} everywhere — full size, nothing cropped.`);
      }
    } catch (e) {
      setErr(`Couldn't save that photo — ${e.message || "you may be offline"}.`);
    } finally {
      setBusy(null);
    }
  }, [expenseId, vendor, busy]);

  // Paste anywhere in the modal. The guard below is critical here — this modal
  // contains a textarea, and a paste meant for it must never be hijacked.
  useEffect(() => {
    const onPaste = (e) => {
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const files = [...((e.clipboardData && e.clipboardData.items) || [])]
        .filter((it) => it.kind === "file")
        .map((it) => it.getAsFile());
      if (imagesFrom(files).length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const handleClose = async () => {
    const ok = await saveNotes();
    if (!ok) return;
    onClose?.();
  };

  async function removePhoto(photo) {
    if (!photo) return;
    setViewing(-1);
    setPhotos((p) => p.filter((x) => x.ID !== photo.ID));
    try {
      const res = await fetch(`/api/photos/${photo.ID}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
    } catch {
      setErr("Couldn't delete that photo — it may still be there next time you open this.");
    }
  }

  const pct = busy ? Math.round(((busy.done + busy.pct) / busy.total) * 100) : 0;
  const viewingPhoto = viewing >= 0 ? photos[viewing] : null;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={`Notes for ${vendor}`} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2 className="modal-title">Notes — {vendor}</h2>
          <button onClick={handleClose} className="modal-close" aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label className="modal-label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              className="search-input"
              style={{ width: "100%", minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Add notes…"
              disabled={!writeEnabled}
              autoFocus
            />
          </div>

          <div
            className="modal-field"
            onDragOver={(e) => { e.preventDefault(); if (writeEnabled) setDragging(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (writeEnabled) addFiles(e.dataTransfer.files); }}
          >
            <label className="modal-label">Photos</label>
            <div style={{ ...STRIP, ...(dragging ? DRAGGING : null) }}>
              {photos.map((p, i) => (
                <button key={p.ID} type="button" onClick={() => setViewing(i)} style={THUMB}
                  aria-label={`Open photo ${i + 1} of ${photos.length}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photos/${p.ID}`} alt="" loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
              {writeEnabled && (
                <button type="button" onClick={() => fileRef.current && fileRef.current.click()}
                  disabled={!!busy} style={{ ...THUMB, ...ADD, opacity: busy ? 0.65 : 1 }}>
                  {busy ? `${pct}%` : "+"}
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4 }}>
                    {busy ? (busy.total > 1 ? `${busy.done + 1}/${busy.total}` : "saving") : "photo"}
                  </span>
                </button>
              )}
            </div>

            {writeEnabled && (
              <>
                <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
                  {dragging ? "Drop to add" : "Drag photos here, or paste with Ctrl+V"}
                </span>
                <input ref={fileRef} type="file" accept="image/*" multiple
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                  style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
              </>
            )}

            {note && <span role="status" aria-live="polite" style={{ display: "block", fontSize: 11, marginTop: 4 }}>{note}</span>}
            {err && <p className="modal-error" role="status" aria-live="polite">{err}</p>}
            {!loaded && photos.length === 0 && (
              <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Loading photos…</span>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" onClick={handleClose} className="btn-primary">Done</button>
          </div>
        </div>
      </div>

      {viewingPhoto && (
        <div role="presentation" onClick={() => setViewing(-1)} style={VIEWER_BACKDROP}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Photo ${viewing + 1} of ${photos.length}`}
            onClick={(e) => e.stopPropagation()}
            style={VIEWER_PANEL}
          >
            <div style={VIEWER_BAR}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                {photos.length > 1 ? `${viewing + 1} / ${photos.length}` : "Photo"}
              </span>
              <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto" }}>
                {writeEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this photo? It goes to your Google Drive bin, where Drive keeps it for 30 days.")) {
                        removePhoto(viewingPhoto);
                      }
                    }}
                    style={{ ...VIEWER_BTN, color: "#fecaca" }}
                  >
                    Delete
                  </button>
                )}
                <button type="button" onClick={() => setViewing(-1)} aria-label="Close photo" style={VIEWER_BTN}>×</button>
              </span>
            </div>
            <div style={VIEWER_STAGE}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${viewingPhoto.ID}`}
                alt=""
                style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const STRIP = {
  display: "flex", gap: 8, overflowX: "auto", padding: 4, margin: -4,
  WebkitOverflowScrolling: "touch", borderRadius: 12,
};
const DRAGGING = { background: "var(--accent-soft, var(--surface-hover))", outline: "2px dashed var(--accent, var(--border))" };
const THUMB = {
  width: 72, height: 72, flexShrink: 0, padding: 0, borderRadius: 10, overflow: "hidden",
  border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", position: "relative",
};
const ADD = {
  display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: 2, borderStyle: "dashed", color: "var(--text-muted)", fontSize: 15, fontWeight: 800,
};

const VIEWER_BACKDROP = {
  position: "fixed", inset: 0, background: "rgba(2,6,23,0.92)", zIndex: 600,
  display: "flex", flexDirection: "column",
};
const VIEWER_PANEL = { position: "absolute", inset: 0, display: "flex", flexDirection: "column" };
const VIEWER_BAR = { display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", flexShrink: 0 };
const VIEWER_BTN = {
  minHeight: 36, display: "inline-flex", alignItems: "center", padding: "0 12px",
  border: "1px solid rgba(255,255,255,0.28)", borderRadius: 8, background: "transparent",
  color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const VIEWER_STAGE = { flex: 1, minHeight: 0, display: "grid", placeItems: "center", overscrollBehavior: "contain" };
