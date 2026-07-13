import { useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Grid3X3,
  Layers3,
  RotateCcw,
  Upload,
} from "lucide-react";

const DEFAULT_FORM = {
  areaId: "",
  rows: 2,
  columns: 4,
  startingNumber: 1,
  increment: 1,
  capacity: 4,
  tableType: "regular",
  horizontalGap: 18,
  verticalGap: 18,
  offsetX: 18,
  offsetY: 42,
  replaceAreaTables: false,
};

function NumberField({ label, value, min = 0, max, onChange }) {
  return (
    <label className="designer-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

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
  const [form, setForm] = useState(() => ({
    ...DEFAULT_FORM,
    areaId: selectedAreaId || areas[0]?.id || "",
  }));
  const [message, setMessage] = useState("");

  const selectedArea = useMemo(
    () => areas.find((area) => area.id === form.areaId) || null,
    [areas, form.areaId]
  );

  const visibleTableCount = useMemo(
    () => tables.filter((table) => !(table.childIds && table.childIds.length)).length,
    [tables]
  );

  const generatedCount = Math.max(0, Number(form.rows) || 0) * Math.max(0, Number(form.columns) || 0);

  const patchForm = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submitGenerator = () => {
    setMessage("");
    const result = onGenerateTables?.({ ...form });
    if (result?.ok) {
      setMessage(`${result.count} tables created in ${result.areaLabel}.`);
      patchForm({ startingNumber: result.nextStartingNumber });
      return;
    }
    setMessage(result?.message || "Unable to generate tables.");
  };

  const duplicateArea = () => {
    if (!form.areaId) {
      setMessage("Select an area first.");
      return;
    }
    const result = onDuplicateAreaWithTables?.(form.areaId);
    setMessage(result?.message || "Area duplicated.");
    if (result?.areaId) {
      patchForm({ areaId: result.areaId });
      onSelectArea?.(result.areaId);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const result = onImportLayout?.(payload);
      setMessage(result?.message || "Layout imported.");
    } catch (error) {
      console.error("Unable to import layout:", error);
      setMessage("Import failed. Choose a valid PCC venue-layout JSON file.");
    }
  };

  return (
    <div className="designer-panel">
      <div className="designer-heading">
        <div>
          <h2><Grid3X3 size={15} /> Venue Designer</h2>
          <p>Generate table grids, duplicate complete areas, and back up the active venue.</p>
        </div>
        <span>{venueName}</span>
      </div>

      <section className="designer-section">
        <div className="designer-section-title">
          <strong>Bulk Table Generator</strong>
          <span>{generatedCount} new tables</span>
        </div>

        <label className="designer-field designer-field-wide">
          <span>Target area</span>
          <select
            value={form.areaId}
            onChange={(event) => {
              patchForm({ areaId: event.target.value });
              onSelectArea?.(event.target.value || null);
            }}
          >
            <option value="">Choose an area</option>
            {areas.filter((area) => !area.hidden).map((area) => (
              <option key={area.id} value={area.id}>{area.label}</option>
            ))}
          </select>
        </label>

        <div className="designer-grid-two">
          <NumberField label="Rows" value={form.rows} min={1} max={30} onChange={(value) => patchForm({ rows: value })} />
          <NumberField label="Columns" value={form.columns} min={1} max={30} onChange={(value) => patchForm({ columns: value })} />
          <NumberField label="Starting table" value={form.startingNumber} min={0} onChange={(value) => patchForm({ startingNumber: value })} />
          <NumberField label="Number increment" value={form.increment} min={1} onChange={(value) => patchForm({ increment: value })} />
          <NumberField label="Seats / capacity" value={form.capacity} min={1} max={100} onChange={(value) => patchForm({ capacity: value })} />
          <label className="designer-field">
            <span>Table type</span>
            <select value={form.tableType} onChange={(event) => patchForm({ tableType: event.target.value })}>
              <option value="regular">Regular</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </label>
          <NumberField label="Horizontal gap" value={form.horizontalGap} min={0} max={300} onChange={(value) => patchForm({ horizontalGap: value })} />
          <NumberField label="Vertical gap" value={form.verticalGap} min={0} max={300} onChange={(value) => patchForm({ verticalGap: value })} />
          <NumberField label="Left padding" value={form.offsetX} min={0} max={1000} onChange={(value) => patchForm({ offsetX: value })} />
          <NumberField label="Top padding" value={form.offsetY} min={0} max={1000} onChange={(value) => patchForm({ offsetY: value })} />
        </div>

        <label className="designer-check-row">
          <input
            type="checkbox"
            checked={form.replaceAreaTables}
            onChange={(event) => patchForm({ replaceAreaTables: event.target.checked })}
          />
          Remove existing unsplit tables assigned to this area before generating
        </label>

        <div className="designer-preview-card">
          <span>Area</span><strong>{selectedArea?.label || "Not selected"}</strong>
          <span>Grid</span><strong>{form.rows} × {form.columns}</strong>
          <span>Numbers</span><strong>{form.startingNumber}, {Number(form.startingNumber) + Number(form.increment)}, …</strong>
        </div>

        <button
          type="button"
          className="workspace-primary-action"
          disabled={!canManage || !form.areaId || generatedCount < 1}
          onClick={submitGenerator}
        >
          <Grid3X3 size={14} /> Generate {generatedCount} tables
        </button>
      </section>

      <section className="designer-section">
        <div className="designer-section-title">
          <strong>Area tools</strong>
          <span>{visibleTableCount} venue tables</span>
        </div>
        <button
          type="button"
          className="workspace-secondary-action"
          disabled={!canManage || !form.areaId}
          onClick={duplicateArea}
        >
          <Copy size={14} /> Duplicate area with its tables
        </button>
      </section>

      <section className="designer-section">
        <div className="designer-section-title">
          <strong>Layout backup</strong>
          <span>JSON</span>
        </div>
        <div className="designer-action-grid">
          <button type="button" disabled={!canManage} onClick={onExportLayout}>
            <Download size={14} /> Export
          </button>
          <button type="button" disabled={!canManage} onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Import
          </button>
        </div>
        <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={handleImport} />
        <button type="button" className="designer-danger-action" disabled={!canManage} onClick={onResetVenue}>
          <RotateCcw size={14} /> Reset venue layout to defaults
        </button>
      </section>

      {message && <div className="designer-message" role="status">{message}</div>}

      <div className="designer-note">
        <Layers3 size={15} />
        <span>Generated tables remain normal tables. You can drag, edit, split, assign, and synchronize them exactly like existing tables.</span>
      </div>
    </div>
  );
}
