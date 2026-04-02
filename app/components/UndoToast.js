"use client";
import { useState, useEffect, useCallback } from "react";

export default function UndoToast({ message, onUndo, duration = 5000, onExpire }) {
  const [visible, setVisible] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= duration) {
          clearInterval(interval);
          setVisible(false);
          onExpire?.();
          return prev;
        }
        return prev + 50;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [duration, onExpire]);

  const handleUndo = useCallback(() => {
    setVisible(false);
    onUndo?.();
  }, [onUndo]);

  if (!visible) return null;

  const progress = Math.max(0, 1 - elapsed / duration);

  return (
    <div className="undo-toast" role="alert" aria-live="assertive">
      <span className="undo-toast-msg">{message}</span>
      <button onClick={handleUndo} className="undo-toast-btn">
        Undo
      </button>
      <div className="undo-toast-bar">
        <div
          className="undo-toast-bar-fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
