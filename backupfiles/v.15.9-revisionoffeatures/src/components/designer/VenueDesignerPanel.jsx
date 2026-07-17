import { useEffect, useMemo, useRef, useState } from "react";
import DailySetupGenerator from "./DailySetupGenerator";
import {
  Copy,
  Download,
  Grid3X3,
  HelpCircle,
  ImagePlus,
  Layers3,
  Maximize2,
  RotateCcw,
  Save,
  Lock,
  Unlock,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const TABLE_TYPES = [
  ["regular", "Regular"],
  ["alii_luau", "Aliʻi Luau"],
  ["luau", "Luau"],
  ["super_ambassadors", "Super Ambassadors"],
  ["gateway_regular", "Gateway Regular"],
  ["vip", "VIP"],
];

const COUNT_PRESETS = [2, 4, 6, 8, 10];
const WORKSPACE_PRESETS = [
  [4200, 2800, "Hale ʻOhana"],
  [7200, 4800, "Hale Aloha"],
  [11000, 7000, "Gateway"],
  [16000, 10000, "Extra large"],
  [100000, 60000, "Gateway unlimited"],
];

function Modal({ title, children, onClose, actions }) {
  return (
    <div className="designer-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="designer-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header><h3>{title}</h3><button type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></header>
        <div className="designer-modal-body">{children}</div>
        {actions && <footer>{actions}</footer>}
      </section>
    </div>
  );
}

export default function VenueDesignerPanel({
  venueId,
  venueName,
  areas,
  selectedAreaId,
  tables,
  canManage,
  canvasWidth,
  canvasHeight,
  onResizeCanvas,
  onSelectArea,
  onSelectTable,
  onGenerateTables,
  onGenerateDailyTables,
  onDuplicateAreaWithTables,
  onExportLayout,
  onImportLayout,
  onResetVenue,
  onSaveLayout,
  onToggleLayoutLock,
  onResetTodaysTables,
  layoutLocked = false,
  layoutSavedAt = null,
  onClearTables,
  blueprint,
  onBlueprintChange,
}) {
  const fileInputRef = useRef(null);
  const blueprintInputRef = useRef(null);
  const [form, setForm] = useState({ areaId: selectedAreaId || areas.find((area) => (area.areaKind ?? "seating") === "seating")?.id || "", count: 4, customCount: "", countMode: "preset", capacity: 4, startingNumber: 1, tableType: "regular", tableSize: 34, replaceAreaTables: false });
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [canvasDraft, setCanvasDraft] = useState({ width: canvasWidth, height: canvasHeight });

  useEffect(() => { if (selectedAreaId) setForm((current) => ({ ...current, areaId: selectedAreaId })); }, [selectedAreaId]);
  useEffect(() => setCanvasDraft({ width: canvasWidth, height: canvasHeight }), [canvasWidth, canvasHeight]);

  const seatingAreas = useMemo(() => areas.filter((area) => (area.areaKind ?? "seating") === "seating" && !area.hidden), [areas]);
  useEffect(() => {
    if (seatingAreas.length === 0) return;
    if (!seatingAreas.some((area) => area.id === form.areaId)) {
      setForm((current) => ({ ...current, areaId: seatingAreas[0].id }));
      onSelectArea?.(seatingAreas[0].id);
    }
  }, [form.areaId, onSelectArea, seatingAreas]);
  const selectedArea = useMemo(() => areas.find((area) => area.id === form.areaId) || null, [areas, form.areaId]);
  const visibleTableCount = tables.filter((table) => !(table.childIds && table.childIds.length)).length;
  const patch = (next) => setForm((current) => ({ ...current, ...next }));
  const effectiveCount = Math.max(1, Math.min(100, form.countMode === "custom" ? (Number(form.customCount) || 1) : (Number(form.count) || 1)));

  const runGenerate = () => {
    const result = onGenerateTables?.({ ...form, count: effectiveCount });
    setModal(null);
    setMessage(result?.message || (result?.ok ? `${result.count} tables created.` : "Unable to generate tables."));
    if (result?.ok) {
      patch({ startingNumber: result.nextStartingNumber });
      if (result.tableIds?.[0]) onSelectTable?.(result.tableIds[0]);
      setModal({ type: "success", result });
    }
  };

  const duplicate = () => {
    const result = onDuplicateAreaWithTables?.(form.areaId);
    setMessage(result?.message || "Area duplicated.");
    if (result?.areaId) { patch({ areaId: result.areaId }); onSelectArea?.(result.areaId); }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = onImportLayout?.(JSON.parse(await file.text()));
      setMessage(result?.message || "Layout imported.");
    } catch (error) {
      console.error(error);
      setMessage("Import failed. Choose a valid PCC venue-layout JSON file.");
    }
  };

  const handleBlueprint = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage("Choose a PNG, JPG, or WEBP blueprint image."); return; }
    if (file.size > 8 * 1024 * 1024) { setMessage("Blueprint must be smaller than 8 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { onBlueprintChange?.({ dataUrl: String(reader.result), visible: true, opacity: 0.28 }); setMessage("Blueprint loaded for tracing. It stays behind areas and tables."); };
    reader.readAsDataURL(file);
  };

  const applyCanvas = () => {
    onResizeCanvas?.({ width: Math.max(1200, Math.min(200000, Number(canvasDraft.width) || canvasWidth)), height: Math.max(900, Math.min(200000, Number(canvasDraft.height) || canvasHeight)) });
    setMessage("Workspace resized. The canvas also expands automatically when objects approach an edge.");
  };

  return (
    <div className="designer-panel">
      <DailySetupGenerator
        venueId={venueId}
        venueName={venueName}
        canManage={canManage}
        layoutLocked={layoutLocked}
        onGenerate={onGenerateDailyTables}
      />

      <section className="designer-section">
        <div className="designer-section-title"><strong>Expandable workspace</strong><span>{canvasWidth} × {canvasHeight}</span></div>
        <p className="designer-small-copy">Drag areas or tables toward the right or bottom and the workspace expands automatically. Shift-drag or middle-mouse drag pans the view.</p>
        <div className="designer-workspace-presets">{WORKSPACE_PRESETS.map(([width, height, label]) => <button type="button" key={label} onClick={() => setCanvasDraft({ width, height })}>{label}<small>{width} × {height}</small></button>)}</div>
        <div className="designer-grid-two"><label className="designer-field"><span>Width</span><input type="number" min="1200" max="200000" step="500" value={canvasDraft.width} onChange={(event) => setCanvasDraft((current) => ({ ...current, width: Number(event.target.value) }))} /></label><label className="designer-field"><span>Height</span><input type="number" min="900" max="200000" step="500" value={canvasDraft.height} onChange={(event) => setCanvasDraft((current) => ({ ...current, height: Number(event.target.value) }))} /></label></div>
        <div className="designer-action-grid"><button type="button" onClick={() => setCanvasDraft({ width: canvasWidth + 2000, height: canvasHeight + 1200 })}>Add workspace</button><button type="button" onClick={() => setCanvasDraft({ width: Math.max(canvasWidth, 16000), height: Math.max(canvasHeight, 10000) })}>Huge venue</button></div>
        <button type="button" className="workspace-secondary-action" disabled={!canManage || layoutLocked} onClick={applyCanvas}><Maximize2 size={14} /> Apply workspace size</button>
      </section>

      <section className="designer-section">
        <div className="designer-section-title"><strong>Optional blueprint tracing</strong><span>Manual drawing supported</span></div>
        <p className="designer-small-copy">Upload a map only as a faint locked reference. You can ignore obstacles and manually draw only the seating areas and useful landmarks.</p>
        <button type="button" className="workspace-secondary-action" disabled={!canManage || layoutLocked} onClick={() => blueprintInputRef.current?.click()}><ImagePlus size={14} /> Import blueprint image</button>
        <input ref={blueprintInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={handleBlueprint} />
        {blueprint?.dataUrl && <div className="blueprint-controls"><label><span>Opacity</span><input type="range" min="0.05" max="0.8" step="0.05" value={blueprint.opacity ?? 0.28} onChange={(event) => onBlueprintChange?.({ opacity: Number(event.target.value) })} /></label><label className="designer-check-row"><input type="checkbox" checked={blueprint.visible !== false} onChange={(event) => onBlueprintChange?.({ visible: event.target.checked })} />Show blueprint</label><button type="button" onClick={() => onBlueprintChange?.({ dataUrl: null })}>Remove image</button></div>}
      </section>

      <section className="designer-section daily-mode-compact">
        <div className="designer-section-title"><strong>Daily Mode</strong><span>{layoutLocked ? "Layout locked" : "Layout editable"}</span></div>
        <p className="designer-small-copy">Use these controls during daily operations without leaving the Designer.</p>
        <div className="daily-mode-actions">
          <button type="button" className="workspace-secondary-action" disabled={!canManage || layoutLocked} onClick={onSaveLayout}><Save size={14} /> Save Layout</button>
          <button type="button" className="workspace-secondary-action" disabled={!canManage} onClick={onToggleLayoutLock}>{layoutLocked ? <Unlock size={14} /> : <Lock size={14} />} {layoutLocked ? "Unlock Layout" : "Lock Layout"}</button>
          <button type="button" className="designer-danger-action" disabled={!canManage} onClick={onResetTodaysTables}><Trash2 size={14} /> Reset Today&apos;s Tables</button>
        </div>
        <small className="daily-mode-status">{layoutSavedAt ? `Saved baseline: ${new Date(layoutSavedAt).toLocaleString()}` : "No saved layout baseline yet. Save the approved layout before using Reset Today’s Tables."}</small>
      </section>

      <section className="designer-section">
        <div className="designer-section-title"><strong>Area and backup tools</strong><span>{visibleTableCount} tables</span></div>
        <button type="button" className="workspace-secondary-action" disabled={!canManage || layoutLocked || !form.areaId} onClick={duplicate}><Copy size={14} /> Duplicate selected area with tables</button>
        <div className="designer-action-grid"><button type="button" disabled={!canManage} onClick={onExportLayout}><Download size={14} /> Export</button><button type="button" disabled={!canManage || layoutLocked} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Import</button></div>
        <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={handleImport} />
        
        <button type="button" className="designer-danger-action" disabled={!canManage || layoutLocked || visibleTableCount === 0} onClick={onClearTables}><X size={14} /> Delete all venue tables</button>
        <button type="button" className="designer-danger-action" disabled={!canManage || layoutLocked} onClick={onResetVenue}><RotateCcw size={14} /> Reset venue layout</button>
      </section>

      {message && <div className="designer-message" role="status">{message}</div>}
      <div className="designer-note"><Layers3 size={15} /><span>Seating areas accept tables. Landmark areas such as Stage, Restroom, Drinks, Buffet, Entrance, and Exit are map references only.</span></div>

      
      {modal?.type === "success" && <Modal title="Tables created" onClose={() => setModal(null)} actions={<button type="button" className="gold-primary" onClick={() => setModal(null)}>Done</button>}><p><strong>{modal.result.count} tables</strong> were added to <strong>{modal.result.areaLabel}</strong>. The first table is selected and all new tables remain independently draggable.</p></Modal>}
      {modal?.type === "help" && <Modal title="How to design a venue" onClose={() => setModal(null)} actions={<button type="button" className="gold-primary" onClick={() => setModal(null)}>Got it</button>}><ol className="designer-help-steps"><li>Use Areas to draw seating regions or map landmarks.</li><li>Landmarks show Stage, Restroom, Drinks, Buffet, Entrance, Exit, or another station but never receive guests.</li><li>Drag toward the workspace edge—the canvas expands automatically.</li><li>Use Shift-drag or the middle mouse button to pan.</li><li>Optionally import a blueprint at low opacity, trace the useful areas, then hide or remove it.</li><li>Generate tables only inside seating areas.</li></ol><div className="designer-example"><strong>Gateway example</strong><span>Select the Huge Venue preset, draw the major seating sections, add Stage/Drinks/Buffet landmarks, then generate tables per section.</span></div></Modal>}
    </div>
  );
}
