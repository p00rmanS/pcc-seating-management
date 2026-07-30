import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Copy, Plus, Save, Sparkles, Trash2, UserRoundCheck, X } from "lucide-react";
import { getAssignmentGroupColors } from "../../utils/assignmentColors";
import { saveOperationsSettings, saveWeeklySchedule, subscribeToOperationsSettings, subscribeToWeeklySchedule } from "../../services/firebase/realtimeSync";

const DEFAULT_ASSIGNMENT_AREAS = ["Line 1", "Line 2", "Imu", "Fish", "Panner", "Smoothies", "Dismissing", "Greeter", "Off"];
const DEFAULT_ASSIGNMENT_TIMES = ["3:00pm", "3:15pm", "3:30pm", "3:45pm", "4:00pm", "4:15pm", "4:30pm", "4:45pm", "5:00pm", "5:30pm", "6:00pm"];
const DEFAULT_ASSIGNMENT_DUTIES = [
  "Setup Salad Station", "Fruit Station & Hot Line", "Imu Pig Carver", "Fish Carver",
  "Tongs & Utensils", "Cups & Decanters", "Wipe Down Stations Doors & BOH Floors", "Floors",
];
function normalizeList(value, fallback) {
  return Array.isArray(value) && value.length ? value.filter(Boolean) : fallback;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function tableLabel(table) {
  return `#${table.number} (${table.capacity}p)`;
}

function startOfWeek(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return date.toLocaleDateString("en-CA");
}
function formatWeekdayShort(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return `${date.toLocaleDateString("en-US", { weekday: "long" })} ${date.getMonth() + 1}.${date.getDate()}`;
}

// A saved assignment row supports two eras of data: the original free-text
// {assignment, displayName} shape and the newer {position, assignedAreaIds,
// assignedTableIds, notes} shape. Both are read/written here so existing
// daily records keep working without a migration step.
function effectivePosition(row) {
  return row.position || row.assignment || row.areaName || "";
}

export default function DailyStaffingPanel({
  venueId,
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
    onChangeAssignment(id, { displayName: "", position: "", assignment: "", areaName: "", group: "", opening: "", closing: "", assignedAreaIds: [], assignedTableIds: [], notes: "", active: true });
  };

  const updateRow = (id, patch) => {
    const current = assignments?.[id] || {};
    onChangeAssignment(id, { ...current, ...patch, active: true });
  };

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

  const [settings, setSettings] = useState(null);
  const [showAssignmentOptionEditor, setShowAssignmentOptionEditor] = useState(false);
  const [newAssignmentArea, setNewAssignmentArea] = useState("");
  const [newAssignmentTime, setNewAssignmentTime] = useState("");
  const [newAssignmentDuty, setNewAssignmentDuty] = useState("");

  useEffect(() => {
    if (!venueId) return undefined;
    return subscribeToOperationsSettings(venueId, setSettings, console.error);
  }, [venueId]);

  const assignmentAreas = normalizeList(settings?.assignmentAreas, DEFAULT_ASSIGNMENT_AREAS);
  const assignmentTimes = normalizeList(settings?.assignmentTimes, DEFAULT_ASSIGNMENT_TIMES);
  const assignmentDuties = normalizeList(settings?.assignmentDuties, DEFAULT_ASSIGNMENT_DUTIES);
  const addAssignmentOption = async (key, list, value, resetValue) => {
    const clean = value.trim();
    if (!clean || list.some((item) => item.toLowerCase() === clean.toLowerCase())) return;
    await saveOperationsSettings(venueId, { [key]: [...list, clean] });
    resetValue("");
  };
  const removeAssignmentOption = (key, list, value) => saveOperationsSettings(venueId, { [key]: list.filter((item) => item !== value) });

  // Unassigned / duplicate-assigned table detection across all active rows for the day.
  const assignmentCounts = useMemo(() => {
    const counts = new Map();
    rows.forEach((row) => (row.assignedTableIds || []).forEach((tableId) => counts.set(tableId, (counts.get(tableId) || 0) + 1)));
    return counts;
  }, [rows]);
  const unassignedTables = realTables.filter((table) => !assignmentCounts.has(table.id));
  const duplicateTables = realTables.filter((table) => (assignmentCounts.get(table.id) || 0) > 1);

  const [scheduleMode, setScheduleMode] = useState("daily");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(date));
  const [weeklySchedule, setWeeklySchedule] = useState(null);
  const [weeklySaveState, setWeeklySaveState] = useState("idle");
  const [newRowName, setNewRowName] = useState("");

  useEffect(() => {
    if (!venueId) return undefined;
    return subscribeToWeeklySchedule(venueId, weekStart, setWeeklySchedule, console.error);
  }, [venueId, weekStart]);

  const defaultWeeklyRows = useMemo(
    () => [...seatingAreas.map((area, index) => ({ id: area.id, label: area.label, order: index })), { id: "off", label: "Off", order: seatingAreas.length }],
    [seatingAreas]
  );
  const weeklyRows = [...(weeklySchedule?.rows?.length ? weeklySchedule.rows : defaultWeeklyRows)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const weeklyAssignments = weeklySchedule?.assignments || {};
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)), [weekStart]);

  const saveWeekly = (patch) => {
    if (!venueId) return;
    const next = { rows: weeklyRows, assignments: weeklyAssignments, ...patch };
    setWeeklySaveState("saving");
    saveWeeklySchedule(venueId, weekStart, next)
      .then(() => { setWeeklySaveState("saved"); window.setTimeout(() => setWeeklySaveState("idle"), 1200); })
      .catch(() => setWeeklySaveState("error"));
  };
  const setWeeklyCell = (rowId, dateStr, value) => {
    const rowAssignments = { ...(weeklyAssignments[rowId] || {}), [dateStr]: value };
    saveWeekly({ assignments: { ...weeklyAssignments, [rowId]: rowAssignments } });
  };
  const addWeeklyRow = () => {
    const label = newRowName.trim();
    if (!label) return;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `row-${weekStart}-${weeklyRows.length}-${slug}`;
    saveWeekly({ rows: [...weeklyRows, { id, label, order: weeklyRows.length }] });
    setNewRowName("");
  };
  const renameWeeklyRow = (id, label) => saveWeekly({ rows: weeklyRows.map((row) => (row.id === id ? { ...row, label } : row)) });
  const removeWeeklyRow = (id) => saveWeekly({ rows: weeklyRows.filter((row) => row.id !== id) });
  const moveWeeklyRow = (id, delta) => {
    const index = weeklyRows.findIndex((row) => row.id === id);
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= weeklyRows.length) return;
    const next = [...weeklyRows];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    saveWeekly({ rows: next.map((row, rowIndex) => ({ ...row, order: rowIndex })) });
  };

  return (
    <div className="workspace-tool-content staffing-panel staffing-panel-v153">
      <div className="staffing-heading-row">
        <div>
          <h2 className="operation-heading"><CalendarDays size={16} /> Assignment Manager</h2>
          <p>Type each employee's name and pick their area(s). Tables in that area count toward them automatically.</p>
        </div>
        <span className="staffing-venue-badge">{venueName}</span>
      </div>

      <div className="staffing-mode-toggle">
        <button type="button" className={scheduleMode === "daily" ? "active" : ""} onClick={() => setScheduleMode("daily")}><CalendarDays size={14}/> Daily Assignments</button>
        <button type="button" className={scheduleMode === "weekly" ? "active" : ""} onClick={() => setScheduleMode("weekly")}><CalendarRange size={14}/> Weekly Schedule</button>
        {canManage && <button type="button" className="staffing-today-button" onClick={() => setShowAssignmentOptionEditor((value) => !value)}>{showAssignmentOptionEditor ? "Hide options" : "Manage options"}</button>}
      </div>

      <datalist id="ops-assignment-area-options">{assignmentAreas.map((area) => <option key={area} value={area} />)}</datalist>
      <datalist id="ops-assignment-time-options">{assignmentTimes.map((time) => <option key={time} value={time} />)}</datalist>
      <datalist id="ops-assignment-duty-options">{assignmentDuties.map((duty) => <option key={duty} value={duty} />)}</datalist>

      {canManage && showAssignmentOptionEditor && (
        <div className="ops-assignment-option-editor">
          {[
            ["Areas", assignmentAreas, "assignmentAreas", newAssignmentArea, setNewAssignmentArea, "e.g. Line 1, Imu, Fish"],
            ["Times", assignmentTimes, "assignmentTimes", newAssignmentTime, setNewAssignmentTime, "e.g. 4:30pm"],
            ["Duties", assignmentDuties, "assignmentDuties", newAssignmentDuty, setNewAssignmentDuty, "e.g. Setup Salad Station"],
          ].map(([label, list, key, value, setValue, placeholder]) => (
            <div className="ops-assignment-option-group" key={key}>
              <span className="ops-assignment-option-label">{label}</span>
              <div className="ops-assignment-option-chips">
                {list.map((item) => (
                  <span className="ops-assignment-option-chip" key={item}>
                    {item}
                    <button type="button" onClick={() => removeAssignmentOption(key, list, item)}><X size={11}/></button>
                  </span>
                ))}
              </div>
              <div className="ops-inline-add">
                <input value={value} placeholder={placeholder} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addAssignmentOption(key, list, value, setValue); }} />
                <button type="button" onClick={() => addAssignmentOption(key, list, value, setValue)}><Plus size={14}/> Add</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {scheduleMode === "weekly" && (
        <div className="weekly-schedule">
          <div className="weekly-schedule-toolbar">
            <button type="button" className="staffing-date-step" onClick={() => setWeekStart((value) => shiftDate(value, -7))} aria-label="Previous week"><ChevronLeft size={16}/></button>
            <span className="weekly-schedule-range">{formatWeekdayShort(weekStart)} – {formatWeekdayShort(shiftDate(weekStart, 6))}</span>
            <button type="button" className="staffing-date-step" onClick={() => setWeekStart((value) => shiftDate(value, 7))} aria-label="Next week"><ChevronRight size={16}/></button>
            <button type="button" className="staffing-today-button" onClick={() => setWeekStart(startOfWeek(new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" })))}>This week</button>
            <span className="weekly-schedule-save">{weeklySaveState === "saving" ? "Saving…" : weeklySaveState === "saved" ? "Saved" : weeklySaveState === "error" ? "Unable to save" : ""}</span>
          </div>

          <div className="weekly-schedule-table-wrap">
            <table className="weekly-schedule-table">
              <thead>
                <tr>
                  <th className="weekly-schedule-row-head"></th>
                  {weekDays.map((day) => <th key={day}>{formatWeekdayShort(day)}</th>)}
                  {canManage && <th className="weekly-schedule-row-actions"></th>}
                </tr>
              </thead>
              <tbody>
                {weeklyRows.map((row, index) => {
                  const isOff = row.label.trim().toLowerCase() === "off";
                  const colors = getAssignmentGroupColors(row.label) || { bg: "#f8fafc", border: "#e2e8f0", text: "#334155" };
                  return (
                    <tr key={row.id} className={isOff ? "weekly-row-off" : ""}>
                      <th scope="row" style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}>
                        {canManage ? (
                          <input value={row.label} onChange={(event) => renameWeeklyRow(row.id, event.target.value)} />
                        ) : row.label}
                      </th>
                      {weekDays.map((day) => (
                        <td key={day}>
                          <input
                            disabled={!canManage}
                            value={weeklyAssignments[row.id]?.[day] || ""}
                            placeholder="—"
                            onChange={(event) => setWeeklyCell(row.id, day, event.target.value)}
                          />
                        </td>
                      ))}
                      {canManage && (
                        <td className="weekly-row-actions">
                          <button type="button" disabled={index === 0} onClick={() => moveWeeklyRow(row.id, -1)} aria-label={`Move ${row.label} up`}><ChevronLeft size={13} style={{ transform: "rotate(90deg)" }}/></button>
                          <button type="button" disabled={index === weeklyRows.length - 1} onClick={() => moveWeeklyRow(row.id, 1)} aria-label={`Move ${row.label} down`}><ChevronRight size={13} style={{ transform: "rotate(90deg)" }}/></button>
                          <button type="button" onClick={() => removeWeeklyRow(row.id)}><Trash2 size={13}/></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canManage && (
            <div className="ops-inline-add">
              <input value={newRowName} placeholder="Add a row (e.g. Smoothies, Dismissing, Greeter)" onChange={(event) => setNewRowName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addWeeklyRow(); }} />
              <button type="button" onClick={addWeeklyRow}><Plus size={14}/> Add row</button>
            </div>
          )}
        </div>
      )}

      {scheduleMode === "daily" && <>
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
        {rows.map((row) => {
          const groupColors = getAssignmentGroupColors(row.group);
          const cardStyle = groupColors ? { background: groupColors.bg, borderColor: groupColors.border } : undefined;
          return (
          <div className="staffing-card" style={cardStyle} key={row.id}>
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
                <span>Area</span>
                <input
                  disabled={!canManage}
                  list="ops-assignment-area-options"
                  value={row.group || effectivePosition(row)}
                  placeholder="e.g. Line 1, Imu, Fish"
                  onChange={(event) => updateRow(row.id, { group: event.target.value, position: event.target.value, assignment: event.target.value, areaName: event.target.value })}
                />
              </label>
              <label>
                <span>Time</span>
                <input disabled={!canManage} list="ops-assignment-time-options" value={row.time || ""} placeholder="e.g. 3:45pm" onChange={(event) => updateRow(row.id, { time: event.target.value })} />
              </label>
              <label>
                <span>Opening duty</span>
                <input disabled={!canManage} list="ops-assignment-duty-options" value={row.opening || ""} placeholder="e.g. Setup Salad Station" onChange={(event) => updateRow(row.id, { opening: event.target.value })} />
              </label>
              <label>
                <span>Closing duty</span>
                <input disabled={!canManage} list="ops-assignment-duty-options" value={row.closing || ""} placeholder="e.g. Tongs & Utensils" onChange={(event) => updateRow(row.id, { closing: event.target.value })} />
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
          );
        })}
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
      </>}
    </div>
  );
}
