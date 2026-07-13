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

// ---------- floor plan geometry (decorative, non-interactive) ----------

const AREA_DEFS = [
  { id: "stage", shape: "box", x: 300, y: 20, w: 340, h: 60, label: "Stage", dashed: true },
  { id: "cr", shape: "pill", x: 20, y: 20, w: 60, h: 30, label: "CR" },
  { id: "west", shape: "diamond", x: 10, y: 120, w: 300, h: 300, rotate: -12, label: "Hibiscus / BOP" },
  { id: "crownGinger2", shape: "box", x: 335, y: 120, w: 150, h: 300, label: "Crown", label2: "Ginger 2" },
  { id: "gardeniaGinger1", shape: "box", x: 500, y: 120, w: 150, h: 300, label: "Gardenia", label2: "Ginger 1" },
  { id: "east", shape: "diamond", x: 670, y: 120, w: 300, h: 300, rotate: 12, label: "Orchid / Ilima" },
];

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

// ---------- floor plan decorative zones ----------

function ZoneBackground({ area }) {
  const base = {
    position: "absolute",
    left: area.x,
    top: area.y,
    width: area.w,
    height: area.h,
  };

  if (area.shape === "diamond") {
    return (
      <div style={{ ...base }} className="pointer-events-none">
        <div
          style={{
            width: "100%",
            height: "100%",
            border: "1.5px dashed #cbd5e1",
            borderRadius: 16,
            transform: `rotate(${area.rotate}deg)`,
          }}
        />
        <span
          className="absolute text-[11px] font-medium text-indigo-400"
          style={{ left: "50%", top: -4, transform: "translateX(-50%)" }}
        >
          {area.label}
        </span>
      </div>
    );
  }

  if (area.shape === "pill") {
    return (
      <div
        style={base}
        className="pointer-events-none rounded-full border border-slate-300 flex items-center justify-center text-xs font-medium text-slate-500"
      >
        {area.label}
      </div>
    );
  }

  // box (optionally split into two labeled halves)
  return (
    <div
      style={base}
      className={`pointer-events-none border ${
        area.dashed ? "border-dashed" : "border-solid"
      } border-slate-300 rounded-xl flex ${area.label2 ? "flex-col" : "items-center justify-center"}`}
    >
      {area.label2 ? (
        <>
          <div className="flex-1 flex items-start justify-center pt-1 text-xs font-medium text-indigo-400 border-b border-dashed border-slate-300">
            {area.label}
          </div>
          <div className="flex-1 flex items-start justify-center pt-1 text-xs font-medium text-indigo-400">
            {area.label2}
          </div>
        </>
      ) : (
        <span className="text-xs font-medium text-slate-400">{area.label}</span>
      )}
    </div>
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
  restaurantId,
  layoutConfig,
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
  const showLegacyAreas = restaurantId === "ohana"; // only Hale ʻOhana has the seeded diamond/box zones

  const clampZoom = (z) => Math.max(minZoom, Math.min(maxZoom, z));
  const zoomIn = () => onZoomChange(clampZoom(zoom + 0.1));
  const zoomOut = () => onZoomChange(clampZoom(zoom - 0.1));
  const resetZoom = () => onZoomChange(1 <= maxZoom ? clampZoom(1) : clampZoom(maxZoom));
  const fitZoom = () => onZoomChange(clampZoom(defaultZoom));

  // Ctrl/Cmd + wheel zoom, only while the pointer is inside the workspace.
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    onZoomChange(clampZoom(zoom + (e.deltaY < 0 ? 0.08 : -0.08)));
  };

  return (
    <div className="flex-1 min-w-0 space-y-2">
      {/* zoom toolbar (section 8) */}
      <div className="flex items-center gap-1.5">
        <button onClick={zoomOut} className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50" title="Zoom out">
          <Minus size={14} />
        </button>
        <span className="text-xs font-medium text-slate-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50" title="Zoom in">
          <Plus size={14} />
        </button>
        <button onClick={resetZoom} className="text-xs px-2.5 h-8 rounded border border-slate-300 bg-white hover:bg-slate-50">
          100%
        </button>
        <button onClick={fitZoom} className="text-xs px-2.5 h-8 rounded border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1">
          <Maximize2 size={12} /> Fit
        </button>
      </div>

      {/* floor-workspace → floor-scroll-container → floor-canvas (section 5) */}
      <div
        className="floor-workspace bg-white rounded-xl border border-slate-200"
        style={{ height: "calc(100vh - 420px)", minHeight: 480 }}
      >
        <div className="floor-scroll-container" style={{ width: "100%", height: "100%", overflow: "auto" }} onWheel={onWheel}>
          <div
            className="floor-canvas"
            style={{
              position: "relative",
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {showLegacyAreas && AREA_DEFS.map((area) => <ZoneBackground key={area.id} area={area} />)}
            {tables
              .filter((t) => !(t.childIds && t.childIds.length))
              .map((t) => {
                const server = servers.find((s) => s.id === t.serverId);
                const group = groups.find((g) => g.id === t.groupId);
                return (
                  <TableChip
                    key={t.id}
                    table={t}
                    server={server}
                    group={group}
                    isSelected={selectedId === t.id}
                    onSelect={onSelect}
                    onMove={onMove}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    canDrag={permissions.canMoveTables}
                    canDelete={permissions.canDeleteTables}
                    onContextDelete={onContextDelete}
                    onToggleStatus={onToggleStatus}
                  />
                );
              })}
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
            <h1 className="text-2xl font-bold">Hale ʻOhana Seating Layout</h1>
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
            restaurantId={activeRid}
            layoutConfig={layoutConfig}
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

          {selectedTable && (
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
