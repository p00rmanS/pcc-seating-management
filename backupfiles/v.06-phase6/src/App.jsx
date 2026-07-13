import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { loadLocalSnapshot, saveLocalSnapshot } from "./utils/localPersistence";
import {
  getClientId,
  logStatusChange,
  saveVenueToCloud,
  subscribeToAuthorizedVenues,
  saveOperationalTableUpdate,
  subscribeToConnectionState,
  subscribeToActivity,
  subscribeToEmployees,
  subscribeToVenueStaffing,
  saveVenueStaffing,
} from "./services/firebase/realtimeSync";
import LoginScreen from "./components/auth/LoginScreen";
import ProfileSetupScreen from "./components/auth/ProfileSetupScreen";
import AppHeader from "./components/layout/AppHeader";
import ToolSidebar from "./components/layout/ToolSidebar";
import InspectorPanel from "./components/layout/InspectorPanel";
import WorkspaceFooter from "./components/layout/WorkspaceFooter";
import ActivityPanel from "./components/operations/ActivityPanel";
import CapacityPanel from "./components/operations/CapacityPanel";
import VenueDesignerPanel from "./components/designer/VenueDesignerPanel";
import DailyStaffingPanel from "./components/operations/DailyStaffingPanel";
import HelpPanel from "./components/operations/HelpPanel";
import "./styles/workspace.css";
import { signOutEmployee, subscribeToAuthSession } from "./services/auth/authService";
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
  Activity,
  Gauge,
  Grid3X3,
  CalendarDays,
  CircleHelp,
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

const TABLE_TYPE_OPTIONS = [
  { value: "regular", label: "Regular", available: "#22c55e", occupied: "#475569", shape: "rounded" },
  { value: "alii_luau", label: "Aliʻi Luau", available: "#0ea5e9", occupied: "#075985", shape: "rounded" },
  { value: "luau", label: "Luau", available: "#f59e0b", occupied: "#92400e", shape: "rounded" },
  { value: "super", label: "Super", available: "#ec4899", occupied: "#831843", shape: "circle" },
  { value: "ambassador", label: "Ambassador", available: "#8b5cf6", occupied: "#4c1d95", shape: "circle" },
  { value: "gateway_regular", label: "Regular Gateway", available: "#14b8a6", occupied: "#115e59", shape: "rounded" },
  { value: "vip", label: "VIP", available: "#d4a017", occupied: "#7c5b08", shape: "rounded" },
];

function getTableTypeDefinition(value) {
  const normalized = value === "supervisor" ? "super" : value;
  return TABLE_TYPE_OPTIONS.find((option) => option.value === normalized) || TABLE_TYPE_OPTIONS[0];
}

function getTableDisplaySize(table) {
  const fallback = getTableTypeDefinition(getTableType(table)).shape === "circle" ? 42 : 38;
  return {
    width: Math.max(26, Math.min(120, Number(table.displaySize?.width) || fallback)),
    height: Math.max(26, Math.min(120, Number(table.displaySize?.height) || fallback)),
  };
}

const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const getHawaiiDateString = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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
    { id: "stage", label: "Stage", shape: "rounded", x: 300, y: 20, w: 340, h: 60, rotate: 0, locked: true, hidden: false, protected: true, status: "available", statusUpdatedAt: null },
    { id: "cr", label: "CR", shape: "pill", x: 20, y: 20, w: 60, h: 30, rotate: 0, locked: true, hidden: false, protected: true, status: "available", statusUpdatedAt: null },
    { id: "hibiscus", label: "Hibiscus", shape: "rectangle", x: 20, y: 130, w: 245, h: 190, rotate: -8, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "bop", label: "BOP", shape: "rectangle", x: 55, y: 330, w: 275, h: 185, rotate: -8, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "crown", label: "Crown", shape: "rectangle", x: 335, y: 120, w: 150, h: 140, rotate: 0, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "ginger-2", label: "Ginger 2", shape: "rectangle", x: 335, y: 280, w: 150, h: 140, rotate: 0, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "gardenia", label: "Gardenia", shape: "rectangle", x: 500, y: 120, w: 150, h: 140, rotate: 0, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "ginger-1", label: "Ginger 1", shape: "rectangle", x: 500, y: 280, w: 150, h: 140, rotate: 0, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "orchid", label: "Orchid", shape: "rectangle", x: 735, y: 130, w: 245, h: 190, rotate: 8, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "ilima", label: "Ilima", shape: "rectangle", x: 670, y: 330, w: 275, h: 185, rotate: 8, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
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
        statusUpdatedAt: null,
        serverId: null,
        guestName: "",
        partySize: null,
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
  const legacy = t.tableType ?? (t.type === "super" ? "super" : "regular");
  return legacy === "supervisor" ? "super" : legacy;
}

