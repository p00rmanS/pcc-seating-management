import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Flower2,
  IceCreamBowl,
  Plus,
  Save,
  Shirt,
  Trash2,
  Unlock,
  UsersRound,
} from "lucide-react";
import {
  saveDailyOperationsRecord,
  saveOperationsSettings,
  subscribeToDailyOperations,
  subscribeToOperationsSettings,
} from "../../services/firebase/realtimeSync";

const DEFAULT_CLOTHS = [
  "Table Cloth", "Rounds", "Skirt", "Towels", "Beige", "Napkin - Purple",
  "Napkin - Pink", "Dark Beige", "Napkin - Dark Pink", "Napkin Flower Pink", "Tan", "Others",
];
const DEFAULT_LEIS = ["Flower Lei"];
const DEFAULT_FROZEN = {
  ohana: ["Tahitian Vanilla", "Chocolate", "Dragon Fruit", "Mango", "Strawberry"],
  aloha: ["Tahitian Vanilla", "Chocolate", "Dragon Fruit", "Mango", "Strawberry"],
  gateway: ["Chocolate", "Cotton Candy", "Cookies and Cream", "Ube", "Mango Soft Serve", "Strawberry"],
};
const LEVELS = ["Full", "3/4 Full", "1/2 Full", "1/4 Full", "Almost Out", "Empty", "Not Served Today"];
const UNIT_OPTIONS = ["tubs", "pans", "bags"];
const PAX_SIZES = [1,2,3,4,5,6,7,8,9,10,12];
const WORKFLOW_LABELS = { not_started: "Not Started", in_progress: "In Progress", submitted: "Submitted", reopened: "Reopened" };

const MANAGEMENT_ROLES = new Set(["developer", "admin", "director", "manager", "assistant_manager", "lead", "front_lead", "back_lead"]);

function blankCounts(items) {
  return Object.fromEntries(items.map((name) => [name, 0]));
}
function normalizeList(value, fallback) {
  return Array.isArray(value) && value.length ? value.filter(Boolean) : fallback;
}
// Flavor config supports both the original flat string-array shape and the
// v18.1 {id, name, unit, active, order} shape, so existing saved settings
// keep working without a migration step.
function normalizeFlavorConfig(value, fallbackNames) {
  const list = Array.isArray(value) && value.length ? value : fallbackNames.map((name) => ({ name }));
  return list
    .filter(Boolean)
    .map((item, index) =>
      typeof item === "string"
        ? { id: item, name: item, unit: "tubs", active: true, order: index }
        : {
            id: item.id || item.name || `flavor-${index}`,
            name: item.name || item.id || `Flavor ${index + 1}`,
            unit: item.unit || "tubs",
            active: item.active !== false,
            order: Number.isFinite(item.order) ? item.order : index,
          }
    )
    .sort((a, b) => a.order - b.order);
}
function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

function NumberRow({ label, value, onChange, disabled, onRemove }) {
  return (
    <div className="ops-count-row">
      <div className="ops-count-label"><strong>{label}</strong>{onRemove && <button type="button" onClick={onRemove} disabled={disabled} title={`Remove ${label}`}><Trash2 size={13}/></button>}</div>
      <div className="ops-stepper">
        <button type="button" disabled={disabled || Number(value) <= 0} onClick={() => onChange(Math.max(0, Number(value) - 1))}>−</button>
        <input type="number" min="0" value={Number(value) || 0} disabled={disabled} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}/>
        <button type="button" disabled={disabled} onClick={() => onChange(Number(value || 0) + 1)}>+</button>
      </div>
    </div>
  );
}

function DecimalStepper({ label, value, onChange, disabled }) {
  const bump = (delta) => onChange(Math.max(0, Math.round((Number(value || 0) + delta) * 100) / 100));
  return (
    <label className="ops-decimal-field">
      <span>{label}</span>
      <div className="ops-decimal-stepper">
        <input type="number" min="0" step="0.5" value={Number(value) || 0} disabled={disabled} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}/>
        <div className="ops-quick-buttons">
          <button type="button" disabled={disabled} onClick={() => bump(-1)}>-1</button>
          <button type="button" disabled={disabled} onClick={() => bump(-0.5)}>-0.5</button>
          <button type="button" disabled={disabled} onClick={() => bump(0.5)}>+0.5</button>
          <button type="button" disabled={disabled} onClick={() => bump(1)}>+1</button>
        </div>
      </div>
    </label>
  );
}

