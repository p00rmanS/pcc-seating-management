import { Activity, Clock3 } from "lucide-react";

function formatTime(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function describeEvent(event) {
  const actor = event.changedByName || event.changedByRole || "Employee";
  const label = event.label || event.entityId || "Item";
  const action = event.toStatus === "occupied" ? "marked occupied" : "marked available";
  return `${actor} ${action} ${label}`;
}

export default function ActivityPanel({ activity, venueName }) {
  return (
    <div className="workspace-tool-content operation-panel">
      <div>
        <h2 className="operation-heading"><Activity size={15} /> Live activity</h2>
        <p>Latest status changes for {venueName}. New events appear automatically.</p>
      </div>

      <div className="activity-list" aria-live="polite">
        {activity.length === 0 ? (
          <div className="operation-empty-state">
            <Clock3 size={22} />
            <span>No table or area status changes have been recorded yet.</span>
          </div>
        ) : (
          activity.map((event) => (
            <article className="activity-item" key={event.id}>
              <span className={`activity-status-dot ${event.toStatus === "occupied" ? "occupied" : "available"}`} />
              <div>
                <strong>{describeEvent(event)}</strong>
                <span>{event.entityType === "area" ? "Venue area" : "Table"} · {formatTime(event.changedAtClient || event.changedAt)}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
