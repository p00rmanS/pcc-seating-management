import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Grid3X3,
  HelpCircle,
  ImagePlus,
  Layers3,
  Maximize2,
  RotateCcw,
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
  onDuplicateAreaWithTables,
  onExportLayout,
  onImportLayout,
  onResetVenue,
  onSaveLayout,
  onClearTables,
  blueprint,
  onBlueprintChange,
}) {
  const fileInputRef = useRef(null);
  const blueprintInputRef = useRef(null);
  const [form, setForm] = useState({ areaId: selectedAreaId || areas.find((area) => (area.areaKind ?? "seating") === "seating")?.id || "", count: 4, customCount: 12, capacity: 4, startingNumber: 1, tableType: "regular", tableSize: 34, replaceAreaTables: false });
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
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
  const effectiveCount = Math.max(1, Math.min(100, Number(form.count) || Number(form.customCount) || 1));

  const runGenerate = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (isGenerating) return;
    if (!canManage) {
      setMessage("Your account does not have permission to generate tables.");
      return;
    }

    const targetAreaId = form.areaId || seatingAreas[0]?.id || "";
    if (!targetAreaId) {
      setMessage("Create or select a seating area before generating tables.");
      return;
    }

    setIsGenerating(true);
    setMessage("Generating tables…");

    try {
      const result = await Promise.resolve(
        onGenerateTables?.({ ...form, areaId: targetAreaId, count: effectiveCount })
      );

      if (!result) {
        setMessage("The table generator did not return a result. Please try again.");
        return;
      }

      setMessage(
        result.message ||
          (result.ok
            ? `${result.count} tables created in ${result.areaLabel}.`
            : "Unable to generate tables.")
      );

      if (result.ok) {
        patch({ areaId: targetAreaId, startingNumber: result.nextStartingNumber });
        onSelectArea?.(targetAreaId);
        if (result.tableIds?.[0]) onSelectTable?.(result.tableIds[0]);
        setModal({ type: "success", result });
      }
    } catch (error) {
      console.error("Bulk table generation failed:", error);
      setMessage(`Generator error: ${error?.message || "Unknown error"}`);
    } finally {
      setIsGenerating(false);
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
      <div className="designer-heading">
        <div><h2><Grid3X3 size={15} /> Quick Table Generator</h2><p>Choose a seating area, amount, capacity, and category. Landmarks cannot receive guest tables.</p></div>
        <button type="button" className="designer-help-button" onClick={() => setModal({ type: "help" })}><HelpCircle size={15} /> Help</button>
      </div>

      <section className="designer-section">
        <label className="designer-field designer-field-wide"><span>Seating area</span><select value={form.areaId} onChange={(event) => { patch({ areaId: event.target.value }); onSelectArea?.(event.target.value || null); }}><option value="">Choose a seating area</option>{seatingAreas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}</select></label>
        <div className="designer-section-title"><strong>How many tables?</strong><span>{effectiveCount} selected</span></div>
        <div className="designer-count-buttons">{COUNT_PRESETS.map((count) => <button type="button" key={count} className={Number(form.count) === count ? "active" : ""} onClick={() => patch({ count })}>{count}</button>)}</div>
        <label className="designer-field designer-field-wide"><span>Custom amount</span><div className="designer-inline-field"><input type="number" min="1" max="100" value={form.customCount} onChange={(event) => patch({ customCount: Number(event.target.value) || 1, count: Number(event.target.value) || 1 })} /><small>Use 12, 16, 20, 24, or any other amount.</small></div></label>
        <div className="designer-grid-two">
          <label className="designer-field"><span>Seats per table</span><input type="number" min="1" max="300" value={form.capacity} onChange={(event) => patch({ capacity: Number(event.target.value) || 1 })} /></label>
          <label className="designer-field"><span>Starting table #</span><input type="number" min="0" value={form.startingNumber} onChange={(event) => patch({ startingNumber: Number(event.target.value) || 0 })} /></label>
          <fieldset className="designer-field designer-field-wide designer-category-field">
            <legend>Table category</legend>
            <div className="designer-category-grid">
              {TABLE_TYPES.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={form.tableType === value ? "active" : ""}
                  aria-pressed={form.tableType === value}
                  onClick={() => patch({ tableType: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="designer-field designer-field-wide"><span>Visual size</span><select value={form.tableSize} onChange={(event) => patch({ tableSize: Number(event.target.value) })}><option value="28">Compact</option><option value="34">Standard</option><option value="42">Large</option><option value="52">Extra large</option></select></label>
        </div>
        <label className="designer-check-row"><input type="checkbox" checked={form.replaceAreaTables} onChange={(event) => patch({ replaceAreaTables: event.target.checked })} />Replace existing unsplit tables in this area</label>
        <div className="designer-preview-card"><span>Area</span><strong>{selectedArea?.label || "Not selected"}</strong><span>Tables</span><strong>{effectiveCount}</strong><span>Capacity</span><strong>{form.capacity} each</strong></div>
        <div className="designer-generate-action">
          <button
            type="button"
            className="workspace-primary-action"
            disabled={isGenerating}
            onClick={runGenerate}
          >
            <Grid3X3 size={14} />
            {isGenerating ? "Generating…" : `Generate ${effectiveCount} tables now`}
          </button>
          {!form.areaId && seatingAreas.length > 0 && (
            <small>The first seating area will be selected automatically.</small>
          )}
        </div>
      </section>

      <section className="designer-section">
        <div className="designer-section-title"><strong>Expandable workspace</strong><span>{canvasWidth} × {canvasHeight}</span></div>
        <p className="designer-small-copy">Drag areas or tables toward the right or bottom and the workspace expands automatically. Shift-drag or middle-mouse drag pans the view.</p>
        <div className="designer-workspace-presets">{WORKSPACE_PRESETS.map(([width, height, label]) => <button type="button" key={label} onClick={() => setCanvasDraft({ width, height })}>{label}<small>{width} × {height}</small></button>)}</div>
        <div className="designer-grid-two"><label className="designer-field"><span>Width</span><input type="number" min="1200" max="200000" step="500" value={canvasDraft.width} onChange={(event) => setCanvasDraft((current) => ({ ...current, width: Number(event.target.value) }))} /></label><label className="designer-field"><span>Height</span><input type="number" min="900" max="200000" step="500" value={canvasDraft.height} onChange={(event) => setCanvasDraft((current) => ({ ...current, height: Number(event.target.value) }))} /></label></div>
        <div className="designer-action-grid"><button type="button" onClick={() => setCanvasDraft({ width: canvasWidth + 2000, height: canvasHeight + 1200 })}>Add workspace</button><button type="button" onClick={() => setCanvasDraft({ width: Math.max(canvasWidth, 16000), height: Math.max(canvasHeight, 10000) })}>Huge venue</button></div>
        <button type="button" className="workspace-secondary-action" disabled={!canManage} onClick={applyCanvas}><Maximize2 size={14} /> Apply workspace size</button>
      </section>

      <section className="designer-section">
        <div className="designer-section-title"><strong>Optional blueprint tracing</strong><span>Manual drawing supported</span></div>
        <p className="designer-small-copy">Upload a map only as a faint locked reference. You can ignore obstacles and manually draw only the seating areas and useful landmarks.</p>
        <button type="button" className="workspace-secondary-action" disabled={!canManage} onClick={() => blueprintInputRef.current?.click()}><ImagePlus size={14} /> Import blueprint image</button>
        <input ref={blueprintInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={handleBlueprint} />
        {blueprint?.dataUrl && <div className="blueprint-controls"><label><span>Opacity</span><input type="range" min="0.05" max="0.8" step="0.05" value={blueprint.opacity ?? 0.28} onChange={(event) => onBlueprintChange?.({ opacity: Number(event.target.value) })} /></label><label className="designer-check-row"><input type="checkbox" checked={blueprint.visible !== false} onChange={(event) => onBlueprintChange?.({ visible: event.target.checked })} />Show blueprint</label><button type="button" onClick={() => onBlueprintChange?.({ dataUrl: null })}>Remove image</button></div>}
      </section>

      <section className="designer-section">
        <div className="designer-section-title"><strong>Area and backup tools</strong><span>{visibleTableCount} tables</span></div>
        <button type="button" className="workspace-secondary-action" disabled={!canManage || !form.areaId} onClick={duplicate}><Copy size={14} /> Duplicate selected area with tables</button>
        <div className="designer-action-grid"><button type="button" disabled={!canManage} onClick={onExportLayout}><Download size={14} /> Export</button><button type="button" disabled={!canManage} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Import</button></div>
        <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={handleImport} />
        <button type="button" className="workspace-secondary-action" disabled={!canManage} onClick={onSaveLayout}><Download size={14} /> Save daily layout snapshot</button>
        <button type="button" className="designer-danger-action" disabled={!canManage || visibleTableCount === 0} onClick={onClearTables}><X size={14} /> Delete all venue tables</button>
        <button type="button" className="designer-danger-action" disabled={!canManage} onClick={onResetVenue}><RotateCcw size={14} /> Reset venue layout</button>
      </section>

      {message && <div className="designer-message" role="status">{message}</div>}
      <div className="designer-note"><Layers3 size={15} /><span>Seating areas accept tables. Landmark areas such as Stage, Restroom, Drinks, Buffet, Entrance, and Exit are map references only.</span></div>

      
      {modal?.type === "success" && <Modal title="Tables created" onClose={() => setModal(null)} actions={<button type="button" className="gold-primary" onClick={() => setModal(null)}>Done</button>}><p><strong>{modal.result.count} tables</strong> were added to <strong>{modal.result.areaLabel}</strong>. The first table is selected and all new tables remain independently draggable.</p></Modal>}
      {modal?.type === "help" && <Modal title="How to design a venue" onClose={() => setModal(null)} actions={<button type="button" className="gold-primary" onClick={() => setModal(null)}>Got it</button>}><ol className="designer-help-steps"><li>Use Areas to draw seating regions or map landmarks.</li><li>Landmarks show Stage, Restroom, Drinks, Buffet, Entrance, Exit, or another station but never receive guests.</li><li>Drag toward the workspace edge—the canvas expands automatically.</li><li>Use Shift-drag or the middle mouse button to pan.</li><li>Optionally import a blueprint at low opacity, trace the useful areas, then hide or remove it.</li><li>Generate tables only inside seating areas.</li></ol><div className="designer-example"><strong>Gateway example</strong><span>Select the Huge Venue preset, draw the major seating sections, add Stage/Drinks/Buffet landmarks, then generate tables per section.</span></div></Modal>}
    </div>
  );
}