export default function DailyOperationsHub({
  venueId,
  venueName,
  role,
  profile,
  tables,
  staffingDate,
  onDateChange,
  staffingAssignments,
  onChangeAssignment,
  onSaveStaffing,
  staffingSaveState,
  canManageStaffing,
  showAlert,
  showConfirm,
}) {
  const canManage = MANAGEMENT_ROLES.has(role);
  const sectionAccess = useMemo(() => ({
    assignments: true,
    cloths: canManage || role === "inventory" || role === "line",
    leis: canManage || role === "inventory",
    frozen: canManage || role === "gelato" || role === "dessert",
    pax: canManage || role === "line" || role === "server" || role === "operations_server",
    history: canManage,
  }), [canManage, role]);
  const firstTab = Object.keys(sectionAccess).find((key) => sectionAccess[key]) || "assignments";
  const [activeTab, setActiveTab] = useState(firstTab);
  const [settings, setSettings] = useState(null);
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState({});
  const [saveState, setSaveState] = useState("idle");
  const [newItem, setNewItem] = useState("");
  const [newFlavorName, setNewFlavorName] = useState("");
  const [newFlavorUnit, setNewFlavorUnit] = useState("tubs");

  useEffect(() => { if (!sectionAccess[activeTab]) setActiveTab(firstTab); }, [activeTab, firstTab, sectionAccess]);
  useEffect(() => subscribeToOperationsSettings(venueId, setSettings, console.error), [venueId]);
  useEffect(() => subscribeToDailyOperations(venueId, staffingDate, (current, all) => {
    setRecord(current || null);
    setHistory(all || {});
  }, console.error), [venueId, staffingDate]);

  const clothItems = normalizeList(settings?.clothItems, DEFAULT_CLOTHS);
  const leiItems = normalizeList(settings?.leiItems, DEFAULT_LEIS);
  const frozenConfig = useMemo(
    () => normalizeFlavorConfig(settings?.frozenItems, DEFAULT_FROZEN[venueId] || DEFAULT_FROZEN.ohana),
    [settings?.frozenItems, venueId]
  );
  const activeFlavors = useMemo(() => frozenConfig.filter((flavor) => flavor.active), [frozenConfig]);

  const current = useMemo(() => ({
    cloths: { ...blankCounts(clothItems), ...(record?.cloths || {}) },
    leis: Object.fromEntries(leiItems.map((name) => [name, { beginning: 0, received: 0, used: 0, damaged: 0, remaining: 0, ...(record?.leis?.[name] || {}) }])),
    frozen: Object.fromEntries(frozenConfig.map((flavor) => {
      const legacy = record?.frozen?.[flavor.name] || {};
      return [flavor.name, {
        opening: legacy.opening ?? 0,
        added: legacy.added ?? 0,
        used: legacy.used ?? 0,
        damaged: legacy.damaged ?? 0,
        actualClosing: legacy.actualClosing ?? legacy.quantity ?? 0,
        status: legacy.status ?? legacy.level ?? "Full",
        notes: legacy.notes ?? legacy.note ?? "",
      }];
    })),
    frozenWorkflow: record?.frozenWorkflow || { status: "not_started" },
    pax: { ...Object.fromEntries(PAX_SIZES.map((size) => [size, 0])), ...(record?.pax || {}) },
    notes: record?.notes || "",
  }), [clothItems, frozenConfig, leiItems, record]);

  const workflowStatusKey = current.frozenWorkflow?.status || "not_started";
  const frozenLocked = !canManage && workflowStatusKey === "submitted";

  const patchSection = (section, patch) => setRecord((previous) => ({ ...(previous || {}), [section]: { ...(current[section] || {}), ...patch } }));
  const saveRecord = async () => {
    setSaveState("saving");
    try {
      await saveDailyOperationsRecord(venueId, staffingDate, current, {
        uid: profile?.uid,
        name: profile?.displayName,
        role,
      });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } catch (error) {
      console.error(error); setSaveState("error");
    }
  };
  const saveFrozenRecord = async () => {
    setSaveState("saving");
    const nextWorkflow = workflowStatusKey === "not_started"
      ? { ...current.frozenWorkflow, status: "in_progress" }
      : current.frozenWorkflow;
    try {
      await saveDailyOperationsRecord(venueId, staffingDate, { ...current, frozenWorkflow: nextWorkflow }, {
        uid: profile?.uid, name: profile?.displayName, role,
      });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1600);
    } catch (error) {
      console.error(error); setSaveState("error");
    }
  };
  const submitFrozenBreakout = async () => {
    const confirmed = showConfirm
      ? await showConfirm(
          "Submit today's gelato breakout?",
          "Your counts will be locked. A manager can reopen this record if changes are needed.",
          { confirmLabel: "Submit" }
        )
      : true;
    if (!confirmed) return;
    setSaveState("saving");
    try {
      await saveDailyOperationsRecord(venueId, staffingDate, {
        ...current,
        frozenWorkflow: { status: "submitted", submittedAt: new Date().toISOString(), submittedByUid: profile?.uid, submittedByName: profile?.displayName },
      }, { uid: profile?.uid, name: profile?.displayName, role });
      setSaveState("saved");
    } catch (error) {
      console.error(error); setSaveState("error");
      if (showAlert) await showAlert("Unable to submit", "Check your connection and try again.", { tone: "danger" });
    }
  };
  const reopenFrozenBreakout = async () => {
    const confirmed = showConfirm
      ? await showConfirm(
          "Reopen this record?",
          "The gelato team will be able to edit today's breakout again.",
          { confirmLabel: "Reopen", tone: "warning" }
        )
      : true;
    if (!confirmed) return;
    try {
      await saveDailyOperationsRecord(venueId, staffingDate, {
        ...current,
        frozenWorkflow: { ...current.frozenWorkflow, status: "reopened", reopenedAt: new Date().toISOString(), reopenedByUid: profile?.uid, reopenedByName: profile?.displayName },
      }, { uid: profile?.uid, name: profile?.displayName, role });
    } catch (error) {
      console.error(error);
      if (showAlert) await showAlert("Unable to reopen", "Check your connection and try again.", { tone: "danger" });
    }
  };

  const addSettingItem = async (key, list) => {
    const clean = newItem.trim();
    if (!clean || list.some((value) => value.toLowerCase() === clean.toLowerCase())) return;
    await saveOperationsSettings(venueId, { [key]: [...list, clean] }, { uid: profile?.uid, name: profile?.displayName });
    setNewItem("");
  };
  const removeSettingItem = async (key, list, name) => {
    await saveOperationsSettings(venueId, { [key]: list.filter((item) => item !== name) }, { uid: profile?.uid, name: profile?.displayName });
  };

  const updateFrozenConfig = (nextList) =>
    saveOperationsSettings(venueId, { frozenItems: nextList }, { uid: profile?.uid, name: profile?.displayName });
  const addFlavor = async () => {
    const clean = newFlavorName.trim();
    if (!clean || frozenConfig.some((flavor) => flavor.name.toLowerCase() === clean.toLowerCase())) return;
    await updateFrozenConfig([...frozenConfig, { id: `flavor-${Date.now()}`, name: clean, unit: newFlavorUnit, active: true, order: frozenConfig.length }]);
    setNewFlavorName("");
  };
  const renameFlavor = (id, name) => updateFrozenConfig(frozenConfig.map((flavor) => (flavor.id === id ? { ...flavor, name } : flavor)));
  const setFlavorUnit = (id, unit) => updateFrozenConfig(frozenConfig.map((flavor) => (flavor.id === id ? { ...flavor, unit } : flavor)));
  const toggleFlavorActive = (id) => updateFrozenConfig(frozenConfig.map((flavor) => (flavor.id === id ? { ...flavor, active: !flavor.active } : flavor)));
  const moveFlavor = (id, direction) => {
    const sorted = [...frozenConfig];
    const index = sorted.findIndex((flavor) => flavor.id === id);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= sorted.length) return;
    const a = sorted[index], b = sorted[swapWith];
    updateFrozenConfig(sorted.map((flavor) => {
      if (flavor.id === a.id) return { ...flavor, order: b.order };
      if (flavor.id === b.id) return { ...flavor, order: a.order };
      return flavor;
    }));
  };

  const visibleTables = tables.filter((table) => !(table.childIds && table.childIds.length));
  const livePax = visibleTables.reduce((result, table) => {
    if (table.status !== "occupied") return result;
    const size = Number(table.partySize) || Number(table.capacity) || 0;
    if (size > 0) result[size] = (result[size] || 0) + 1;
    return result;
  }, {});
  const manualPaxTotal = Object.entries(current.pax).reduce((sum, [size, count]) => sum + Number(size) * Number(count || 0), 0);
  const manualTableTotal = Object.values(current.pax).reduce((sum, count) => sum + Number(count || 0), 0);
  const liveGuestTotal = Object.entries(livePax).reduce((sum, [size, count]) => sum + Number(size) * Number(count || 0), 0);
  const clothTotal = Object.values(current.cloths).reduce((sum, count) => sum + Number(count || 0), 0);

  const tabs = [
    ["assignments", "Assignment", ClipboardList], ["cloths", "Cloths", Shirt], ["leis", "Leis", Flower2],
    ["frozen", "Gelato / Ice Cream", IceCreamBowl], ["pax", "Pax", UsersRound], ["history", "History", CalendarDays],
  ].filter(([id]) => sectionAccess[id]);

  return (
    <div className="daily-operations-hub">
      <div className="ops-hero">
        <div><span className="ops-eyebrow">Daily Operations</span><h2>{venueName}</h2><p>{formatDate(staffingDate)} · Signed in as {profile?.displayName || "Employee"}</p></div>
        <div className="ops-date-controls">
          <button type="button" onClick={() => onDateChange(shiftDate(staffingDate, -1))}>‹</button>
          <input type="date" value={staffingDate} onChange={(event) => onDateChange(event.target.value)}/>
          <button type="button" onClick={() => onDateChange(shiftDate(staffingDate, 1))}>›</button>
        </div>
      </div>
      <div className="ops-tabs">{tabs.map(([id,label,Icon]) => <button type="button" key={id} className={activeTab===id?"active":""} onClick={() => setActiveTab(id)}><Icon size={15}/><span>{label}</span></button>)}</div>

      {activeTab === "assignments" && <section className="ops-panel">
        <div className="ops-panel-heading"><div><h3>Today’s Assignment</h3><p>Operational employees can see this list. Managers can add or remove assignments.</p></div>{canManageStaffing && <button type="button" className="ops-primary" onClick={onSaveStaffing}><Save size={14}/>{staffingSaveState === "saving" ? "Saving…" : "Save"}</button>}</div>
        <div className="ops-assignment-list">
          {Object.entries(staffingAssignments || {}).length === 0 && <div className="ops-empty">No assignments have been posted for this date.</div>}
          {Object.entries(staffingAssignments || {}).map(([id,value]) => <div className="ops-assignment-row" key={id}>
            <input disabled={!canManageStaffing} value={value.position || value.assignment || value.areaName || ""} placeholder="Assignment / station" onChange={(event) => onChangeAssignment(id, {...value, position:event.target.value, assignment:event.target.value, areaName:event.target.value})}/>
            <input disabled={!canManageStaffing} value={value.displayName || ""} placeholder="Employee name" onChange={(event) => onChangeAssignment(id, {...value, displayName:event.target.value})}/>
            {canManageStaffing && <button type="button" onClick={() => onChangeAssignment(id,null)}><Trash2 size={14}/></button>}
          </div>)}
          {canManageStaffing && <button type="button" className="ops-add" onClick={() => onChangeAssignment(`assignment-${Date.now()}`, { assignment:"", displayName:"", active:true })}><Plus size={14}/> Add assignment</button>}
        </div>
      </section>}

      {activeTab === "cloths" && <section className="ops-panel">
        <div className="ops-panel-heading"><div><h3>Cloth Count</h3><p>Enter leftover quantities. The total updates automatically.</p></div><div className="ops-total-chip"><span>Total</span><strong>{clothTotal}</strong></div></div>
        <div className="ops-count-list">{clothItems.map((name) => <NumberRow key={name} label={name} value={current.cloths[name]} disabled={false} onChange={(value) => patchSection("cloths", {[name]:value})} onRemove={canManage ? () => removeSettingItem("clothItems", clothItems, name) : null}/>)}</div>
        {canManage && <div className="ops-inline-add"><input value={newItem} placeholder="Add another cloth item" onChange={(event)=>setNewItem(event.target.value)}/><button type="button" onClick={()=>addSettingItem("clothItems", clothItems)}><Plus size={14}/> Add</button></div>}
        <button type="button" className="ops-primary ops-save" onClick={saveRecord}><Save size={14}/>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save cloth count"}</button>
      </section>}

      {activeTab === "leis" && <section className="ops-panel">
        <div className="ops-panel-heading"><div><h3>Lei Leftovers</h3><p>Remaining is calculated from beginning + received − used − damaged.</p></div></div>
        {leiItems.map((name) => { const value=current.leis[name]; const calculated=Math.max(0, Number(value.beginning)+Number(value.received)-Number(value.used)-Number(value.damaged)); return <div className="ops-lei-card" key={name}><div className="ops-subheading"><strong>{name}</strong>{canManage&&<button type="button" onClick={()=>removeSettingItem("leiItems",leiItems,name)}><Trash2 size={13}/></button>}</div><div className="ops-four-grid">{["beginning","received","used","damaged"].map((key)=><label key={key}><span>{key[0].toUpperCase()+key.slice(1)}</span><input type="number" min="0" value={value[key]||0} onChange={(event)=>patchSection("leis", {[name]:{...value,[key]:Math.max(0,Number(event.target.value)||0),remaining:calculated}})}/></label>)}</div><div className="ops-calculated"><span>Remaining in fridge</span><strong>{calculated}</strong></div></div>})}
        {canManage && <div className="ops-inline-add"><input value={newItem} placeholder="Add another lei type" onChange={(event)=>setNewItem(event.target.value)}/><button type="button" onClick={()=>addSettingItem("leiItems",leiItems)}><Plus size={14}/> Add</button></div>}
        <button type="button" className="ops-primary ops-save" onClick={saveRecord}><Save size={14}/> Save lei inventory</button>
      </section>}

      {activeTab === "frozen" && <section className="ops-panel">
        <div className="ops-panel-heading">
          <div><h3>Gelato / Ice Cream Breakout</h3><p>Opening, added, used, and damaged calculate expected closing automatically. Enter the actual closing count to see variance.</p></div>
          <span className={`ops-workflow-badge ops-workflow-${workflowStatusKey}`}>{WORKFLOW_LABELS[workflowStatusKey]}</span>
        </div>

        {frozenLocked && <div className="ops-locked-banner">This breakout has been submitted and is locked. Ask a manager to reopen it to make changes.</div>}

        <div className="ops-frozen-grid">
          {activeFlavors.map((flavor) => {
            const value = current.frozen[flavor.name];
            const expectedClosing = Math.max(0, Number(value.opening || 0) + Number(value.added || 0) - Number(value.used || 0) - Number(value.damaged || 0));
            const variance = Math.round((Number(value.actualClosing || 0) - expectedClosing) * 100) / 100;
            return (
              <div className="ops-frozen-card ops-frozen-card-v2" key={flavor.id}>
                <div className="ops-subheading"><strong>{flavor.name}</strong><span className="ops-unit-chip">{flavor.unit}</span></div>
                <div className="ops-frozen-fields-grid">
                  <DecimalStepper label="Opening" value={value.opening} disabled={frozenLocked} onChange={(next)=>patchSection("frozen",{[flavor.name]:{...value,opening:next}})}/>
                  <DecimalStepper label="Added" value={value.added} disabled={frozenLocked} onChange={(next)=>patchSection("frozen",{[flavor.name]:{...value,added:next}})}/>
                  <DecimalStepper label="Used" value={value.used} disabled={frozenLocked} onChange={(next)=>patchSection("frozen",{[flavor.name]:{...value,used:next}})}/>
                  <DecimalStepper label="Damaged" value={value.damaged} disabled={frozenLocked} onChange={(next)=>patchSection("frozen",{[flavor.name]:{...value,damaged:next}})}/>
                </div>
                <div className="ops-frozen-summary-row">
                  <div className="ops-expected-chip"><span>Expected closing</span><strong>{expectedClosing}</strong></div>
                  <DecimalStepper label="Actual closing" value={value.actualClosing} disabled={frozenLocked} onChange={(next)=>patchSection("frozen",{[flavor.name]:{...value,actualClosing:next}})}/>
                  <div className={`ops-variance-chip ${variance < 0 ? "negative" : variance > 0 ? "positive" : ""}`}><span>Variance</span><strong>{variance > 0 ? `+${variance}` : variance}</strong></div>
                </div>
                <label><span>Status</span><select value={value.status||"Full"} disabled={frozenLocked} onChange={(event)=>patchSection("frozen",{[flavor.name]:{...value,status:event.target.value}})}>{LEVELS.map((level)=><option key={level}>{level}</option>)}</select></label>
                <input className="ops-note-input" placeholder="Optional note" disabled={frozenLocked} value={value.notes||""} onChange={(event)=>patchSection("frozen",{[flavor.name]:{...value,notes:event.target.value}})}/>
              </div>
            );
          })}
          {activeFlavors.length === 0 && <div className="ops-empty">No active flavors configured for this venue.</div>}
        </div>

        {!frozenLocked && (
          <button type="button" className="ops-primary ops-save" onClick={saveFrozenRecord}><Save size={14}/>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save breakout"}</button>
        )}
        {!canManage && !frozenLocked && (
          <button type="button" className="ops-secondary ops-submit" onClick={submitFrozenBreakout}><CheckCircle2 size={14}/> Submit today's breakout</button>
        )}
        {canManage && workflowStatusKey === "submitted" && (
          <button type="button" className="ops-secondary" onClick={reopenFrozenBreakout}><Unlock size={14}/> Reopen for editing</button>
        )}

        {canManage && (
          <div className="ops-flavor-config">
            <h4>Flavor configuration</h4>
            <div className="ops-flavor-config-list">
              {frozenConfig.map((flavor, index) => (
                <div className={`ops-flavor-config-row ${!flavor.active ? "inactive" : ""}`} key={flavor.id}>
                  <div className="ops-flavor-reorder">
                    <button type="button" disabled={index === 0} onClick={() => moveFlavor(flavor.id, -1)} aria-label={`Move ${flavor.name} up`}><ChevronUp size={13}/></button>
                    <button type="button" disabled={index === frozenConfig.length - 1} onClick={() => moveFlavor(flavor.id, 1)} aria-label={`Move ${flavor.name} down`}><ChevronDown size={13}/></button>
                  </div>
                  <input value={flavor.name} onChange={(event) => renameFlavor(flavor.id, event.target.value)} />
                  <select value={flavor.unit} onChange={(event) => setFlavorUnit(flavor.id, event.target.value)}>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
                  <button type="button" className="ops-flavor-toggle" onClick={() => toggleFlavorActive(flavor.id)}>{flavor.active ? "Deactivate" : "Restore"}</button>
                </div>
              ))}
            </div>
            <div className="ops-inline-add">
              <input value={newFlavorName} placeholder="Add another flavor" onChange={(event) => setNewFlavorName(event.target.value)} />
              <select value={newFlavorUnit} onChange={(event) => setNewFlavorUnit(event.target.value)}>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
              <button type="button" onClick={addFlavor}><Plus size={14}/> Add</button>
            </div>
          </div>
        )}
      </section>}

      {activeTab === "pax" && <section className="ops-panel">
        <div className="ops-panel-heading"><div><h3>Pax Table Dashboard</h3><p>Manual counts support bread and taro-roll preparation. Live counts come from occupied seating tables.</p></div></div>
        <div className="ops-metrics"><div><span>Manual tables</span><strong>{manualTableTotal}</strong></div><div><span>Manual guests</span><strong>{manualPaxTotal}</strong></div><div><span>Live occupied guests</span><strong>{liveGuestTotal}</strong></div></div>
        <div className="ops-pax-layout"><div><h4>Manual table counts</h4>{PAX_SIZES.map((size)=><NumberRow key={size} label={`${size} Pax`} value={current.pax[size]} disabled={false} onChange={(value)=>patchSection("pax",{[size]:value})}/>)}</div><div><h4>Live seating chart</h4><div className="ops-live-pax">{Object.keys(livePax).length===0?<div className="ops-empty">No occupied tables with guest counts yet.</div>:Object.entries(livePax).sort((a,b)=>Number(a[0])-Number(b[0])).map(([size,count])=><div key={size}><span>{size} Pax</span><strong>{count} table{Number(count)===1?"":"s"}</strong></div>)}</div></div></div>
        <button type="button" className="ops-primary ops-save" onClick={saveRecord}><Save size={14}/> Save pax counts</button>
      </section>}

      {activeTab === "history" && <section className="ops-panel"><div className="ops-panel-heading"><div><h3>Daily History</h3><p>Open a date to review or continue its saved counts.</p></div></div><div className="ops-history-list">{Object.keys(history).length===0?<div className="ops-empty">No daily records saved yet.</div>:Object.entries(history).sort(([a],[b])=>b.localeCompare(a)).map(([date,value])=><button type="button" key={date} onClick={()=>onDateChange(date)}><span><strong>{formatDate(date)}</strong><small>Updated by {value.updatedByName||"employee"}</small></span><span>{Object.values(value.cloths||{}).reduce((sum,item)=>sum+Number(item||0),0)} cloths</span></button>)}</div></section>}

      {saveState === "error" && <div className="ops-error">Unable to save. Check the Firebase connection and permissions.</div>}
    </div>
  );
}