function getTableFill(t) {
  const definition = getTableTypeDefinition(getTableType(t));
  return t.status === "occupied" ? definition.occupied : definition.available;
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
      <span className="editable-area-label" style={labelStyle}>
        <span className={`inline-block w-2 h-2 rounded-full mr-1 ${area.status === "occupied" ? "bg-slate-500" : "bg-green-500"}`} />
        {area.label}
      </span>

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
              <div className="area-status-control">
                <span className="text-xs font-medium text-slate-600">Operational status</span>
                <div className="flex gap-2 mt-1">
                  {["available", "occupied"].map((status) => (
                    <button
                      type="button"
                      key={status}
                      onClick={() => onUpdate(selectedArea.id, { status })}
                      className={`text-xs px-3 py-2 rounded-lg border capitalize ${
                        (selectedArea.status ?? "available") === status
                          ? status === "available"
                            ? "bg-green-500 border-green-500 text-white"
                            : "bg-slate-600 border-slate-600 text-white"
                          : "bg-white border-slate-300 text-slate-600"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {selectedArea.statusUpdatedAt
                    ? `Changed ${new Date(selectedArea.statusUpdatedAt).toLocaleString()}`
                    : "No status change recorded yet"}
                </span>
              </div>
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
  const typeDefinition = getTableTypeDefinition(tableType);
  const displaySize = getTableDisplaySize(table);
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
      const size = getTableDisplaySize(table);
      const nx = Math.max(0, Math.min(canvasWidth - size.width, d.origX + dx));
      const ny = Math.max(0, Math.min(canvasHeight - size.height, d.origY + dy));
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
      style={{ position: "absolute", left: table.pos.x, top: table.pos.y, touchAction: "none", zIndex: isSelected ? 45 : 25 }}
      className={`select-none ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      <div
        className={`relative flex flex-col items-center justify-center text-white text-xs font-semibold shadow-md transition-transform hover:scale-105 ${
          isSelected ? "ring-4 ring-offset-1 ring-purple-500" : ""
        } ${isSplitChild ? "ring-2 ring-offset-1 ring-orange-500" : ""} ${
          typeDefinition.shape === "circle" ? "rounded-full" : "rounded-lg"
        }`}
        style={{
          width: displaySize.width,
          height: displaySize.height,
          background: fill,
          border: `2px solid ${borderColor}`,
        }}
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
        <span className="text-xs leading-none">{table.number}</span>
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
      <div className="text-[11px] text-slate-400 -mt-2">
        {table.statusUpdatedAt
          ? `Status changed ${new Date(table.statusUpdatedAt).toLocaleString()}`
          : "No status change recorded yet"}
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
      <div>
        <label className="text-xs font-medium text-slate-500">Actual party size</label>
        <input
          type="number"
          min="0"
          max={table.capacity}
          value={table.partySize ?? ""}
          onChange={(e) => onUpdate(table.id, { partySize: e.target.value === "" ? null : Math.max(0, Math.min(table.capacity, Number(e.target.value) || 0)) })}
          placeholder={`Up to ${table.capacity} guests`}
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
        <span className="text-[10px] text-slate-400">Used for the live seated guest total. If blank, table capacity is used.</span>
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
          {infoRow("Table type", getTableTypeDefinition(tableType).label)}
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
          onChange={(e) => {
            const nextType = e.target.value;
            onUpdate(table.id, { tableType: nextType, type: ["super", "ambassador"].includes(nextType) ? "super" : "regular" });
          }}
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          {TABLE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>


      <div>
        <label className="text-xs font-medium text-slate-500">Table display size</label>
        <div className="table-size-presets mt-1">
          {[
            { label: "S", size: 30 },
            { label: "M", size: 38 },
            { label: "L", size: 48 },
          ].map((preset) => (
            <button
              type="button"
              key={preset.label}
              onClick={() => onUpdate(table.id, { displaySize: { width: preset.size, height: preset.size } })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="table-size-inputs mt-2">
          <label>W<input type="number" min="26" max="120" value={getTableDisplaySize(table).width} onChange={(e) => onUpdate(table.id, { displaySize: { ...getTableDisplaySize(table), width: Number(e.target.value) || 38 } })} /></label>
          <label>H<input type="number" min="26" max="120" value={getTableDisplaySize(table).height} onChange={(e) => onUpdate(table.id, { displaySize: { ...getTableDisplaySize(table), height: Number(e.target.value) || 38 } })} /></label>
        </div>
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

  const onWheel = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    onZoomChange(clampZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08)));
  };

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  return (
    <div className="floor-canvas-shell">
      {areaEditMode && <div className="floor-mode-badge">Area Edit Mode</div>}
      <div className="floor-workspace bg-white rounded-xl border border-slate-200">
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

function SeatingWorkspace({ authSession }) {
  const [localSnapshot] = useState(() =>
    loadLocalSnapshot(authSession.user.uid, {
      allowLegacyMigration: ["lead", "admin", "developer", "director", "manager", "assistant_manager"].includes(authSession.profile.role),
    })
  );
  const [saveState, setSaveState] = useState("saved");
  const [lastSavedAt, setLastSavedAt] = useState(localSnapshot?.savedAt || null);
  const [cloudState, setCloudState] = useState("connecting");
  const [lastCloudSavedAt, setLastCloudSavedAt] = useState(null);
  const [clientId] = useState(() => getClientId());
  const cloudReadyRef = useRef(false);
  const lastCloudSignatureRef = useRef("");
  const lastLocalSignatureRef = useRef("");

  const [restaurants] = useState(seedRestaurants);
  const [activeRid, setActiveRid] = useState(() =>
    seedRestaurants.some((restaurant) => restaurant.id === localSnapshot?.activeRid)
      ? localSnapshot.activeRid
      : seedRestaurants[0].id
  );

  const [tablesByR, setTablesByR] = useState(() => {
    const out = {};
    seedRestaurants.forEach((restaurant) => {
      const savedTables = localSnapshot?.tablesByR?.[restaurant.id];
      out[restaurant.id] = Array.isArray(savedTables)
        ? savedTables
        : seedTables(restaurant.id, seedZones[restaurant.id] || []);
    });
    return out;
  });
  const [serversByR, setServersByR] = useState(() =>
    Object.fromEntries(
      seedRestaurants.map((restaurant) => [
        restaurant.id,
        Array.isArray(localSnapshot?.serversByR?.[restaurant.id])
          ? localSnapshot.serversByR[restaurant.id]
          : [],
      ])
    )
  );
  const [groupsByR, setGroupsByR] = useState(() =>
    Object.fromEntries(
      seedRestaurants.map((restaurant) => [
        restaurant.id,
        Array.isArray(localSnapshot?.groupsByR?.[restaurant.id])
          ? localSnapshot.groupsByR[restaurant.id]
          : [],
      ])
    )
  );

const [areasByR, setAreasByR] = useState(() =>
  Object.fromEntries(
    seedRestaurants.map((restaurant) => [
      restaurant.id,
      Array.isArray(localSnapshot?.areasByR?.[restaurant.id])
        ? localSnapshot.areasByR[restaurant.id]
        : cloneDefaultAreas(restaurant.id),
    ])
  )
);
const [areaEditMode, setAreaEditMode] = useState(false);
const [selectedAreaId, setSelectedAreaId] = useState(null);
const [venueOperationsByR, setVenueOperationsByR] = useState(() =>
  Object.fromEntries(
    seedRestaurants.map((restaurant) => [
      restaurant.id,
      localSnapshot?.venueOperationsByR?.[restaurant.id] || { expectedGuests: 0, scannedGuests: 0, venueCapacity: 0 },
    ])
  )
);
const [activity, setActivity] = useState([]);
const [employees, setEmployees] = useState({});
const [staffingDate, setStaffingDate] = useState(getHawaiiDateString);
const [staffingAssignments, setStaffingAssignments] = useState({});
const [staffingSaveState, setStaffingSaveState] = useState("idle");

  // ---------- authenticated roles & server-enforced venue access ----------
  const currentRole = authSession.profile.role;
  const isLeadOrAdmin = ["lead", "admin", "developer", "director", "manager", "assistant_manager", "front_lead"].includes(currentRole);
  const authorizedVenueIds = useMemo(
    () =>
      ["admin", "developer", "director"].includes(currentRole)
        ? seedRestaurants.map((restaurant) => restaurant.id)
        : seedRestaurants
            .filter((restaurant) => authSession.profile.venueIds?.[restaurant.id] === true)
            .map((restaurant) => restaurant.id),
    [authSession.profile.venueIds, currentRole]
  );
  const visibleRestaurants = useMemo(
    () => seedRestaurants.filter((restaurant) => authorizedVenueIds.includes(restaurant.id)),
    [authorizedVenueIds]
  );

  useEffect(() => {
    if (authorizedVenueIds.length === 0) return;
    if (!authorizedVenueIds.includes(activeRid)) {
      setActiveRid(authorizedVenueIds[0]);
      setSelectedTableId(null);
      setSelectedAreaId(null);
      setAreaEditMode(false);
    }
  }, [activeRid, authorizedVenueIds]);

  useEffect(() => subscribeToEmployees(setEmployees, (error) => console.error("Employee directory subscription failed:", error)), []);

  useEffect(() => {
    setStaffingSaveState("loading");
    return subscribeToVenueStaffing(activeRid, staffingDate, (value) => {
      setStaffingAssignments(value?.assignments || {});
      setStaffingSaveState("idle");
    }, (error) => {
      console.error("Staffing subscription failed:", error);
      setStaffingSaveState("error");
    });
  }, [activeRid, staffingDate]);

  const permissions = {
    canViewFloorPlan: true,
    canViewTableDetails: true,
    canUpdateStatus: true,
    canEditGuestName: true,

    canEditLayout: isLeadOrAdmin,
    canMoveTables: isLeadOrAdmin,
    canManageTables: isLeadOrAdmin,
    canDeleteTables: isLeadOrAdmin,
    canSplitTables: isLeadOrAdmin,
    canMergeTables: isLeadOrAdmin,
    canManageZones: isLeadOrAdmin,
    canManageServers: isLeadOrAdmin,
    canManageGroups: isLeadOrAdmin,
    canUseBulkGenerator: isLeadOrAdmin,
    canEditRestaurantSetup: isLeadOrAdmin,
  };

  const [canvasSettingsByR, setCanvasSettingsByR] = useState(() =>
    Object.fromEntries(seedRestaurants.map((restaurant) => {
      const saved = localSnapshot?.canvasSettingsByR?.[restaurant.id];
      const defaults = RESTAURANT_LAYOUT_CONFIG[restaurant.id];
      return [restaurant.id, {
        width: Number(saved?.width) || defaults.canvasWidth,
        height: Number(saved?.height) || defaults.canvasHeight,
      }];
    }))
  );

  // ---------- per-restaurant view settings: zoom, pan (section 12) ----------
  const [viewSettingsByRestaurant, setViewSettingsByRestaurant] = useState(() =>
    Object.fromEntries(
      seedRestaurants.map((restaurant) => {
        const saved = localSnapshot?.viewSettingsByRestaurant?.[restaurant.id];
        return [
          restaurant.id,
          {
            zoom:
              typeof saved?.zoom === "number"
                ? saved.zoom
                : RESTAURANT_LAYOUT_CONFIG[restaurant.id]?.defaultZoom ?? 1,
            showGrid:
              typeof saved?.showGrid === "boolean"
                ? saved.showGrid
                : RESTAURANT_LAYOUT_CONFIG[restaurant.id]?.showGridDefault ?? false,
          },
        ];
      })
    )
  );
  const layoutConfig = useMemo(() => ({
    ...RESTAURANT_LAYOUT_CONFIG[activeRid],
    canvasWidth: canvasSettingsByR[activeRid]?.width || RESTAURANT_LAYOUT_CONFIG[activeRid].canvasWidth,
    canvasHeight: canvasSettingsByR[activeRid]?.height || RESTAURANT_LAYOUT_CONFIG[activeRid].canvasHeight,
  }), [activeRid, canvasSettingsByR]);
  const zoom = viewSettingsByRestaurant[activeRid]?.zoom ?? layoutConfig.defaultZoom;
  const setZoom = (z) =>
    setViewSettingsByRestaurant((prev) => ({ ...prev, [activeRid]: { ...prev[activeRid], zoom: z } }));

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [activeTool, setActiveTool] = useState("tables");
  const [quickTableType, setQuickTableType] = useState("regular");
  const [customQuickCapacity, setCustomQuickCapacity] = useState(16);

  useEffect(() => {
    const localPayload = {
      activeRid,
      currentRole,
      tablesByR,
      serversByR,
      groupsByR,
      areasByR,
      venueOperationsByR,
      canvasSettingsByR,
      viewSettingsByRestaurant,
    };
    const signature = JSON.stringify(localPayload);
    if (signature === lastLocalSignatureRef.current) return undefined;

    setSaveState("saving");
    const saveTimer = window.setTimeout(() => {
      try {
        const savedAt = saveLocalSnapshot(localPayload, authSession.user.uid);
        lastLocalSignatureRef.current = signature;
        setLastSavedAt(savedAt);
        setSaveState("saved");
      } catch (error) {
        console.error("Unable to save the local seating backup:", error);
        setSaveState("error");
      }
    }, 1200);

    return () => window.clearTimeout(saveTimer);
  }, [
    activeRid,
    currentRole,
    tablesByR,
    serversByR,
    groupsByR,
    areasByR,
    venueOperationsByR,
    canvasSettingsByR,
    viewSettingsByRestaurant,
    authSession.user.uid,
  ]);

  useEffect(() => {
    const unsubscribeConnection = subscribeToConnectionState((connected) => {
      setCloudState(connected ? (cloudReadyRef.current ? "live" : "connecting") : "offline");
    });

    const unsubscribeVenues = subscribeToAuthorizedVenues(
      authorizedVenueIds,
      (remoteVenues) => {
        if (remoteVenues) {
          const operational = {};
          seedRestaurants.forEach((restaurant) => {
            const remote = remoteVenues[restaurant.id];
            const hasCloudLayout = remote?.metadata?.initialized === true ||
              (Array.isArray(remote?.tables) && remote.tables.length > 0) ||
              (Array.isArray(remote?.areas) && remote.areas.length > 0) ||
              (Array.isArray(remote?.servers) && remote.servers.length > 0) ||
              (Array.isArray(remote?.groups) && remote.groups.length > 0);

            operational[restaurant.id] = {
              tables: hasCloudLayout && Array.isArray(remote?.tables) ? remote.tables : null,
              servers: hasCloudLayout && Array.isArray(remote?.servers) ? remote.servers : null,
              groups: hasCloudLayout && Array.isArray(remote?.groups) ? remote.groups : null,
              areas: hasCloudLayout && Array.isArray(remote?.areas) ? remote.areas : null,
              canvas: remote?.canvas ? { width: Number(remote.canvas.width) || 0, height: Number(remote.canvas.height) || 0 } : null,
              operations: remote?.operations ? {
                expectedGuests: Number(remote.operations.expectedGuests) || 0,
                scannedGuests: Number(remote.operations.scannedGuests) || 0,
                venueCapacity: Number(remote.operations.venueCapacity) || 0,
              } : null,
            };
          });

          const signature = JSON.stringify(operational);
          lastCloudSignatureRef.current = signature;

          setTablesByR((previous) =>
            Object.fromEntries(seedRestaurants.map((restaurant) => [
              restaurant.id,
              operational[restaurant.id].tables ?? previous[restaurant.id] ?? [],
            ]))
          );
          setServersByR((previous) =>
            Object.fromEntries(seedRestaurants.map((restaurant) => [
              restaurant.id,
              operational[restaurant.id].servers ?? previous[restaurant.id] ?? [],
            ]))
          );
          setGroupsByR((previous) =>
            Object.fromEntries(seedRestaurants.map((restaurant) => [
              restaurant.id,
              operational[restaurant.id].groups ?? previous[restaurant.id] ?? [],
            ]))
          );
          setAreasByR((previous) =>
            Object.fromEntries(seedRestaurants.map((restaurant) => [
              restaurant.id,
              operational[restaurant.id].areas ?? previous[restaurant.id] ?? [],
            ]))
          );
          setCanvasSettingsByR((previous) =>
            Object.fromEntries(seedRestaurants.map((restaurant) => [
              restaurant.id,
              operational[restaurant.id].canvas?.width && operational[restaurant.id].canvas?.height
                ? operational[restaurant.id].canvas
                : previous[restaurant.id] || { width: RESTAURANT_LAYOUT_CONFIG[restaurant.id].canvasWidth, height: RESTAURANT_LAYOUT_CONFIG[restaurant.id].canvasHeight },
            ]))
          );
          setVenueOperationsByR((previous) =>
            Object.fromEntries(seedRestaurants.map((restaurant) => [
              restaurant.id,
              operational[restaurant.id].operations ?? previous[restaurant.id] ?? { expectedGuests: 0, scannedGuests: 0, venueCapacity: 0 },
            ]))
          );
        }

        cloudReadyRef.current = true;
        setCloudState("live");
      },
      (error) => {
        console.error("Firebase live sync failed:", error);
        setCloudState("error");
      }
    );

    const unsubscribeActivity = subscribeToActivity(
      authorizedVenueIds,
      setActivity,
      (error) => console.error("Firebase activity feed failed:", error)
    );

    return () => {
      unsubscribeConnection();
      unsubscribeVenues();
      unsubscribeActivity();
    };
  }, [authorizedVenueIds.join("|")]);

  useEffect(() => {
    if (!cloudReadyRef.current) return undefined;

    if (!permissions.canEditLayout) return undefined;

    const operational = Object.fromEntries(
      visibleRestaurants.map((restaurant) => [restaurant.id, {
        tables: tablesByR[restaurant.id] || [],
        servers: serversByR[restaurant.id] || [],
        groups: groupsByR[restaurant.id] || [],
        areas: areasByR[restaurant.id] || [],
        operations: venueOperationsByR[restaurant.id] || { expectedGuests: 0, scannedGuests: 0, venueCapacity: 0 },
        canvas: canvasSettingsByR[restaurant.id] || { width: RESTAURANT_LAYOUT_CONFIG[restaurant.id].canvasWidth, height: RESTAURANT_LAYOUT_CONFIG[restaurant.id].canvasHeight },
      }])
    );
    const signature = JSON.stringify(operational);
    if (signature === lastCloudSignatureRef.current) return undefined;

    setCloudState("saving");
    const timer = window.setTimeout(async () => {
      try {
        await Promise.all(
          visibleRestaurants.map((restaurant) =>
            saveVenueToCloud(restaurant.id, operational[restaurant.id], {
              uid: authSession.user.uid,
              clientId,
              role: currentRole,
            })
          )
        );
        lastCloudSignatureRef.current = signature;
        setLastCloudSavedAt(new Date().toISOString());
        setCloudState("live");
      } catch (error) {
        console.error("Unable to save to Firebase:", error);
        setCloudState(navigator.onLine ? "error" : "offline");
      }
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [
    tablesByR,
    serversByR,
    groupsByR,
    areasByR,
    venueOperationsByR,
    canvasSettingsByR,
    clientId,
    currentRole,
    permissions.canEditLayout,
    visibleRestaurants,
    authSession.user.uid,
  ]);

  const tables = tablesByR[activeRid] || [];
  const servers = serversByR[activeRid] || [];
  const groups = groupsByR[activeRid] || [];
  const areas = areasByR[activeRid] || [];
  const venueOperations = venueOperationsByR[activeRid] || { expectedGuests: 0, scannedGuests: 0, venueCapacity: 0 };
  const activeVenueActivity = useMemo(() => activity.filter((event) => event.venueId === activeRid).slice(0, 60), [activity, activeRid]);
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
      : Object.keys(patch).filter((key) => key === "status" || key === "guestName" || key === "partySize");
    if (allowedKeys.length === 0) return;

    const currentTable = tables.find((table) => table.id === id);
    if (!currentTable) return;

    const safePatch = Object.fromEntries(allowedKeys.map((key) => [key, patch[key]]));
    const statusChanged =
      Object.prototype.hasOwnProperty.call(safePatch, "status") &&
      safePatch.status !== currentTable.status;

    if (statusChanged) {
      safePatch.statusUpdatedAt = new Date().toISOString();
      logStatusChange({
        venueId: activeRid,
        entityType: "table",
        entityId: currentTable.id,
        label: `Table ${currentTable.number}`,
        fromStatus: currentTable.status ?? "available",
        toStatus: safePatch.status,
        uid: authSession.user.uid,
        clientId,
        role: currentRole,
        changedByName: authSession.profile.displayName,
      }).catch((error) => console.error("Unable to write table activity log:", error));
    }

    setTables((previous) =>
      previous.map((table) => (table.id === id ? { ...table, ...safePatch } : table))
    );

    if (!permissions.canEditLayout) {
      saveOperationalTableUpdate(activeRid, id, safePatch, {
        uid: authSession.user.uid,
        clientId,
        role: currentRole,
        changedByName: authSession.profile.displayName,
      }).catch((error) => {
        console.error("Unable to save the operational table update:", error);
        setCloudState(navigator.onLine ? "error" : "offline");
      });
    }
  };

  const toggleTableStatus = (id) => {
    if (!permissions.canUpdateStatus) return;
    const currentTable = tables.find((table) => table.id === id);
    if (!currentTable) return;

    const nextStatus = currentTable.status === "occupied" ? "available" : "occupied";
    const statusUpdatedAt = new Date().toISOString();
    const patch = { status: nextStatus, statusUpdatedAt };

    setTables((previous) =>
      previous.map((table) => (table.id === id ? { ...table, ...patch } : table))
    );

    logStatusChange({
      venueId: activeRid,
      entityType: "table",
      entityId: currentTable.id,
      label: `Table ${currentTable.number}`,
      fromStatus: currentTable.status ?? "available",
      toStatus: nextStatus,
      uid: authSession.user.uid,
      clientId,
      role: currentRole,
      changedByName: authSession.profile.displayName,
    }).catch((error) => console.error("Unable to write table activity log:", error));

    if (!permissions.canEditLayout) {
      saveOperationalTableUpdate(activeRid, id, patch, {
        uid: authSession.user.uid,
        clientId,
        role: currentRole,
        changedByName: authSession.profile.displayName,
      }).catch((error) => {
        console.error("Unable to save the operational table status:", error);
        setCloudState(navigator.onLine ? "error" : "offline");
      });
    }
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
    let firstChildId = null;
    setAreaEditMode(false);
    setActiveTool("tables");
    setTables((prev) => {
      const parent = prev.find((t) => t.id === id);
      if (!parent) return prev;
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const parentSize = getTableDisplaySize(parent);
      const spacing = Math.max(parentSize.width + 12, 50);
      const children = parts.map((cap, i) => ({
        id: uid("t"),
        number: `${parent.number}${letters[i] || i + 1}`,
        capacity: cap,
        zone: parent.zone,
        areaId: parent.areaId || null,
        type: parent.type,
        tableType: getTableType(parent),
        displaySize: { ...parentSize },
        status: "available",
        statusUpdatedAt: null,
        serverId: parent.serverId,
        guestName: "",
        partySize: null,
        color: parent.color,
        groupId: parent.groupId || null,
        parentId: parent.id,
        childIds: null,
        pos: {
          x: Math.max(0, Math.min(layoutConfig.canvasWidth - parentSize.width, parent.pos.x + i * spacing)),
          y: Math.max(0, Math.min(layoutConfig.canvasHeight - parentSize.height, parent.pos.y + parentSize.height + 18)),
        },
      }));
      firstChildId = children[0]?.id || null;
      const updatedParent = { ...parent, childIds: children.map((child) => child.id), status: "available" };
      return prev.map((table) => (table.id === id ? updatedParent : table)).concat(children);
    });
    window.setTimeout(() => setSelectedTableId(firstChildId), 0);
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

  const addBlankTable = (capacity = 4, requestedType = quickTableType) => {
    if (!permissions.canManageTables) return;
    setTables((prev) => {
      const nextNumber = getNextTableNumber(prev);
      const offsetIndex = prev.length % 8;
      const tableType = getTableTypeDefinition(requestedType).value;
      return [
        ...prev,
        {
          id: uid("t"),
          number: String(nextNumber),
          capacity: Math.max(1, Number(capacity) || 4),
          zone: "Unassigned",
          areaId: null,
          type: ["super", "ambassador"].includes(tableType) ? "super" : "regular",
          tableType,
          displaySize: { width: 38, height: 38 },
          status: "available",
          statusUpdatedAt: null,
          serverId: null,
          guestName: "",
          partySize: null,
          color: null,
          groupId: null,
          parentId: null,
          childIds: null,
          pos: { x: 60 + offsetIndex * 46, y: 90 + Math.floor(prev.length / 8) * 46 },
        },
      ];
    });
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
    setAreas((previous) => previous.map((area) => {
      if (area.id !== id) return area;
      if (patch.status && patch.status !== (area.status ?? "available")) {
        const changedAt = new Date().toISOString();
        logStatusChange({
          venueId: activeRid,
          entityType: "area",
          entityId: area.id,
          label: area.label,
          fromStatus: area.status ?? "available",
          toStatus: patch.status,
          uid: authSession.user.uid,
          clientId,
          role: currentRole,
          changedByName: authSession.profile.displayName,
        }).catch((error) => console.error("Unable to write area activity log:", error));
        return { ...area, ...patch, statusUpdatedAt: changedAt };
      }
      return { ...area, ...patch };
    }));
  },
  [activeRid, authSession.profile.displayName, authSession.user.uid, clientId, currentRole, permissions.canManageZones, setAreas]
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
    ? "Tap a table to view or update Available/Occupied status · Local backup + live sync are on"
    : "Click table to edit guest details · Double-click to switch Available/Occupied · Right-click to delete · Drag to reposition · Local backup + live sync are on";

  const saveLabel =
    saveState === "saving"
      ? "Saving locally…"
      : saveState === "error"
        ? "Local save failed"
        : lastSavedAt
          ? `Saved locally ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Local backup ready";
  const saveDotClass =
    saveState === "saving"
      ? "bg-amber-500"
      : saveState === "error"
        ? "bg-red-500"
        : "bg-green-500";

  const clampWorkspaceZoom = (value) => Math.max(layoutConfig.minZoom, Math.min(layoutConfig.maxZoom, value));
  const zoomIn = () => setZoom(clampWorkspaceZoom(zoom + 0.1));
  const zoomOut = () => setZoom(clampWorkspaceZoom(zoom - 0.1));
  const resetZoom = () => setZoom(clampWorkspaceZoom(1));
  const fitZoom = () => setZoom(clampWorkspaceZoom(layoutConfig.defaultZoom));

  const seatingMetrics = useMemo(() => {
    const visibleTables = tables.filter((table) => !(table.childIds && table.childIds.length));
    const occupied = visibleTables.filter((table) => table.status === "occupied");
    return {
      occupiedTables: occupied.length,
      availableTables: visibleTables.length - occupied.length,
      totalTables: visibleTables.length,
      totalTableCapacity: visibleTables.reduce((sum, table) => sum + (Number(table.capacity) || 0), 0),
      seatedGuests: occupied.reduce((sum, table) => {
        const entered = Number(table.partySize);
        return sum + (entered > 0 ? entered : Number(table.capacity) || 0);
      }, 0),
    };
  }, [tables]);

  const updateVenueOperations = useCallback((patch) => {
    if (!permissions.canEditRestaurantSetup) return;
    setVenueOperationsByR((previous) => ({
      ...previous,
      [activeRid]: {
        ...(previous[activeRid] || { expectedGuests: 0, scannedGuests: 0, venueCapacity: 0 }),
        ...patch,
      },
    }));
  }, [activeRid, permissions.canEditRestaurantSetup]);

  const getNextTableNumber = useCallback((currentTables = tables) => {
    const used = currentTables
      .map((table) => Number.parseInt(String(table.number), 10))
      .filter(Number.isFinite);
    return used.length ? Math.max(...used) + 1 : 1;
  }, [tables]);

  const generateBulkTables = useCallback((config) => {
    if (!permissions.canManageTables) {
      return { ok: false, message: "Lead access is required to generate tables." };
    }

    const area = areas.find((candidate) => candidate.id === config.areaId);
    if (!area) return { ok: false, message: "Choose a valid target area." };

    const count = Math.max(1, Math.min(100, Number(config.count) || 1));
    const startingNumber = Number.isFinite(Number(config.startingNumber))
      ? Number(config.startingNumber)
      : getNextTableNumber();
    const capacity = Math.max(1, Number(config.capacity) || 4);
    const tableType = getTableTypeDefinition(config.tableType).value;
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / columns);
    const tableSize = Math.max(28, Math.min(60, Number(config.tableSize) || 36));
    const gap = 12;
    const availableWidth = Math.max(tableSize, area.w - 24);
    const availableHeight = Math.max(tableSize, area.h - 38);
    const stepX = columns > 1 ? Math.max(tableSize + 4, Math.min(tableSize + gap, (availableWidth - tableSize) / (columns - 1))) : 0;
    const stepY = rows > 1 ? Math.max(tableSize + 4, Math.min(tableSize + gap, (availableHeight - tableSize) / (rows - 1))) : 0;

    const candidateNumbers = Array.from({ length: count }, (_, index) => String(startingNumber + index));
    const existingNumbers = new Set(
      tables
        .filter((table) => !config.replaceAreaTables || !(table.areaId === area.id || table.zone === area.label))
        .map((table) => String(table.number))
    );
    const duplicateNumber = candidateNumbers.find((number) => existingNumbers.has(number));
    if (duplicateNumber) {
      return { ok: false, message: `Table ${duplicateNumber} already exists. Change the starting number.` };
    }

    const nextTables = Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const rawX = area.x + 12 + column * stepX;
      const rawY = area.y + 30 + row * stepY;
      return {
        id: uid("t"),
        number: String(startingNumber + index),
        capacity,
        zone: area.label,
        areaId: area.id,
        type: ["super", "ambassador"].includes(tableType) ? "super" : "regular",
        tableType,
        displaySize: { width: tableSize, height: tableSize },
        status: "available",
        statusUpdatedAt: null,
        serverId: null,
        guestName: "",
        partySize: null,
        color: null,
        groupId: null,
        parentId: null,
        childIds: null,
        pos: {
          x: Math.max(0, Math.min(layoutConfig.canvasWidth - tableSize, rawX)),
          y: Math.max(0, Math.min(layoutConfig.canvasHeight - tableSize, rawY)),
        },
      };
    });

    setTables((previous) => {
      const retained = config.replaceAreaTables
        ? previous.filter((table) => {
            const belongsToArea = table.areaId === area.id || table.zone === area.label;
            return !belongsToArea || table.parentId || (table.childIds && table.childIds.length);
          })
        : previous;
      return [...retained, ...nextTables];
    });

    return {
      ok: true,
      count,
      areaLabel: area.label,
      nextStartingNumber: startingNumber + count,
      tableIds: nextTables.map((table) => table.id),
    };
  }, [areas, getNextTableNumber, layoutConfig.canvasHeight, layoutConfig.canvasWidth, permissions.canManageTables, setTables, tables]);

  const duplicateAreaWithTables = useCallback((areaId) => {
    if (!permissions.canManageZones || !permissions.canManageTables) {
      return { ok: false, message: "Lead access is required." };
    }
    const source = areas.find((area) => area.id === areaId);
    if (!source) return { ok: false, message: "Choose an area first." };

    const newAreaId = uid("area");
    const offset = 36;
    const copiedArea = {
      ...source,
      id: newAreaId,
      label: `${source.label} Copy`,
      x: Math.min(layoutConfig.canvasWidth - source.w, source.x + offset),
      y: Math.min(layoutConfig.canvasHeight - source.h, source.y + offset),
      protected: false,
      locked: false,
      status: "available",
      statusUpdatedAt: null,
    };

    const sourceTables = tables.filter((table) =>
      !(table.childIds && table.childIds.length) &&
      (table.areaId === source.id || table.zone === source.label)
    );
    const nextNumber = getNextTableNumber();
    const copiedTables = sourceTables.map((table, index) => ({
      ...table,
      id: uid("t"),
      number: String(nextNumber + index),
      zone: copiedArea.label,
      areaId: copiedArea.id,
      status: "available",
      statusUpdatedAt: null,
      guestName: "",
      partySize: null,
      groupId: null,
      parentId: null,
      childIds: null,
      pos: {
        x: Math.max(0, Math.min(layoutConfig.canvasWidth - 64, table.pos.x + (copiedArea.x - source.x))),
        y: Math.max(0, Math.min(layoutConfig.canvasHeight - 64, table.pos.y + (copiedArea.y - source.y))),
      },
    }));

    setAreas((previous) => [...previous, copiedArea]);
    if (copiedTables.length) setTables((previous) => [...previous, ...copiedTables]);
    setSelectedAreaId(newAreaId);
    return {
      ok: true,
      areaId: newAreaId,
      message: `${copiedArea.label} created with ${copiedTables.length} copied tables.`,
    };
  }, [areas, getNextTableNumber, layoutConfig.canvasHeight, layoutConfig.canvasWidth, permissions.canManageTables, permissions.canManageZones, setAreas, setTables, tables]);

  const exportVenueLayout = useCallback(() => {
    if (!permissions.canEditLayout) return;
    const payload = {
      format: "pcc-seating-venue-layout",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      venueId: activeRid,
      venueName: layoutConfig.name,
      canvas: { width: layoutConfig.canvasWidth, height: layoutConfig.canvasHeight },
      areas,
      tables,
      servers,
      groups,
      operations: venueOperations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchorElement = document.createElement("a");
    anchorElement.href = url;
    anchorElement.download = `${activeRid}-venue-layout-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchorElement);
    anchorElement.click();
    anchorElement.remove();
    URL.revokeObjectURL(url);
  }, [activeRid, areas, groups, layoutConfig.canvasHeight, layoutConfig.canvasWidth, layoutConfig.name, permissions.canEditLayout, servers, tables, venueOperations]);

  const importVenueLayout = useCallback((payload) => {
    if (!permissions.canEditLayout) return { ok: false, message: "Developer or Lead access is required." };
    if (!payload || payload.format !== "pcc-seating-venue-layout") {
      return { ok: false, message: "This is not a PCC venue-layout export." };
    }
    if (!Array.isArray(payload.areas) || !Array.isArray(payload.tables)) {
      return { ok: false, message: "The layout file is missing areas or tables." };
    }
    if (!window.confirm(`Replace the current ${layoutConfig.name} layout with this imported backup?`)) {
      return { ok: false, message: "Import cancelled." };
    }

    const normalizedAreas = payload.areas.map((area) => ({
      status: "available",
      statusUpdatedAt: null,
      locked: false,
      hidden: false,
      rotate: 0,
      protected: false,
      ...area,
    }));
    const normalizedTables = payload.tables.map((table) => ({
      tableType: table.tableType ?? (table.type === "super" ? "supervisor" : "regular"),
      status: table.status ?? "available",
      statusUpdatedAt: table.statusUpdatedAt ?? null,
      guestName: table.guestName ?? "",
      partySize: table.partySize ?? null,
      serverId: table.serverId ?? null,
      groupId: table.groupId ?? null,
      parentId: table.parentId ?? null,
      childIds: table.childIds ?? null,
      pos: table.pos ?? { x: 40, y: 40 },
      ...table,
    }));

    setAreas(normalizedAreas);
    setTables(normalizedTables);
    setServersByR((previous) => ({ ...previous, [activeRid]: Array.isArray(payload.servers) ? payload.servers : [] }));
    setGroupsByR((previous) => ({ ...previous, [activeRid]: Array.isArray(payload.groups) ? payload.groups : [] }));
    if (payload.operations) updateVenueOperations(payload.operations);
    if (payload.canvas?.width && payload.canvas?.height) {
      setCanvasSettingsByR((previous) => ({ ...previous, [activeRid]: { width: Number(payload.canvas.width), height: Number(payload.canvas.height) } }));
    }
    setSelectedAreaId(null);
    setSelectedTableId(null);
    return { ok: true, message: `${layoutConfig.name} layout imported successfully.` };
  }, [activeRid, layoutConfig.name, permissions.canEditLayout, setAreas, setTables, updateVenueOperations]);

  const resetVenueLayout = useCallback(() => {
    if (!permissions.canEditLayout) return;
    if (!window.confirm(`Reset ${layoutConfig.name} tables and areas to the built-in defaults? This cannot be undone unless you exported a backup.`)) return;
    setAreas(cloneDefaultAreas(activeRid));
    setTables(seedTables(activeRid, seedZones[activeRid] || []));
    setServersByR((previous) => ({ ...previous, [activeRid]: [] }));
    setGroupsByR((previous) => ({ ...previous, [activeRid]: [] }));
    setSelectedAreaId(null);
    setSelectedTableId(null);
  }, [activeRid, layoutConfig.name, permissions.canEditLayout, setAreas, setTables]);


  const updateStaffingAssignment = (areaId, assignment) => {
    setStaffingAssignments((previous) => {
      const next = { ...previous };
      if (assignment) next[areaId] = assignment;
      else delete next[areaId];
      return next;
    });
    setStaffingSaveState("dirty");
  };

  const saveStaffing = async () => {
    if (!permissions.canEditRestaurantSetup) return;
    setStaffingSaveState("saving");
    try {
      await saveVenueStaffing(activeRid, staffingDate, staffingAssignments, { uid: authSession.user.uid, name: authSession.profile.displayName });
      setStaffingSaveState("saved");
    } catch (error) {
      console.error("Unable to save staffing:", error);
      setStaffingSaveState("error");
    }
  };

  const toolTabs = [
    { id: "tables", label: "Tables", icon: Plus },
    { id: "servers", label: "Servers", icon: Users },
    { id: "groups", label: "Groups", icon: Building2 },
    { id: "areas", label: "Areas", icon: MousePointer2 },
    { id: "designer", label: "Designer", icon: Grid3X3 },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "capacity", label: "Capacity", icon: Gauge },
    { id: "staffing", label: "Staffing", icon: CalendarDays },
    { id: "help", label: "Help", icon: CircleHelp },
    { id: "layout", label: "Layout", icon: Maximize2 },
  ];

  return (
    <div className="workspace-app">
      <AppHeader
        title={`${RESTAURANT_LAYOUT_CONFIG[activeRid].name} Seating Layout`}
        instructions={instructions}
        saveLabel={saveLabel}
        saveDotClass={saveDotClass}
        cloudState={cloudState}
        lastCloudSavedAt={lastCloudSavedAt}
        profile={authSession.profile}
        currentRole={currentRole}
        visibleRestaurants={visibleRestaurants}
        activeRid={activeRid}
        layoutConfig={RESTAURANT_LAYOUT_CONFIG}
        onVenueChange={(restaurantId) => {
          if (!authorizedVenueIds.includes(restaurantId)) return;
          setActiveRid(restaurantId);
          setSelectedTableId(null);
          setSelectedAreaId(null);
          setAreaEditMode(false);
        }}
        onSignOut={signOutEmployee}
      />

      <main className="workspace-main">
        <ToolSidebar
          tabs={toolTabs}
          activeTool={activeTool}
          onToolChange={setActiveTool}
        >
          {activeTool === "tables" && (
            <div className="workspace-tool-content">
              <div>
                <h2>Table tools</h2>
                <p>Add tables, then select a table on the floor to edit its guest and seating information.</p>
              </div>
              <label className="quick-table-type">
                <span>Table category</span>
                <select value={quickTableType} onChange={(event) => setQuickTableType(event.target.value)}>
                  {TABLE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="quick-capacity-grid" aria-label="Quick table capacities">
                {[1,2,3,4,5,6,7,8,9,10].map((capacity) => (
                  <LockedButton
                    key={capacity}
                    allowed={permissions.canManageTables}
                    onClick={() => addBlankTable(capacity, quickTableType)}
                    className="quick-capacity-button"
                    title={`Add a ${capacity}-seat ${getTableTypeDefinition(quickTableType).label} table`}
                  >
                    +{capacity}
                  </LockedButton>
                ))}
              </div>
              <div className="quick-custom-capacity">
                <label><span>Custom capacity</span><input type="number" min="1" max="300" value={customQuickCapacity} onChange={(event) => setCustomQuickCapacity(Number(event.target.value) || 1)} /></label>
                <LockedButton allowed={permissions.canManageTables} onClick={() => addBlankTable(customQuickCapacity, quickTableType)} className="workspace-primary-action">+ Add custom table</LockedButton>
              </div>
              <div className="workspace-help-card">
                <strong>Quick controls</strong>
                <span>Click: select table</span>
                <span>Double-click: change status</span>
                <span>Drag: reposition</span>
                <span>Right-click: delete</span>
              </div>
            </div>
          )}

          {activeTool === "servers" && (
            <ServerPanel
              servers={servers}
              onAdd={addServer}
              onRemove={removeServer}
              canManage={permissions.canManageServers}
            />
          )}

          {activeTool === "groups" && (
            <GroupPanel
              groups={groups}
              tables={tables}
              onAdd={addGroup}
              onRemove={removeGroup}
              canManage={permissions.canManageGroups}
            />
          )}

          {activeTool === "areas" && (
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
          )}

          {activeTool === "designer" && (
            <VenueDesignerPanel
              venueName={layoutConfig.name}
              areas={areas}
              selectedAreaId={selectedAreaId}
              tables={tables}
              canManage={permissions.canEditLayout}
              canvasWidth={layoutConfig.canvasWidth}
              canvasHeight={layoutConfig.canvasHeight}
              onResizeCanvas={({ width, height }) => setCanvasSettingsByR((previous) => ({ ...previous, [activeRid]: { width, height } }))}
              onSelectTable={(id) => { setAreaEditMode(false); setSelectedTableId(id); }}
              onSelectArea={(id) => {
                setSelectedAreaId(id);
                if (id) setSelectedTableId(null);
              }}
              onGenerateTables={generateBulkTables}
              onDuplicateAreaWithTables={duplicateAreaWithTables}
              onExportLayout={exportVenueLayout}
              onImportLayout={importVenueLayout}
              onResetVenue={resetVenueLayout}
            />
          )}

          {activeTool === "activity" && (
            <ActivityPanel
              activity={activeVenueActivity}
              venueName={layoutConfig.name}
            />
          )}

          {activeTool === "capacity" && (
            <CapacityPanel
              venueName={layoutConfig.name}
              operations={venueOperations}
              metrics={seatingMetrics}
              onUpdate={updateVenueOperations}
              canManage={permissions.canEditRestaurantSetup}
            />
          )}

          {activeTool === "staffing" && (
            <DailyStaffingPanel
              venueName={layoutConfig.name}
              date={staffingDate}
              onDateChange={setStaffingDate}
              areas={areas}
              employees={employees}
              assignments={staffingAssignments}
              onChangeAssignment={updateStaffingAssignment}
              onSave={saveStaffing}
              canManage={permissions.canEditRestaurantSetup}
              saveState={staffingSaveState}
            />
          )}

          {activeTool === "help" && <HelpPanel />}

          {activeTool === "layout" && (
            <div className="workspace-tool-content">
              <div>
                <h2>Layout overview</h2>
                <p>Canvas and view settings for the active venue.</p>
              </div>
              <dl className="workspace-definition-list">
                <div><dt>Venue</dt><dd>{layoutConfig.name}</dd></div>
                <div><dt>Canvas</dt><dd>{layoutConfig.canvasWidth} × {layoutConfig.canvasHeight}</dd></div>
                <div><dt>Zoom</dt><dd>{Math.round(zoom * 100)}%</dd></div>
                <div><dt>Areas</dt><dd>{areas.length}</dd></div>
                <div><dt>Tables</dt><dd>{tables.filter((table) => !(table.childIds && table.childIds.length)).length}</dd></div>
              </dl>
              <button type="button" className="workspace-secondary-action" onClick={fitZoom}>
                <Maximize2 size={14} /> Fit venue to view
              </button>
            </div>
          )}
        </ToolSidebar>

        <section className="workspace-center" aria-label="Seating floor workspace">
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
        </section>

        <InspectorPanel
          title={areaEditMode ? "Area selection" : selectedTable ? `Table ${selectedTable.number}` : "Inspector"}
          empty={!selectedTable || areaEditMode}
          emptyMessage={areaEditMode
            ? "Area properties are available in the Areas tool on the left."
            : "Select a table on the floor to edit guest, server, group, status, and split details."}
        >
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
        </InspectorPanel>
      </main>

      <WorkspaceFooter
        legend={<SeatingLegend />}
        zoom={zoom}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onResetZoom={resetZoom}
        onFit={fitZoom}
        areaEditMode={areaEditMode}
      />
    </div>
  );
}

export default function SeatingLayoutApp() {
  const [authSession, setAuthSession] = useState({
    status: "loading",
    user: null,
    profile: null,
  });
  const [authError, setAuthError] = useState("");

  useEffect(() =>
    subscribeToAuthSession(
      setAuthSession,
      (error) => {
        console.error("Authentication session failed:", error);
        setAuthError("Unable to verify this account.");
      }
    ), []);

  if (authSession.status === "loading" || authSession.status === "loading-profile") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-500">
        Verifying account…
      </div>
    );
  }

  if (["missing-profile", "incomplete-profile"].includes(authSession.status)) {
    return <ProfileSetupScreen authSession={authSession} />;
  }

  if (authSession.status !== "authenticated") {
    return (
      <>
        {authError && <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{authError}</div>}
        <LoginScreen sessionStatus={authSession.status} />
      </>
    );
  }

  const authorized =
    ["admin", "developer", "director"].includes(authSession.profile.role) ||
    Object.values(authSession.profile.venueIds || {}).some(Boolean);

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-5">
        <div className="max-w-md bg-white border border-amber-200 rounded-xl p-6 text-center">
          <h1 className="font-bold text-slate-800">No venue assigned</h1>
          <p className="text-sm text-slate-500 mt-2">Ask an administrator to assign this account to Hale ʻOhana, Hale Aloha, or Gateway.</p>
          <button type="button" onClick={signOutEmployee} className="mt-4 text-sm px-3 py-2 rounded bg-slate-800 text-white">Sign out</button>
        </div>
      </div>
    );
  }

  return <SeatingWorkspace authSession={authSession} />;
}
