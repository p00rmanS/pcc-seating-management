import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  Scissors,
  Combine,
  Users,
  Plus,
  Trash2,
  X,
  Check,
  Building2,
  Lock,
  Minus,
  Maximize2,
  ShieldCheck,
  RotateCw,
  Copy,
  Unlock,
  Eye,
  EyeOff,
  MousePointer2,
} from "lucide-react";

/* ============================================================
   HALE OHANA SEATING LAYOUT — pixel floor-plan edition
   ------------------------------------------------------------
   v2 adds: absolute-positioned, drag-to-move tables on a real
   floor plan (diamond wings + boxed zones + Stage + CR, matching
   the reference layout) instead of the flex "zone card" grid.
   Split/merge/server/color/group logic from v1 is unchanged —
   only WHERE tables render is different (table.pos instead of
   flex flow), so this drops in the same way.
   ============================================================ */

// ---------- constants ----------

const SWATCHES = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f97316",
  "#22c55e", "#ef4444", "#eab308", "#14b8a6",
];

const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;

// Legacy fallback size (unchanged) — Hale ʻOhana's config below matches these
// exactly so existing table positions keep rendering in the same place.
const CANVAS_W = 1000;
const CANVAS_H = 820;

// ---------- restaurant-specific floor-plan config (section 4) ----------
// Gateway and Hale Aloha get much larger canvases since they hold more
// tables/areas. Add a new restaurant by adding one entry here.
const RESTAURANT_LAYOUT_CONFIG = {
  ohana: {
    name: "Hale ʻOhana",
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
    minZoom: 0.45,
    maxZoom: 2,
    defaultZoom: 1,
    showGridDefault: false,
  },
  aloha: {
    name: "Hale Aloha",
    canvasWidth: 2400,
    canvasHeight: 1600,
    minZoom: 0.3,
    maxZoom: 2,
    defaultZoom: 0.55,
    showGridDefault: true,
  },
  gateway: {
    name: "Gateway",
    canvasWidth: 3200,
    canvasHeight: 2100,
    minZoom: 0.25,
    maxZoom: 2,
    defaultZoom: 0.45,
    showGridDefault: true,
  },
};


// ---------- editable floor-plan area configuration ----------
// Areas are stored separately from tables so the venue layout can be changed
// without changing guest, server, group, split, or seating records.
const DEFAULT_AREAS_BY_RESTAURANT = {
  ohana: [
    { id: "stage", label: "Stage", shape: "rounded", x: 300, y: 20, w: 340, h: 60, rotate: 0, locked: true, hidden: false, protected: true },
    { id: "cr", label: "CR", shape: "pill", x: 20, y: 20, w: 60, h: 30, rotate: 0, locked: true, hidden: false, protected: true },
    { id: "hibiscus", label: "Hibiscus", shape: "rectangle", x: 20, y: 130, w: 245, h: 190, rotate: -8, locked: false, hidden: false },
    { id: "bop", label: "BOP", shape: "rectangle", x: 55, y: 330, w: 275, h: 185, rotate: -8, locked: false, hidden: false },
    { id: "crown", label: "Crown", shape: "rectangle", x: 335, y: 120, w: 150, h: 140, rotate: 0, locked: false, hidden: false },
    { id: "ginger-2", label: "Ginger 2", shape: "rectangle", x: 335, y: 280, w: 150, h: 140, rotate: 0, locked: false, hidden: false },
    { id: "gardenia", label: "Gardenia", shape: "rectangle", x: 500, y: 120, w: 150, h: 140, rotate: 0, locked: false, hidden: false },
    { id: "ginger-1", label: "Ginger 1", shape: "rectangle", x: 500, y: 280, w: 150, h: 140, rotate: 0, locked: false, hidden: false },
    { id: "orchid", label: "Orchid", shape: "rectangle", x: 735, y: 130, w: 245, h: 190, rotate: 8, locked: false, hidden: false },
    { id: "ilima", label: "Ilima", shape: "rectangle", x: 670, y: 330, w: 275, h: 185, rotate: 8, locked: false, hidden: false },
  ],
  aloha: [],
  gateway: [],
};

function cloneDefaultAreas(restaurantId) {
  return (DEFAULT_AREAS_BY_RESTAURANT[restaurantId] || []).map((area) => ({ ...area }));
}

// where each named zone's tables start out, before the user drags them
const ZONE_SEED_ORIGIN = {
  Hibiscus: { x: 55, y: 190 },
  BOP: { x: 130, y: 300 },
  Crown: { x: 350, y: 145 },
  "Ginger 2": { x: 350, y: 300 },
  Gardenia: { x: 515, y: 145 },
  "Ginger 1": { x: 515, y: 300 },
  Orchid: { x: 780, y: 165 },
  Ilima: { x: 715, y: 305 },
};

// ---------- seed data ----------

const seedRestaurants = [
  { id: "ohana", name: "Hale ʻOhana" },
  { id: "aloha", name: "Hale Aloha" },
  { id: "gateway", name: "Gateway" },
];

const seedZones = {
  ohana: ["Hibiscus", "BOP", "Crown", "Gardenia", "Ginger 1", "Ginger 2", "Orchid", "Ilima"],
  aloha: [],
  gateway: [],
};

function seedTables(restaurantId, zones) {
  if (restaurantId !== "ohana") return [];
  let n = 1;
  const out = [];
  zones.forEach((zone) => {
    const counts = [2, 4, 4, 6];
    const origin = ZONE_SEED_ORIGIN[zone] || { x: 60, y: 60 };
    counts.forEach((cap, i) => {
      out.push({
        id: uid("t"),
        number: String(n++),
        capacity: cap,
        zone,
        type: n % 3 === 0 ? "super" : "regular",
        tableType: n % 3 === 0 ? "supervisor" : "regular",
        status: "available",
        serverId: null,
        guestName: "",
        color: null,
        groupId: null,
        parentId: null,
        childIds: null,
        pos: { x: origin.x + (i % 2) * 46, y: origin.y + Math.floor(i / 2) * 46 },
      });
    });
  });
  return out;
}

