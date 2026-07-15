import { CalendarDays, ChevronLeft, ChevronRight, Plus, Save, Trash2, UserRoundCheck } from "lucide-react";

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function DailyStaffingPanel({
  venueName,
  date,
  onDateChange,
  assignments,
  onChangeAssignment,
  onSave,
  canManage,
  saveState,
}) {
  const rows = Object.entries(assignments || {}).map(([id, value]) => ({ id, ...value }));

  const addAssignment = () => {
    if (!canManage) return;
    const id = `assignment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onChangeAssignment(id, { assignment: "", displayName: "", active: true });
  };

  const updateRow = (id, patch) => {
    const current = assignments?.[id] || {};
    onChangeAssignment(id, { ...current, ...patch, active: true });
  };

  return (
    <div className="workspace-tool-content staffing-panel staffing-panel-v153">
      <div className="staffing-heading-row">
        <div>
          <h2 className="operation-heading"><CalendarDays size={16} /> Daily Staffing</h2>
          <p>Add today’s assignments and the employee responsible for each one. This list can change every day.</p>
        </div>
        <span className="staffing-venue-badge">{venueName}</span>
      </div>

      <div className="staffing-date-toolbar">
        <button type="button" className="staffing-date-step" onClick={() => onDateChange(shiftDate(date, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
        <label className="staffing-date-field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            onClick={(event) => event.currentTarget.showPicker?.()}
          />
        </label>
        <button type="button" className="staffing-date-step" onClick={() => onDateChange(shiftDate(date, 1))} aria-label="Next day"><ChevronRight size={16} /></button>
        <button type="button" className="staffing-today-button" onClick={() => onDateChange(new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" }))}>Today</button>
      </div>

      <div className="staffing-table-card">
        <div className="staffing-table-header">
          <span>Assignment / Area</span>
          <span>Assigned employee</span>
          <span aria-hidden="true" />
        </div>

        {rows.length === 0 ? (
          <div className="staffing-empty-state">
            <UserRoundCheck size={22} />
            <strong>No assignments added yet</strong>
            <span>Press “Add assignment” to build today’s staffing list.</span>
          </div>
        ) : (
          <div className="staffing-custom-list">
            {rows.map((row) => (
              <div className="staffing-custom-row" key={row.id}>
                <input
                  type="text"
                  value={row.assignment || row.areaName || ""}
                  placeholder="Example: Front Lead, Line 1, Drinks"
                  disabled={!canManage}
                  onChange={(event) => updateRow(row.id, { assignment: event.target.value, areaName: event.target.value })}
                />
                <input
                  type="text"
                  value={row.displayName || ""}
                  placeholder="Employee name"
                  disabled={!canManage}
                  onChange={(event) => updateRow(row.id, { displayName: event.target.value })}
                />
                <button type="button" className="staffing-remove-button" disabled={!canManage} onClick={() => onChangeAssignment(row.id, null)} title="Remove assignment"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="staffing-add-button" disabled={!canManage} onClick={addAssignment}><Plus size={15} /> Add assignment</button>
      </div>

      <div className="staffing-save-row">
        <span>{saveState === "dirty" ? "Unsaved changes" : saveState === "error" ? "Unable to save—try again" : ""}</span>
        <button type="button" className="workspace-primary-action staffing-save-button" disabled={!canManage || saveState === "saving"} onClick={onSave}>
          <Save size={14} /> {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save daily staffing"}
        </button>
      </div>
    </div>
  );
}
