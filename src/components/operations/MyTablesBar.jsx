import { Layers, LayoutGrid, Sparkles, X } from "lucide-react";

export default function MyTablesBar({ summary, mode, onModeChange, onClear, showClear }) {
  if (!summary) {
    return (
      <div className="my-tables-bar my-tables-bar-empty">
        <span><Sparkles size={15} /> No assignment has been posted for you today. Check back with a manager.</span>
      </div>
    );
  }

  return (
    <div className="my-tables-bar">
      <div className="my-tables-summary">
        <div className="my-tables-identity">
          <strong>{summary.employeeName}</strong>
          <span>{summary.position}</span>
        </div>
        <div className="my-tables-area"><Layers size={13} /> {summary.areaLabel}</div>
        <div className="my-tables-stats">
          <div><span>Tables</span><strong>{summary.tableCount}</strong></div>
          <div><span>Seats</span><strong>{summary.totalSeats}</strong></div>
          <div><span>Available</span><strong>{summary.availableCount}</strong></div>
          <div><span>Occupied</span><strong>{summary.occupiedCount}</strong></div>
        </div>
      </div>
      <div className="my-tables-actions">
        <button type="button" className={mode === "mine" ? "active" : ""} onClick={() => onModeChange("mine")}><Sparkles size={14} /> My Tables</button>
        <button type="button" className={mode === "area" ? "active" : ""} onClick={() => onModeChange("area")}><Layers size={14} /> My Area</button>
        <button type="button" className={mode === "full" ? "active" : ""} onClick={() => onModeChange("full")}><LayoutGrid size={14} /> Full Venue</button>
        {showClear && <button type="button" className="my-tables-clear" onClick={onClear}><X size={14} /> Clear Highlight</button>}
      </div>
    </div>
  );
}
