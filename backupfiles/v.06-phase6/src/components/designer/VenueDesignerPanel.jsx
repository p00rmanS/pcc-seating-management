import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Grid3X3,
  HelpCircle,
  Layers3,
  Maximize2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

const TABLE_TYPES = [
  ["regular", "Regular"],
  ["alii_luau", "Aliʻi Luau"],
  ["super", "Super"],
  ["ambassador", "Ambassador"],
  ["gateway_regular", "Regular Gateway"],
  ["vip", "VIP"],
  ["luau", "Luau"],
];

const COUNT_PRESETS = [2, 4, 6, 8, 10];

function Modal({ title, children, onClose, actions }) {
  return (
    <div className="designer-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="designer-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>
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
}) {
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    areaId: selectedAreaId || areas[0]?.id || "",
    count: 4,
    customCount: 12,
    capacity: 4,
    startingNumber: 1,
    tableType: "regular",
    tableSize: 34,
    replaceAreaTables: false,
  });
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [canvasDraft, setCanvasDraft] = useState({ width: canvasWidth, height: canvasHeight });

  useEffect(() => {
    if (selectedAreaId) setForm((current) => ({ ...current, areaId: selectedAreaId }));
  }, [selectedAreaId]);

  useEffect(() => setCanvasDraft({ width: canvasWidth, height: canvasHeight }), [canvasWidth, canvasHeight]);

  const selectedArea = useMemo(() => areas.find((area) => area.id === form.areaId) || null, [areas, form.areaId]);
  const visibleTableCount = tables.filter((table) => !(table.childIds && table.childIds.length)).length;
  const patch = (next) => setForm((current) => ({ ...current, ...next }));
  const effectiveCount = Math.max(1, Math.min(100, Number(form.count) || Number(form.customCount) || 1));

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
    if (result?.areaId) {
      patch({ areaId: result.areaId });
      onSelectArea?.(result.areaId);
    }
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

  const applyCanvas = () => {
    onResizeCanvas?.({
      width: Math.max(800, Math.min(6000, Number(canvasDraft.width) || canvasWidth)),
      height: Math.max(600, Math.min(4000, Number(canvasDraft.height) || canvasHeight)),
    });
    setMessage("Designer canvas resized. Use the scrollbars to reach the new space.");
  };

  return (
    <div className="designer-panel">
      <div className="designer-heading">
        <div>
          <h2><Grid3X3 size={15} /> Quick Table Generator</h2>
          <p>Choose an area, amount, capacity, and category. A confirmation appears before anything is created.</p>
        </div>
        <button type="button" className="designer-help-button" onClick={() => setModal({ type: "help" })}><HelpCircle size={15} /> Help</button>
      </div>

      <section className="designer-section">
        <label className="designer-field designer-field-wide">
          <span>Area</span>
          <select value={form.areaId} onChange={(event) => { patch({ areaId: event.target.value }); onSelectArea?.(event.target.value || null); }}>
            <option value="">Choose an area</option>
            {areas.filter((area) => !area.hidden).map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select>
        </label>

        <div className="designer-section-title"><strong>How many tables?</strong><span>{effectiveCount} selected</span></div>
        <div className="designer-count-buttons">
          {COUNT_PRESETS.map((count) => <button type="button" key={count} className={Number(form.count) === count ? "active" : ""} onClick={() => patch({ count })}>{count}</button>)}
        </div>
        <label className="designer-field designer-field-wide">
          <span>Custom amount</span>
          <div className="designer-inline-field">
            <input type="number" min="1" max="100" value={form.customCount} onChange={(event) => patch({ customCount: Number(event.target.value) || 1, count: Number(event.target.value) || 1 })} />
            <small>Use for 12, 16, 20, 24, or any other amount.</small>
          </div>
        </label>

        <div className="designer-grid-two">
          <label className="designer-field"><span>Seats per table</span><input type="number" min="1" max="200" value={form.capacity} onChange={(e) => patch({ capacity: Number(e.target.value) || 1 })} /></label>
          <label className="designer-field"><span>Starting table #</span><input type="number" min="0" value={form.startingNumber} onChange={(e) => patch({ startingNumber: Number(e.target.value) || 0 })} /></label>
          <label className="designer-field designer-field-wide"><span>Table category</span><select value={form.tableType} onChange={(e) => patch({ tableType: e.target.value })}>{TABLE_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="designer-field designer-field-wide"><span>Visual size</span><select value={form.tableSize} onChange={(e) => patch({ tableSize: Number(e.target.value) })}><option value="28">Compact</option><option value="34">Standard</option><option value="42">Large</option><option value="52">Extra large</option></select></label>
        </div>

        <label className="designer-check-row"><input type="checkbox" checked={form.replaceAreaTables} onChange={(e) => patch({ replaceAreaTables: e.target.checked })} />Replace existing unsplit tables in this area</label>

        <div className="designer-preview-card"><span>Area</span><strong>{selectedArea?.label || "Not selected"}</strong><span>Tables</span><strong>{effectiveCount}</strong><span>Capacity</span><strong>{form.capacity} each</strong></div>
        <div className="designer-sticky-action">
          <button type="button" className="workspace-primary-action" disabled={!canManage || !form.areaId} onClick={() => setModal({ type: "confirm" })}><Grid3X3 size={14} /> Review and generate {effectiveCount}</button>
        </div>
      </section>

      <section className="designer-section">
        <div className="designer-section-title"><strong>Canvas size</strong><span>{canvasWidth} × {canvasHeight}</span></div>
        <p className="designer-small-copy">Make the designer wider or taller, then use the horizontal and vertical scrollbars in the floor workspace.</p>
        <div className="designer-grid-two">
          <label className="designer-field"><span>Width</span><input type="number" min="800" max="6000" step="100" value={canvasDraft.width} onChange={(e) => setCanvasDraft((current) => ({ ...current, width: Number(e.target.value) }))} /></label>
          <label className="designer-field"><span>Height</span><input type="number" min="600" max="4000" step="100" value={canvasDraft.height} onChange={(e) => setCanvasDraft((current) => ({ ...current, height: Number(e.target.value) }))} /></label>
        </div>
        <div className="designer-action-grid">
          <button type="button" onClick={() => setCanvasDraft({ width: Math.max(canvasWidth, 1800), height: Math.max(canvasHeight, 1200) })}>Wide preset</button>
          <button type="button" onClick={() => setCanvasDraft({ width: canvasWidth + 400, height: canvasHeight + 300 })}>Expand canvas</button>
        </div>
        <button type="button" className="workspace-secondary-action" disabled={!canManage} onClick={applyCanvas}><Maximize2 size={14} /> Apply canvas size</button>
      </section>

      <section className="designer-section">
        <div className="designer-section-title"><strong>Area and backup tools</strong><span>{visibleTableCount} tables</span></div>
        <button type="button" className="workspace-secondary-action" disabled={!canManage || !form.areaId} onClick={duplicate}><Copy size={14} /> Duplicate selected area with tables</button>
        <div className="designer-action-grid"><button type="button" disabled={!canManage} onClick={onExportLayout}><Download size={14} /> Export</button><button type="button" disabled={!canManage} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Import</button></div>
        <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={handleImport} />
        <button type="button" className="designer-danger-action" disabled={!canManage} onClick={onResetVenue}><RotateCcw size={14} /> Reset venue layout</button>
      </section>

      {message && <div className="designer-message" role="status">{message}</div>}
      <div className="designer-note"><Layers3 size={15} /><span>Generated tables start inside the selected area, but remain separate, clickable, resizable, and draggable.</span></div>

      {modal?.type === "confirm" && (
        <Modal title="Confirm table generation" onClose={() => setModal(null)} actions={<><button type="button" onClick={() => setModal(null)}>Cancel</button><button type="button" className="gold-primary" onClick={runGenerate}>Generate tables</button></>}>
          <div className="designer-confirm-grid"><span>Venue</span><strong>{venueName}</strong><span>Area</span><strong>{selectedArea?.label}</strong><span>Tables</span><strong>{effectiveCount}</strong><span>Seats each</span><strong>{form.capacity}</strong><span>Category</span><strong>{TABLE_TYPES.find(([value]) => value === form.tableType)?.[1]}</strong></div>
        </Modal>
      )}

      {modal?.type === "success" && (
        <Modal title="Tables created" onClose={() => setModal(null)} actions={<button type="button" className="gold-primary" onClick={() => setModal(null)}>Done</button>}>
          <p><strong>{modal.result.count} tables</strong> were added to <strong>{modal.result.areaLabel}</strong>. The first new table is selected in the Inspector and all new tables are draggable.</p>
        </Modal>
      )}

      {modal?.type === "help" && (
        <Modal title="How to generate tables" onClose={() => setModal(null)} actions={<button type="button" className="gold-primary" onClick={() => setModal(null)}>Got it</button>}>
          <ol className="designer-help-steps">
            <li>Select the area where the tables should begin.</li>
            <li>Choose 2, 4, 6, 8, 10—or type a custom amount such as 16 or 24.</li>
            <li>Enter seats per table and the first table number.</li>
            <li>Choose the table category and visual size.</li>
            <li>Review the summary, then confirm. New tables appear on the floor and remain movable.</li>
          </ol>
          <div className="designer-example"><strong>Example</strong><span>Area: Orchid · 8 tables · 4 seats · starting at 101 · Aliʻi Luau</span></div>
        </Modal>
      )}
    </div>
  );
}
