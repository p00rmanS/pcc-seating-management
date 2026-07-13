import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Grid3X3, Layers3, RotateCcw, Upload } from "lucide-react";

const TABLE_TYPES = [
  ["regular", "Regular"],
  ["alii_luau", "Aliʻi Luau"],
  ["luau", "Luau"],
  ["super", "Super"],
  ["ambassador", "Ambassador"],
  ["gateway_regular", "Gateway Regular"],
];

export default function VenueDesignerPanel({
  venueName,
  areas,
  selectedAreaId,
  tables,
  canManage,
  onSelectArea,
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
    capacity: 4,
    startingNumber: 1,
    tableType: "regular",
    tableSize: 36,
    replaceAreaTables: false,
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selectedAreaId) setForm((current) => ({ ...current, areaId: selectedAreaId }));
  }, [selectedAreaId]);

  const selectedArea = useMemo(() => areas.find((area) => area.id === form.areaId) || null, [areas, form.areaId]);
  const visibleTableCount = tables.filter((table) => !(table.childIds && table.childIds.length)).length;
  const patch = (next) => setForm((current) => ({ ...current, ...next }));

  const generate = () => {
    const result = onGenerateTables?.(form);
    setMessage(result?.message || (result?.ok ? `${result.count} tables created.` : "Unable to generate tables."));
    if (result?.ok) patch({ startingNumber: result.nextStartingNumber });
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

  return (
    <div className="designer-panel">
      <div className="designer-heading">
        <div>
          <h2><Grid3X3 size={15} /> Quick Table Generator</h2>
          <p>Select an area, choose how many tables, then generate. Tables stay fully independent and draggable.</p>
        </div>
        <span>{venueName}</span>
      </div>

      <section className="designer-section">
        <label className="designer-field designer-field-wide">
          <span>Area</span>
          <select value={form.areaId} onChange={(event) => { patch({ areaId: event.target.value }); onSelectArea?.(event.target.value || null); }}>
            <option value="">Choose an area</option>
            {areas.filter((area) => !area.hidden).map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select>
        </label>

        <div className="designer-section-title"><strong>How many tables?</strong><span>{form.count} selected</span></div>
        <div className="designer-count-buttons">
          {[2,4,6,8,10].map((count) => <button type="button" key={count} className={form.count === count ? "active" : ""} onClick={() => patch({ count })}>{count}</button>)}
        </div>

        <div className="designer-grid-two">
          <label className="designer-field"><span>Seats per table</span><input type="number" min="1" max="100" value={form.capacity} onChange={(e) => patch({ capacity: Number(e.target.value) || 1 })} /></label>
          <label className="designer-field"><span>Starting table #</span><input type="number" min="0" value={form.startingNumber} onChange={(e) => patch({ startingNumber: Number(e.target.value) || 0 })} /></label>
          <label className="designer-field designer-field-wide"><span>Table category</span><select value={form.tableType} onChange={(e) => patch({ tableType: e.target.value })}>{TABLE_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="designer-field designer-field-wide"><span>Visual size</span><select value={form.tableSize} onChange={(e) => patch({ tableSize: Number(e.target.value) })}><option value="30">Small</option><option value="36">Medium</option><option value="44">Large</option></select></label>
        </div>

        <label className="designer-check-row"><input type="checkbox" checked={form.replaceAreaTables} onChange={(e) => patch({ replaceAreaTables: e.target.checked })} />Replace existing unsplit tables in this area</label>

        <div className="designer-preview-card"><span>Area</span><strong>{selectedArea?.label || "Not selected"}</strong><span>Tables</span><strong>{form.count}</strong><span>Capacity</span><strong>{form.capacity} each</strong></div>
        <button type="button" className="workspace-primary-action" disabled={!canManage || !form.areaId} onClick={generate}><Grid3X3 size={14} /> Generate {form.count} tables</button>
      </section>

      <section className="designer-section">
        <div className="designer-section-title"><strong>Area and backup tools</strong><span>{visibleTableCount} tables</span></div>
        <button type="button" className="workspace-secondary-action" disabled={!canManage || !form.areaId} onClick={duplicate}><Copy size={14} /> Duplicate selected area with tables</button>
        <div className="designer-action-grid"><button type="button" disabled={!canManage} onClick={onExportLayout}><Download size={14} /> Export</button><button type="button" disabled={!canManage} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Import</button></div>
        <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={handleImport} />
        <button type="button" className="designer-danger-action" disabled={!canManage} onClick={onResetVenue}><RotateCcw size={14} /> Reset venue layout</button>
      </section>

      {message && <div className="designer-message" role="status">{message}</div>}
      <div className="designer-note"><Layers3 size={15} /><span>Generated tables are placed inside the area only as a starting position. They are not attached to the area and remain draggable.</span></div>
    </div>
  );
}
