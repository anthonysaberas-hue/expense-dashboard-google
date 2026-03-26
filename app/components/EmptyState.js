export default function EmptyState({ icon = "📭", title, message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">{icon}</div>
      {title && <p className="empty-state-title">{title}</p>}
      {message && <p className="empty-state-sub">{message}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