// ---------- small UI atoms ----------

function ColorDot({ color, size = 10 }) {
  return (
    <span
      style={{ width: size, height: size, background: color || "#d1d5db" }}
      className="inline-block rounded-full border border-black/10 shrink-0"
    />
  );
}

function SwatchPicker({ value, onChange, allowNone = true }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowNone && (
        <button
          onClick={() => onChange(null)}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            !value ? "border-slate-800" : "border-slate-300"
          }`}
          title="No color"
        >
          <X size={12} className="text-slate-400" />
        </button>
      )}
      {SWATCHES.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{ background: c }}
          className={`w-6 h-6 rounded-full border-2 ${
            value === c ? "border-slate-800 scale-110" : "border-white"
          } shadow transition-transform`}
          title={c}
        />
      ))}
    </div>
  );
}

// ---------- table-type + fill helpers (section 16, backward-compatible) ----------

// Falls back to the legacy `type: "regular"|"super"` field if `tableType`
// isn't set yet, so old table records stay valid without a migration.
function getTableType(t) {
  return t.tableType ?? (t.type === "super" ? "supervisor" : "regular");
}

// Legend colors: green/gray for regular, pink/dark-pink for supervisor.
function getTableFill(t) {
  const tt = getTableType(t);
  if (tt === "supervisor") return t.status === "occupied" ? "#831843" : "#ec4899";
  return t.status === "occupied" ? "#475569" : "#22c55e";
}

function LockedButton({ children, allowed, onClick, className = "", title }) {
  return (
    <button
      onClick={allowed ? onClick : undefined}
      disabled={!allowed}
      title={allowed ? title : "Lead access required"}
      className={`${className} ${!allowed ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
      {!allowed && <Lock size={11} className="inline ml-1 -mt-0.5" />}
    </button>
  );
}

// ---------- seating legend (section 16) ----------

