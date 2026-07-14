import { CalendarDays, Save, UserRoundCheck } from "lucide-react";

export default function DailyStaffingPanel({ venueName, date, onDateChange, areas, employees, assignments, onChangeAssignment, onSave, canManage, saveState }) {
  const availableEmployees = Object.values(employees || {}).filter((employee) => employee?.active !== false);
  return (
    <div className="workspace-tool-content staffing-panel">
      <div><h2 className="operation-heading"><CalendarDays size={15} /> Daily staffing</h2><p>Assign employees to areas for one date. Permanent employee records are not changed.</p></div>
      <label className="designer-field"><span>Date</span><input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
      <div className="staffing-assignment-list">
        {areas.filter((area) => !area.hidden && !area.protected).map((area) => (
          <label key={area.id} className="staffing-assignment-row">
            <span><UserRoundCheck size={14} /> {area.label}</span>
            <select value={assignments?.[area.id]?.employeeId || ""} onChange={(event) => {
              const employee = availableEmployees.find((row) => String(row.ukgId || row.id) === event.target.value);
              onChangeAssignment(area.id, employee ? { employeeId: String(employee.ukgId || employee.id), displayName: employee.preferredName || employee.fullName, areaId: area.id, areaName: area.label, active: true } : null);
            }} disabled={!canManage}>
              <option value="">Unassigned</option>
              {availableEmployees.map((employee) => <option key={employee.ukgId || employee.id} value={employee.ukgId || employee.id}>{employee.preferredName || employee.fullName} — {employee.fullName}</option>)}
            </select>
          </label>
        ))}
      </div>
      <button type="button" className="workspace-primary-action" disabled={!canManage || saveState === "saving"} onClick={onSave}><Save size={14} /> {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save staffing"}</button>
    </div>
  );
}
