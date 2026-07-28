import { useMemo } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Save, Sparkles, Trash2, UserRoundCheck } from "lucide-react";

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function tableLabel(table) {
  return `#${table.number} (${table.capacity}p)`;
}

// A saved assignment row supports two eras of data: the original free-text
// {assignment, displayName} shape and the newer {position, assignedAreaIds,
// assignedTableIds, notes} shape. Both are read/written here so existing
// daily records keep working without a migration step.
function effectivePosition(row) {
  return row.position || row.assignment || row.areaName || "";
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
  areas = [],
  tables = [],
  onCopyYesterday,
}) {
  const rows = Object.entries(assignments || {})
    .filter(([, value]) => value?.active !== false)
    .map(([id, value]) => ({ id, ...value }));

  const seatingAreas = useMemo(() => areas.filter((area) => (area.areaKind ?? "seating") === "seating"), [areas]);
  const realTables = useMemo(() => tables.filter((table) => !(table.childIds && table.childIds.length)), [tables]);

  const tableIdsForAreas = (areaIds) =>
    realTables.filter((table) => areaIds.includes(table.areaId) || areaIds.includes(table.zone)).map((table) => table.id);

  const addAssignment = () => {
    if (!canManage) return;
    const id = `assignment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onChangeAssignment(id, { displayName: "", position: "", assignment: "", areaName: "", assignedAreaIds: [], assignedTableIds: [], notes: "", active: true });
  };

  const updateRow = (id, patch) => {
    const current = assignments?.[id] || {};
    onChangeAssignment(id, { ...current, ...patch, active: true });
  };

  const updatePosition = (row, value) => updateRow(row.id, { position: value, assignment: value, areaName: value });

  // Areas are the only table-scoping control — picking an area auto-includes
  // every table inside it. There is deliberately no individual-table picker:
  // with 60+ tables per venue, hand-picking each one isn't practical day to day.
  const toggleArea = (row, areaId) => {
    const assignedAreaIds = row.assignedAreaIds || [];
    const isOn = assignedAreaIds.includes(areaId);
    const nextAreaIds = isOn ? assignedAreaIds.filter((id) => id !== areaId) : [...assignedAreaIds, areaId];
    const existingTableIds = new Set(row.assignedTableIds || []);
    if (isOn) {
      tableIdsForAreas([areaId]).forEach((tableId) => existingTableIds.delete(tableId));
    } else {
      tableIdsForAreas([areaId]).forEach((tableId) => existingTableIds.add(tableId));
    }
    updateRow(row.id, { assignedAreaIds: nextAreaIds, assignedTableIds: [...existingTableIds] });
  };

  // Unassigned / duplicate-assigned table detection across all active rows for the day.
  const assignmentCounts = useMemo(() => {
    const counts = new Map();
    rows.forEach((row) => (row.assignedTableIds || []).forEach((tableId) => counts.set(tableId, (counts.get(tableId) || 0) + 1)));
    return counts;
  }, [rows]);
  const unassignedTables = realTables.filter((table) => !assignmentCounts.has(table.id));
  const duplicateTables = realTables.filter((table) => (assignmentCounts.get(table.id) || 0) > 1);

  return (
    <div className="workspace-tool-content staffing-panel staffing-panel-v153">
      <div className="staffing-heading-row">
        <div>
          <h2 className="operation-heading"><CalendarDays size={16} /> Assignment Manager</h2>
          <p>Type each employee's name and pick their area(s). Tables in that area count toward them automatically.</p>
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
        {canManage && onCopyYesterday && <button type="button" className="staffing-copy-button" onClick={onCopyYesterday}><Copy size={14} /> Copy yesterday</button>}
      </div>

      {(unassignedTables.length > 0 || duplicateTables.length > 0) && (
        <div className="staffing-warnings">
          {unassignedTables.length > 0 && <div className="staffing-warning"><AlertTriangle size={13} /> {unassignedTables.length} unassigned table{unassignedTables.length === 1 ? "" : "s"}</div>}
          {duplicateTables.length > 0 && <div className="staffing-warning staffing-warning-duplicate"><AlertTriangle size={13} /> {duplicateTables.length} table{duplicateTables.length === 1 ? "" : "s"} assigned to more than one employee: {duplicateTables.slice(0, 12).map(tableLabel).join(", ")}{duplicateTables.length > 12 ? "…" : ""}</div>}
        </div>
      )}

      <div className="staffing-card-list">
        {rows.length === 0 && <div className="ops-empty">No assignments have been posted for this date.</div>}
        {rows.map((row) => (
          <div className="staffing-card" key={row.id}>
            <div className="staffing-card-top">
              <span className="staffing-card-name"><UserRoundCheck size={14} />{row.displayName || "Unnamed assignment"}</span>
              {canManage && <button type="button" className="staffing-card-remove" onClick={() => onChangeAssignment(row.id, null)}><Trash2 size={14} /></button>}
            </div>

            <div className="staffing-card-fields">
              <label>
                <span>Employee name</span>
                <input disabled={!canManage} value={row.displayName || ""} placeholder="Employee name" onChange={(event) => updateRow(row.id, { displayName: event.target.value })} />
              </label>
              <label>
                <span>Position / role</span>
                <input disabled={!canManage} value={effectivePosition(row)} placeholder="e.g. Line, Gelato, Floor" onChange={(event) => updatePosition(row, event.target.value)} />
              </label>
              <label>
                <span>Opening</span>
                <input type="time" disabled={!canManage} value={row.opening || ""} onChange={(event) => updateRow(row.id, { opening: event.target.value })} />
              </label>
              <label>
                <span>Closing</span>
                <input type="time" disabled={!canManage} value={row.closing || ""} onChange={(event) => updateRow(row.id, { closing: event.target.value })} />
              </label>
            </div>

            <div className="staffing-card-section">
              <span className="staffing-card-label">Areas ({(row.assignedTableIds || []).length} tables)</span>
              <div className="staffing-chip-row">
                {seatingAreas.map((area) => (
                  <button
                    type="button"
                    key={area.id}
                    disabled={!canManage}
                    className={(row.assignedAreaIds || []).includes(area.id) ? "staffing-chip active" : "staffing-chip"}
                    onClick={() => toggleArea(row, area.id)}
                  >
                    {area.label}
                  </button>
                ))}
                {seatingAreas.length === 0 && <span className="ops-empty">No seating areas defined yet.</span>}
              </div>
            </div>

            <label className="staffing-notes-field">
              <span>Notes</span>
              <textarea disabled={!canManage} rows={2} value={row.notes || ""} placeholder="Optional note for this assignment" onChange={(event) => updateRow(row.id, { notes: event.target.value })} />
            </label>
          </div>
        ))}
        {canManage && <button type="button" className="ops-add staffing-add-button" onClick={addAssignment}><Plus size={14} /> Add assignment</button>}
      </div>

      <div className="staffing-save-row">
        <span>{saveState === "dirty" ? "Unsaved changes" : saveState === "error" ? "Unable to save—try again" : ""}</span>
        {canManage ? (
          <button type="button" className="workspace-primary-action staffing-save-button" disabled={saveState === "saving"} onClick={onSave}>
            <Save size={14} /> {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save daily staffing"}
          </button>
        ) : (
          <span className="ops-empty"><Sparkles size={13} /> Read-only access to today's assignments.</span>
        )}
      </div>
    </div>
  );
}