function SeatingLegend() {
  const items = [
    { color: "#22c55e", label: "Regular Available" },
    { color: "#475569", label: "Regular Occupied" },
    { color: "#ec4899", label: "Supervisor Available" },
    { color: "#831843", label: "Supervisor Occupied" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full border border-black/10"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-purple-500" />
        Selected
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-orange-500" />
        Split table
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-300" />
        Group badge
      </span>
    </div>
  );
}


// ---------- editable floor-plan areas ----------

function getAreaBorderRadius(shape) {
  if (shape === "pill") return 999;
  if (shape === "rounded") return 24;
  return 12;
}

function EditableArea({
  area,
  editMode,
  selected,
  zoom,
  canvasWidth,
  canvasHeight,
  onSelect,
  onChange,
}) {
  const interactionRef = useRef(null);

  if (area.hidden && !editMode) return null;

  const beginInteraction = (event, mode) => {
    event.stopPropagation();
    if (!editMode) return;
    onSelect(area.id);
    if (area.locked) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    interactionRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      area: { ...area },
    };
  };

  const handlePointerMove = (event) => {
    const interaction = interactionRef.current;
    if (!interaction || area.locked) return;

    const dx = (event.clientX - interaction.startX) / zoom;
    const dy = (event.clientY - interaction.startY) / zoom;
    const original = interaction.area;

    if (interaction.mode === "move") {
      onChange(area.id, {
        x: Math.max(0, Math.min(canvasWidth - original.w, original.x + dx)),
        y: Math.max(0, Math.min(canvasHeight - original.h, original.y + dy)),
      });
    }

    if (interaction.mode === "resize") {
      onChange(area.id, {
        w: Math.max(70, Math.min(canvasWidth - original.x, original.w + dx)),
        h: Math.max(45, Math.min(canvasHeight - original.y, original.h + dy)),
      });
    }

    if (interaction.mode === "rotate") {
      const centerX = original.x + original.w / 2;
      const centerY = original.y + original.h / 2;
      const canvasRect = event.currentTarget.closest(".floor-canvas")?.getBoundingClientRect();
      if (!canvasRect) return;
      const pointerX = (event.clientX - canvasRect.left) / zoom;
      const pointerY = (event.clientY - canvasRect.top) / zoom;
      const rotate = Math.atan2(pointerY - centerY, pointerX - centerX) * (180 / Math.PI) + 90;
      onChange(area.id, { rotate: Math.round(rotate) });
    }
  };

  const endInteraction = (event) => {
    if (interactionRef.current) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    interactionRef.current = null;
  };

  const shapeStyle = area.shape === "diamond" ? { transform: `rotate(${area.rotate + 45}deg)` } : { transform: `rotate(${area.rotate || 0}deg)` };
  const labelStyle = area.shape === "diamond" ? { transform: "rotate(-45deg)" } : undefined;

  return (
    <div
      className={`editable-area ${editMode ? "area-editable" : ""} ${selected ? "area-selected" : ""} ${area.locked ? "area-locked" : ""} ${area.hidden ? "area-hidden-preview" : ""}`}
      style={{
        left: area.x,
        top: area.y,
        width: area.w,
        height: area.h,
        borderRadius: getAreaBorderRadius(area.shape),
        ...shapeStyle,
      }}
      onPointerDown={(event) => beginInteraction(event, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
      onClick={(event) => {
        if (!editMode) return;
        event.stopPropagation();
        onSelect(area.id);
      }}
      title={editMode ? `${area.label}${area.locked ? " · locked" : " · drag to move"}` : area.label}
    >
      <span className="editable-area-label" style={labelStyle}>{area.label}</span>

      {editMode && selected && !area.locked && (
        <>
          <button
            type="button"
            className="area-rotate-handle"
            aria-label={`Rotate ${area.label}`}
            title="Drag to rotate"
            onPointerDown={(event) => beginInteraction(event, "rotate")}
            onPointerMove={handlePointerMove}
            onPointerUp={endInteraction}
          >
            <RotateCw size={12} />
          </button>
          <button
            type="button"
            className="area-resize-handle"
            aria-label={`Resize ${area.label}`}
            title="Drag to resize"
            onPointerDown={(event) => beginInteraction(event, "resize")}
            onPointerMove={handlePointerMove}
            onPointerUp={endInteraction}
          />
        </>
      )}
    </div>
  );
}

function AreaEditor({
  areas,
  selectedArea,
  editMode,
  canManage,
  onToggleEditMode,
  onSelect,
  onUpdate,
  onAdd,
  onDuplicate,
  onDelete,
  onReset,
}) {
  return (
    <section className="area-manager-panel">
      <div className="area-manager-header">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <MousePointer2 size={15} /> Venue Areas
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {editMode ? "Select an area, then drag, resize, rotate, rename, lock, or duplicate it." : "Area editing is off during normal seating operations."}
          </p>
        </div>
        <LockedButton
          allowed={canManage}
          onClick={onToggleEditMode}
          className={`text-xs px-3 py-2 rounded-lg font-medium border ${editMode ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300 text-slate-700"}`}
        >
          {editMode ? "Done Editing Areas" : "Edit Areas"}
        </LockedButton>
      </div>

      {editMode && (
        <>
          <div className="area-chip-row">
            {areas.map((area) => (
              <button
                type="button"
                key={area.id}
                onClick={() => onSelect(area.id)}
                className={`area-chip ${selectedArea?.id === area.id ? "area-chip-active" : ""}`}
              >
                {area.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                {area.label}
                {area.locked && <Lock size={11} />}
              </button>
            ))}
          </div>

          <div className="area-manager-actions">
            <button type="button" onClick={() => onAdd("rectangle")}><Plus size={13} /> Rectangle</button>
            <button type="button" onClick={() => onAdd("rounded")}><Plus size={13} /> Rounded</button>
            <button type="button" onClick={() => onAdd("pill")}><Plus size={13} /> Pill</button>
            <button type="button" onClick={() => onAdd("diamond")}><Plus size={13} /> Diamond</button>
            <button type="button" onClick={onReset} className="area-reset-button">Reset Venue Areas</button>
          </div>

          {selectedArea ? (
            <div className="area-editor-grid">
              <label>
                Area name
                <input value={selectedArea.label} onChange={(event) => onUpdate(selectedArea.id, { label: event.target.value })} />
              </label>
              <label>
                Shape
                <select value={selectedArea.shape} onChange={(event) => onUpdate(selectedArea.id, { shape: event.target.value })}>
                  <option value="rectangle">Rectangle</option>
                  <option value="rounded">Rounded rectangle</option>
                  <option value="pill">Pill / oval</option>
                  <option value="diamond">Diamond</option>
                </select>
              </label>
              <label>
                Rotation
                <input type="number" value={Math.round(selectedArea.rotate || 0)} onChange={(event) => onUpdate(selectedArea.id, { rotate: Number(event.target.value) || 0 })} />
              </label>
              <label className="area-toggle-label">
                <input type="checkbox" checked={!!selectedArea.locked} onChange={(event) => onUpdate(selectedArea.id, { locked: event.target.checked })} />
                {selectedArea.locked ? <Lock size={13} /> : <Unlock size={13} />} Locked
              </label>
              <label className="area-toggle-label">
                <input type="checkbox" checked={!!selectedArea.hidden} onChange={(event) => onUpdate(selectedArea.id, { hidden: event.target.checked })} />
                {selectedArea.hidden ? <EyeOff size={13} /> : <Eye size={13} />} Hidden
              </label>
              <div className="area-editor-buttons">
                <button type="button" onClick={() => onDuplicate(selectedArea.id)}><Copy size={13} /> Duplicate</button>
                <button
                  type="button"
                  className="area-delete-button"
                  disabled={selectedArea.protected}
                  title={selectedArea.protected ? "This default operational area cannot be deleted. Duplicate it or hide it instead." : "Delete area"}
                  onClick={() => onDelete(selectedArea.id)}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="area-empty-selection">Choose an area on the map or from the list above.</div>
          )}
        </>
      )}
    </section>
  );
}

// ---------- draggable table chip ----------

function TableChip({
  table,
  server,
  group,
  isSelected,
  onSelect,
  onMove,
  canvasWidth,
  canvasHeight,
  canDrag,
  canDelete,
  onContextDelete,
  onToggleStatus,
}) {
  const isSplitParent = table.childIds && table.childIds.length > 0;
  const dragRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  if (isSplitParent) return null; // parent hides once split; children render instead

  const fill = getTableFill(table);
  const tableType = getTableType(table);
  const borderColor = table.color || server?.color || "#94a3b8";
  const isSplitChild = !!table.parentId;

  const onPointerDown = (e) => {
    e.stopPropagation();
    if (!canDrag) return; // Servers can still tap-to-select via onPointerUp below
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: table.pos.x,
      origY: table.pos.y,
    };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d.dragging || !canDrag) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    if (d.moved) {
      const nx = Math.max(0, Math.min(canvasWidth - 64, d.origX + dx));
      const ny = Math.max(0, Math.min(canvasHeight - 64, d.origY + dy));
      onMove(table.id, nx, ny);
    }
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (canDrag) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) onSelect(table.id);
    dragRef.current.dragging = false;
  };
  const onContextMenu = (e) => {
    e.preventDefault();
    if (canDelete) onContextDelete(table.id);
  };
  const onDoubleClick = (e) => {
    e.stopPropagation();
    onToggleStatus(table.id); // status toggle allowed for both roles
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      style={{ position: "absolute", left: table.pos.x, top: table.pos.y, touchAction: "none" }}
      className={`select-none ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      <div
        className={`relative flex flex-col items-center justify-center w-14 h-14 text-white text-xs font-semibold shadow-md transition-transform hover:scale-105 ${
          isSelected ? "ring-4 ring-offset-1 ring-purple-500" : ""
        } ${isSplitChild ? "ring-2 ring-offset-1 ring-orange-500" : ""} ${
          tableType === "supervisor" ? "rounded-full" : "rounded-xl"
        }`}
        style={{ background: fill, border: `3px solid ${borderColor}` }}
        title={`Table ${table.number} · ${table.capacity} pax`}
      >
        {group && (
          <span
            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border-2 border-white"
            style={{ background: group.color }}
          />
        )}
        {isSplitChild && (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] bg-orange-600 text-white px-1 rounded">
            split
          </span>
        )}
        <span className="text-sm leading-none">{table.number}</span>
        <span className="text-[9px] opacity-90 leading-none mt-0.5">{table.capacity}p</span>
        {server && <span className="text-[8px] opacity-90 leading-none mt-0.5">{server.initials}</span>}
      </div>
    </div>
  );
}

// ---------- split editor ----------

function SplitEditor({ table, onCancel, onConfirm }) {
  const [parts, setParts] = useState(() => {
    const half = Math.floor(table.capacity / 2);
    return [half, table.capacity - half];
  });

  const sum = parts.reduce((a, b) => a + b, 0);
  const valid = sum === table.capacity && parts.every((p) => p >= 1);

  const updatePart = (i, delta) =>
    setParts((p) => p.map((v, idx) => (idx === i ? Math.max(1, v + delta) : v)));

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-2">
      <div className="text-xs font-semibold text-amber-800">
        Splitting table {table.number} ({table.capacity} pax)
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center bg-white rounded border border-amber-300 overflow-hidden">
            <button onClick={() => updatePart(i, -1)} className="px-2 py-1 hover:bg-amber-100">−</button>
            <span className="px-2 text-sm font-medium">{p}p</span>
            <button onClick={() => updatePart(i, 1)} className="px-2 py-1 hover:bg-amber-100">+</button>
            {parts.length > 2 && (
              <button
                onClick={() => setParts((prev) => prev.filter((_, idx) => idx !== i))}
                className="px-1.5 text-red-500 hover:bg-red-50"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setParts((p) => [...p, 1])}
          className="text-xs px-2 py-1 rounded border border-dashed border-amber-400 text-amber-700 hover:bg-amber-100"
        >
          + part
        </button>
      </div>
      <div className={`text-xs ${valid ? "text-green-700" : "text-red-600"}`}>
        {sum} / {table.capacity} pax assigned {valid ? "✓" : "— must match exactly"}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          disabled={!valid}
          onClick={() => onConfirm(parts)}
          className="text-xs px-3 py-1.5 rounded bg-amber-600 disabled:bg-slate-300 text-white font-medium flex items-center gap-1"
        >
          <Check size={13} /> Confirm split
        </button>
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded bg-white border border-slate-300">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------- table detail / editor panel ----------

function TableEditor({ table, siblings, parentTable, servers, groups, permissions, onClose, onUpdate, onSplit, onMerge, onDelete }) {
  const [splitting, setSplitting] = useState(false);
  const anySiblingOccupied = (siblings || []).some((s) => s.status === "occupied") || table.status === "occupied";
  const assignedServer = servers.find((s) => s.id === table.serverId);
  const assignedGroup = groups.find((g) => g.id === table.groupId);
  const tableType = getTableType(table);

  // Status + guest name are editable by both Server and Lead (section 2).
  const statusAndGuestBlock = (
    <>
      <div className="flex gap-2">
        {["available", "occupied"].map((s) => (
          <button
            key={s}
            onClick={() => onUpdate(table.id, { status: s })}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium capitalize border ${
              table.status === s
                ? s === "available"
                  ? "bg-green-500 text-white border-green-500"
                  : "bg-slate-600 text-white border-slate-600"
                : "bg-white text-slate-600 border-slate-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">Guest / party name</label>
        <input
          value={table.guestName}
          onChange={(e) => onUpdate(table.id, { guestName: e.target.value })}
          placeholder="e.g. Anderson Belcher"
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </div>
    </>
  );

  // ---------- Server view: read-only table info, editable status/name only ----------
  if (!permissions.canEditLayout) {
    const infoRow = (label, value) => (
      <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium text-slate-800">{value}</span>
      </div>
    );
    return (
      <div className="border border-slate-300 rounded-xl bg-white shadow-lg p-4 space-y-4 w-full max-w-sm">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-slate-800">Table {table.number}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Seating Status</div>
          {statusAndGuestBlock}
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1">Table Information (read-only)</div>
          {infoRow("Table number", table.number)}
          {infoRow("Capacity", `${table.capacity} pax`)}
          {infoRow("Assigned server", assignedServer ? `${assignedServer.initials} — ${assignedServer.name}` : "Unassigned")}
          {infoRow("Group", assignedGroup?.name || "None")}
          {infoRow("Table type", tableType === "supervisor" ? "Supervisor" : "Regular")}
          {infoRow("Zone / area", table.zone || "Unassigned")}
        </div>
      </div>
    );
  }

  // ---------- Lead view: full control ----------
  return (
    <div className="border border-slate-300 rounded-xl bg-white shadow-lg p-4 space-y-4 w-full max-w-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-slate-800">
          Table {table.number} <span className="text-slate-400 font-normal text-sm">· {table.capacity} pax</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X size={16} />
        </button>
      </div>

      {table.parentId && parentTable && (
        <div className="text-xs bg-slate-100 rounded px-2 py-1 text-slate-600">
          Split from table {parentTable.number} ({parentTable.capacity}p) alongside{" "}
          {(siblings || []).filter((s) => s.id !== table.id).map((s) => s.number).join(", ") || "—"}
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-slate-500 mb-1">Seating Status</div>
        {statusAndGuestBlock}
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Server</label>
        <select
          value={table.serverId || ""}
          onChange={(e) => onUpdate(table.id, { serverId: e.target.value || null })}
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">Unassigned</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.initials} — {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Table color</label>
        <div className="mt-1">
          <SwatchPicker value={table.color} onChange={(c) => onUpdate(table.id, { color: c })} />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Table type</label>
        <select
          value={tableType}
          onChange={(e) =>
            onUpdate(table.id, { tableType: e.target.value, type: e.target.value === "supervisor" ? "super" : "regular" })
          }
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="regular">Regular</option>
          <option value="supervisor">Supervisor</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Group</label>
        <select
          value={table.groupId || ""}
          onChange={(e) => onUpdate(table.id, { groupId: e.target.value || null })}
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">No group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="pt-2 border-t border-slate-200 space-y-2">
        {table.parentId ? (
          <button
            disabled={anySiblingOccupied}
            onClick={() => onMerge(table.parentId)}
            className="w-full text-xs py-2 rounded-lg bg-slate-800 disabled:bg-slate-300 text-white font-medium flex items-center justify-center gap-1.5"
            title={anySiblingOccupied ? "Clear all seated splits before merging" : "Merge back to original table"}
          >
            <Combine size={14} /> Merge back to table {parentTable?.number}
          </button>
        ) : splitting ? (
          <SplitEditor
            table={table}
            onCancel={() => setSplitting(false)}
            onConfirm={(parts) => {
              onSplit(table.id, parts);
              setSplitting(false);
            }}
          />
        ) : (
          <button
            onClick={() => setSplitting(true)}
            className="w-full text-xs py-2 rounded-lg bg-amber-600 text-white font-medium flex items-center justify-center gap-1.5"
          >
            <Scissors size={14} /> Split this table
          </button>
        )}
      </div>

      <button
        onClick={() => onDelete(table.id)}
        className="w-full text-xs py-1.5 rounded-lg border border-red-300 text-red-600 flex items-center justify-center gap-1.5"
      >
        <Trash2 size={13} /> Remove table
      </button>
    </div>
  );
}

// ---------- floor plan canvas ----------


function FloorPlanCanvas({
  layoutConfig,
  areas,
  selectedAreaId,
  areaEditMode,
  onSelectArea,
  onUpdateArea,
  tables,
  servers,
  groups,
  selectedId,
  onSelect,
  onMove,
  permissions,
  zoom,
  onZoomChange,
  onContextDelete,
  onToggleStatus,
}) {
  const { canvasWidth, canvasHeight, minZoom, maxZoom, defaultZoom } = layoutConfig;

  const clampZoom = (value) => Math.max(minZoom, Math.min(maxZoom, value));
  const zoomIn = () => onZoomChange(clampZoom(zoom + 0.1));
  const zoomOut = () => onZoomChange(clampZoom(zoom - 0.1));
  const resetZoom = () => onZoomChange(clampZoom(1));
  const fitZoom = () => onZoomChange(clampZoom(defaultZoom));

  const onWheel = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    onZoomChange(clampZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08)));
  };

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  return (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={zoomOut} className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50" title="Zoom out"><Minus size={14} /></button>
        <span className="text-xs font-medium text-slate-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={zoomIn} className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50" title="Zoom in"><Plus size={14} /></button>
        <button type="button" onClick={resetZoom} className="text-xs px-2.5 h-8 rounded border border-slate-300 bg-white hover:bg-slate-50">100%</button>
        <button type="button" onClick={fitZoom} className="text-xs px-2.5 h-8 rounded border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1"><Maximize2 size={12} /> Fit</button>
        {areaEditMode && <span className="ml-2 text-xs font-semibold text-indigo-600">Area Edit Mode</span>}
      </div>

      <div className="floor-workspace bg-white rounded-xl border border-slate-200" style={{ height: "calc(100vh - 420px)", minHeight: 480 }}>
        <div className="floor-scroll-container" style={{ width: "100%", height: "100%", overflow: "auto" }} onWheel={onWheel}>
          <div
            className={`floor-canvas ${areaEditMode ? "floor-area-edit-mode" : ""}`}
            style={{ position: "relative", width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (areaEditMode) onSelectArea(null);
              else onSelect(null);
            }}
          >
            {areas.map((area) => (
              <EditableArea
                key={area.id}
                area={area}
                editMode={areaEditMode}
                selected={selectedAreaId === area.id}
                zoom={zoom}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                onSelect={onSelectArea}
                onChange={onUpdateArea}
              />
            ))}

            {!areaEditMode && tables
              .filter((table) => !(table.childIds && table.childIds.length))
              .map((table) => (
                <TableChip
                  key={table.id}
                  table={table}
                  server={serverById.get(table.serverId)}
                  group={groupById.get(table.groupId)}
                  isSelected={selectedId === table.id}
                  onSelect={onSelect}
                  onMove={onMove}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  canDrag={permissions.canMoveTables}
                  canDelete={permissions.canDeleteTables}
                  onContextDelete={onContextDelete}
                  onToggleStatus={onToggleStatus}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- server panel ----------

function ServerPanel({ servers, onAdd, onRemove, canManage }) {
  const [initials, setInitials] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);

  const submit = () => {
    if (!canManage || !initials.trim() || !name.trim()) return;
    onAdd({ id: uid("srv"), initials: initials.trim().toUpperCase(), name: name.trim(), color });
    setInitials("");
    setName("");
  };

  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-2">
      <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <Users size={15} /> Servers
      </div>
      <div className="flex flex-wrap gap-2">
        {servers.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-1">
            <ColorDot color={s.color} />
            {s.initials} · {s.name}
            <LockedButton allowed={canManage} onClick={() => onRemove(s.id)} className="text-slate-400 hover:text-red-500 ml-1">
              <X size={11} />
            </LockedButton>
          </span>
        ))}
        {servers.length === 0 && <span className="text-xs text-slate-400">No servers added yet.</span>}
      </div>
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <input
          placeholder="Initials"
          value={initials}
          disabled={!canManage}
          onChange={(e) => setInitials(e.target.value)}
          className="w-20 border border-slate-300 rounded px-2 py-1.5 text-sm disabled:bg-slate-50"
        />
        <input
          placeholder="Full name"
          value={name}
          disabled={!canManage}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[120px] border border-slate-300 rounded px-2 py-1.5 text-sm disabled:bg-slate-50"
        />
        <SwatchPicker value={color} onChange={canManage ? setColor : () => {}} allowNone={false} />
        <LockedButton
          allowed={canManage}
          onClick={submit}
          className="text-xs px-3 py-1.5 rounded bg-slate-800 text-white font-medium flex items-center gap-1"
        >
          <Plus size={13} /> Add
        </LockedButton>
      </div>
    </div>
  );
}

// ---------- group panel ----------

function GroupPanel({ groups, tables, onAdd, onRemove, canManage }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[1]);

  const submit = () => {
    if (!canManage || !name.trim()) return;
    onAdd({ id: uid("grp"), name: name.trim(), color });
    setName("");
  };

  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-2">
      <div className="text-sm font-semibold text-slate-700">Groups</div>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const count = tables.filter((t) => t.groupId === g.id).length;
          return (
            <span key={g.id} className="flex items-center gap-1.5 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-1">
              <ColorDot color={g.color} />
              {g.name} ({count})
              <LockedButton allowed={canManage} onClick={() => onRemove(g.id)} className="text-slate-400 hover:text-red-500 ml-1">
                <X size={11} />
              </LockedButton>
            </span>
          );
        })}
        {groups.length === 0 && <span className="text-xs text-slate-400">No groups yet.</span>}
      </div>
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <input
          placeholder="Group name (e.g. Belcher party)"
          value={name}
          disabled={!canManage}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[160px] border border-slate-300 rounded px-2 py-1.5 text-sm disabled:bg-slate-50"
        />
        <SwatchPicker value={color} onChange={canManage ? setColor : () => {}} allowNone={false} />
        <LockedButton
          allowed={canManage}
          onClick={submit}
          className="text-xs px-3 py-1.5 rounded bg-slate-800 text-white font-medium flex items-center gap-1"
        >
          <Plus size={13} /> Create
        </LockedButton>
      </div>
    </div>
  );
}

// ---------- main app ----------

export default function SeatingLayoutApp() {
  const [restaurants] = useState(seedRestaurants);
  const [activeRid, setActiveRid] = useState(seedRestaurants[0].id);

  const [tablesByR, setTablesByR] = useState(() => {
    const out = {};
    seedRestaurants.forEach((r) => {
      out[r.id] = seedTables(r.id, seedZones[r.id] || []);
    });
    return out;
  });
  const [serversByR, setServersByR] = useState(() => Object.fromEntries(seedRestaurants.map((r) => [r.id, []])));
  const [groupsByR, setGroupsByR] = useState(() => Object.fromEntries(seedRestaurants.map((r) => [r.id, []])));


const [areasByR, setAreasByR] = useState(() =>
  Object.fromEntries(seedRestaurants.map((restaurant) => [restaurant.id, cloneDefaultAreas(restaurant.id)]))
);
const [areaEditMode, setAreaEditMode] = useState(false);
const [selectedAreaId, setSelectedAreaId] = useState(null);

  // ---------- roles & permissions (section 2) ----------
  const [currentRole, setCurrentRole] = useState("lead"); // "server" | "lead"
  const permissions = {
    canViewFloorPlan: true,
    canViewTableDetails: true,
    canUpdateStatus: true,
    canEditGuestName: true,

    canEditLayout: currentRole === "lead",
    canMoveTables: currentRole === "lead",
    canManageTables: currentRole === "lead",
    canDeleteTables: currentRole === "lead",
    canSplitTables: currentRole === "lead",
    canMergeTables: currentRole === "lead",
    canManageZones: currentRole === "lead",
    canManageServers: currentRole === "lead",
    canManageGroups: currentRole === "lead",
    canUseBulkGenerator: currentRole === "lead",
    canEditRestaurantSetup: currentRole === "lead",
  };

  // ---------- per-restaurant view settings: zoom, pan (section 12) ----------
  const [viewSettingsByRestaurant, setViewSettingsByRestaurant] = useState(() =>
    Object.fromEntries(
      seedRestaurants.map((r) => [
        r.id,
        {
          zoom: RESTAURANT_LAYOUT_CONFIG[r.id]?.defaultZoom ?? 1,
          showGrid: RESTAURANT_LAYOUT_CONFIG[r.id]?.showGridDefault ?? false,
        },
      ])
    )
  );
  const layoutConfig = RESTAURANT_LAYOUT_CONFIG[activeRid];
  const zoom = viewSettingsByRestaurant[activeRid]?.zoom ?? layoutConfig.defaultZoom;
  const setZoom = (z) =>
    setViewSettingsByRestaurant((prev) => ({ ...prev, [activeRid]: { ...prev[activeRid], zoom: z } }));

  const [selectedTableId, setSelectedTableId] = useState(null);

  const tables = tablesByR[activeRid] || [];
  const servers = serversByR[activeRid] || [];
  const groups = groupsByR[activeRid] || [];
  const areas = areasByR[activeRid] || [];
  const selectedArea = areas.find((area) => area.id === selectedAreaId) || null;

  const setTables = useCallback(
    (updater) =>
      setTablesByR((prev) => ({
        ...prev,
        [activeRid]: typeof updater === "function" ? updater(prev[activeRid] || []) : updater,
      })),
    [activeRid]
  );

  // Guest name + status may always be edited (by Server or Lead); everything
  // else in the patch is dropped unless the caller has layout-edit rights.
  // This enforces permissions inside the handler itself, not just in the UI
  // that calls it (section 3).
  const updateTable = (id, patch) => {
    const allowedKeys = permissions.canEditLayout
      ? Object.keys(patch)
      : Object.keys(patch).filter((k) => k === "status" || k === "guestName");
    if (allowedKeys.length === 0) return;
    const safePatch = Object.fromEntries(allowedKeys.map((k) => [k, patch[k]]));
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...safePatch } : t)));
  };

  const toggleTableStatus = (id) => {
    if (!permissions.canUpdateStatus) return;
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: t.status === "occupied" ? "available" : "occupied" } : t))
    );
  };

  const moveTable = (id, x, y) => {
    if (!permissions.canMoveTables) return;
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, pos: { x, y } } : t)));
  };

  const deleteTable = (id) => {
    if (!permissions.canDeleteTables) return;
    setTables((prev) => prev.filter((t) => t.id !== id && t.parentId !== id));
    setSelectedTableId(null);
  };

  const splitTable = (id, parts) => {
    if (!permissions.canSplitTables) return;
    setTables((prev) => {
      const parent = prev.find((t) => t.id === id);
      if (!parent) return prev;
      const letters = "ABCDEFGH";
      const children = parts.map((cap, i) => ({
        id: uid("t"),
        number: `${parent.number}${letters[i]}`,
        capacity: cap,
        zone: parent.zone,
        type: parent.type,
        tableType: getTableType(parent),
        status: "available",
        serverId: parent.serverId,
        guestName: "",
        color: parent.color,
        groupId: null,
        parentId: parent.id,
        childIds: null,
        pos: { x: parent.pos.x + i * 56, y: parent.pos.y + 70 },
      }));
      const updatedParent = { ...parent, childIds: children.map((c) => c.id), status: "available" };
      return prev.map((t) => (t.id === id ? updatedParent : t)).concat(children);
    });
    setSelectedTableId(null);
  };

  const mergeTable = (parentId) => {
    if (!permissions.canMergeTables) return;
    setTables((prev) => {
      const parent = prev.find((t) => t.id === parentId);
      if (!parent) return prev;
      const withoutChildren = prev.filter((t) => t.parentId !== parentId);
      return withoutChildren.map((t) =>
        t.id === parentId ? { ...t, childIds: null, guestName: "", groupId: null } : t
      );
    });
    setSelectedTableId(null);
  };

  const addServer = (s) => {
    if (!permissions.canManageServers) return;
    setServersByR((prev) => ({ ...prev, [activeRid]: [...(prev[activeRid] || []), s] }));
  };
  const removeServer = (id) => {
    if (!permissions.canManageServers) return;
    setServersByR((prev) => ({ ...prev, [activeRid]: prev[activeRid].filter((s) => s.id !== id) }));
  };

  const addGroup = (g) => {
    if (!permissions.canManageGroups) return;
    setGroupsByR((prev) => ({ ...prev, [activeRid]: [...(prev[activeRid] || []), g] }));
  };
  const removeGroup = (id) => {
    if (!permissions.canManageGroups) return;
    setGroupsByR((prev) => ({ ...prev, [activeRid]: prev[activeRid].filter((g) => g.id !== id) }));
    setTables((prev) => prev.map((t) => (t.groupId === id ? { ...t, groupId: null } : t)));
  };

  const addBlankTable = () => {
    if (!permissions.canManageTables) return;
    setTables((prev) => [
      ...prev,
      {
        id: uid("t"),
        number: String(prev.length + 1),
        capacity: 4,
        zone: "Unassigned",
        type: "regular",
        tableType: "regular",
        status: "available",
        serverId: null,
        guestName: "",
        color: null,
        groupId: null,
        parentId: null,
        childIds: null,
        pos: { x: 460, y: 40 },
      },
    ]);
  };


const setAreas = useCallback(
  (updater) =>
    setAreasByR((previous) => ({
      ...previous,
      [activeRid]: typeof updater === "function" ? updater(previous[activeRid] || []) : updater,
    })),
  [activeRid]
);

const updateArea = useCallback(
  (id, patch) => {
    if (!permissions.canManageZones) return;
    setAreas((previous) => previous.map((area) => (area.id === id ? { ...area, ...patch } : area)));
  },
  [permissions.canManageZones, setAreas]
);

const addArea = useCallback(
  (shape = "rectangle") => {
    if (!permissions.canManageZones) return;
    const id = uid("area");
    const nextArea = {
      id,
      label: "New Area",
      shape,
      x: 380,
      y: 460,
      w: shape === "pill" ? 180 : 220,
      h: shape === "pill" ? 70 : 130,
      rotate: shape === "diamond" ? 0 : 0,
      locked: false,
      hidden: false,
      protected: false,
    };
    setAreas((previous) => [...previous, nextArea]);
    setSelectedAreaId(id);
  },
  [permissions.canManageZones, setAreas]
);

const duplicateArea = useCallback(
  (id) => {
    if (!permissions.canManageZones) return;
    setAreas((previous) => {
      const source = previous.find((area) => area.id === id);
      if (!source) return previous;
      const copy = { ...source, id: uid("area"), label: `${source.label} Copy`, x: source.x + 28, y: source.y + 28, protected: false, locked: false };
      setSelectedAreaId(copy.id);
      return [...previous, copy];
    });
  },
  [permissions.canManageZones, setAreas]
);

const deleteArea = useCallback(
  (id) => {
    if (!permissions.canManageZones) return;
    const target = areas.find((area) => area.id === id);
    if (!target || target.protected) return;
    if (!window.confirm(`Delete the ${target.label} area? Tables will remain on the floor.`)) return;
    setAreas((previous) => previous.filter((area) => area.id !== id));
    setSelectedAreaId(null);
  },
  [areas, permissions.canManageZones, setAreas]
);

const resetAreas = useCallback(() => {
  if (!permissions.canManageZones) return;
  if (!window.confirm(`Reset all ${RESTAURANT_LAYOUT_CONFIG[activeRid].name} areas to their defaults?`)) return;
  setAreas(cloneDefaultAreas(activeRid));
  setSelectedAreaId(null);
}, [activeRid, permissions.canManageZones, setAreas]);

const toggleAreaEditMode = useCallback(() => {
  if (!permissions.canManageZones) return;
  setAreaEditMode((current) => !current);
  setSelectedAreaId(null);
  setSelectedTableId(null);
}, [permissions.canManageZones]);

  const selectedTable = tables.find((t) => t.id === selectedTableId) || null;
  const siblings = useMemo(
    () => (selectedTable?.parentId ? tables.filter((t) => t.parentId === selectedTable.parentId) : []),
    [selectedTable, tables]
  );
  const parentTable = useMemo(
    () => (selectedTable?.parentId ? tables.find((t) => t.id === selectedTable.parentId) : null),
    [selectedTable, tables]
  );

  const instructions = !permissions.canEditLayout
    ? "Tap a table to view or update Available/Occupied status · Live sync is on"
    : "Click table to edit guest details · Double-click to switch Available/Occupied · Right-click to delete · Drag to reposition · Live sync is on";

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">{RESTAURANT_LAYOUT_CONFIG[activeRid].name} Seating Layout</h1>
            <p className="text-sm text-slate-500">{instructions}</p>
          </div>

          {/* role selector (section 2) + sync indicator (section 26) */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Local changes saved
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-full p-1">
              <ShieldCheck size={14} className="text-slate-400 ml-1.5" />
              <span className="text-xs text-slate-500 mr-1">Current Role:</span>
              {["server", "lead"].map((r) => (
                <button
                  key={r}
                  onClick={() => setCurrentRole(r)}
                  className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium ${
                    currentRole === r ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SeatingLegend />

        <div className="flex items-center gap-2 flex-wrap">
          <Building2 size={16} className="text-slate-400" />
          {restaurants.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setActiveRid(r.id);
                setSelectedTableId(null);
                setSelectedAreaId(null);
                setAreaEditMode(false);
              }}
              className={`text-sm px-3 py-1.5 rounded-full border font-medium ${
                activeRid === r.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              {r.name}
              <span className="ml-1.5 text-[10px] opacity-70">
                {RESTAURANT_LAYOUT_CONFIG[r.id].canvasWidth}×{RESTAURANT_LAYOUT_CONFIG[r.id].canvasHeight}
              </span>
            </button>
          ))}
        </div>


<AreaEditor
  areas={areas}
  selectedArea={selectedArea}
  editMode={areaEditMode}
  canManage={permissions.canManageZones}
  onToggleEditMode={toggleAreaEditMode}
  onSelect={(id) => {
    setSelectedAreaId(id);
    setSelectedTableId(null);
  }}
  onUpdate={updateArea}
  onAdd={addArea}
  onDuplicate={duplicateArea}
  onDelete={deleteArea}
  onReset={resetAreas}
/>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ServerPanel servers={servers} onAdd={addServer} onRemove={removeServer} canManage={permissions.canManageServers} />
          <GroupPanel groups={groups} tables={tables} onAdd={addGroup} onRemove={removeGroup} canManage={permissions.canManageGroups} />
        </div>

        <LockedButton
          allowed={permissions.canManageTables}
          onClick={addBlankTable}
          className="text-xs px-3 py-1.5 rounded bg-slate-800 text-white font-medium flex items-center gap-1 w-fit"
        >
          <Plus size={13} className="inline mr-1" /> Add blank table to floor
        </LockedButton>

        <div className="flex flex-col xl:flex-row gap-5 items-start">
          <FloorPlanCanvas
            layoutConfig={layoutConfig}
            areas={areas}
            selectedAreaId={selectedAreaId}
            areaEditMode={areaEditMode}
            onSelectArea={(id) => {
              setSelectedAreaId(id);
              if (id) setSelectedTableId(null);
            }}
            onUpdateArea={updateArea}
            tables={tables}
            servers={servers}
            groups={groups}
            selectedId={selectedTableId}
            onSelect={setSelectedTableId}
            onMove={moveTable}
            permissions={permissions}
            zoom={zoom}
            onZoomChange={setZoom}
            onContextDelete={deleteTable}
            onToggleStatus={toggleTableStatus}
          />

          {selectedTable && !areaEditMode && (
            <TableEditor
              table={selectedTable}
              siblings={siblings}
              parentTable={parentTable}
              servers={servers}
              groups={groups}
              permissions={permissions}
              onClose={() => setSelectedTableId(null)}
              onUpdate={updateTable}
              onSplit={splitTable}
              onMerge={mergeTable}
              onDelete={deleteTable}
            />
          )}
        </div>
      </div>
    </div>
  );
}
