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
import PasswordChangeScreen from "./components/auth/PasswordChangeScreen";
import AccountSecurityModal from "./components/auth/AccountSecurityModal";
import AppHeader from "./components/layout/AppHeader";
import ToolSidebar from "./components/layout/ToolSidebar";
import InspectorPanel from "./components/layout/InspectorPanel";
import WorkspaceFooter from "./components/layout/WorkspaceFooter";
import ActivityPanel from "./components/operations/ActivityPanel";
import CapacityPanel from "./components/operations/CapacityPanel";
import VenueDesignerPanel from "./components/designer/VenueDesignerPanel";
import DailyStaffingPanel from "./components/operations/DailyStaffingPanel";
import HelpPanel from "./components/operations/HelpPanel";
import LiveOperationsDashboard from "./components/operations/LiveOperationsDashboard";
import TestingPanel from "./components/testing/TestingPanel";
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
  LayoutDashboard,
  FlaskConical,
  Save,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Minimize2,
  AlertTriangle,
  Smartphone,
  MapPinned,
  Search,
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

const GUEST_HIGHLIGHT_OPTIONS = [
  { value: "", label: "None", color: "#64748b", symbol: "" },
  { value: "birthday", label: "Birthday", color: "#ec4899", symbol: "🎂" },
  { value: "anniversary", label: "Anniversary", color: "#a855f7", symbol: "♥" },
  { value: "honeymoon", label: "Honeymoon", color: "#f43f5e", symbol: "♥" },
  { value: "retirement", label: "Retirement", color: "#f59e0b", symbol: "★" },
  { value: "congratulations", label: "Congratulations", color: "#3b82f6", symbol: "✓" },
  { value: "vip", label: "VIP", color: "#d4a017", symbol: "★" },
  { value: "allergy", label: "Allergy", color: "#ef4444", symbol: "!" },
  { value: "custom", label: "Custom", color: "#14b8a6", symbol: "•" },
];

function getGuestHighlight(value) {
  return GUEST_HIGHLIGHT_OPTIONS.find((option) => option.value === value) || GUEST_HIGHLIGHT_OPTIONS[0];
}

function ActionDialog({ dialog, onResolve }) {
  if (!dialog) return null;
  const tone = dialog.tone || "primary";
  return (
    <div className="pcc-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onResolve(false); }}>
      <section className="pcc-dialog" role="dialog" aria-modal="true" aria-labelledby="pcc-dialog-title">
        <div className={`pcc-dialog-icon ${tone}`}>
          {dialog.icon || (tone === "danger" || tone === "warning" ? <AlertTriangle size={23} /> : <Check size={23} />)}
        </div>
        <div className="pcc-dialog-copy">
          <h2 id="pcc-dialog-title">{dialog.title}</h2>
          {dialog.message && <p>{dialog.message}</p>}
        </div>
        <div className="pcc-dialog-actions">
          {dialog.kind === "confirm" && <button type="button" className="pcc-dialog-cancel" onClick={() => onResolve(false)}>{dialog.cancelLabel || "Cancel"}</button>}
          <button type="button" className={`pcc-dialog-confirm ${tone === "danger" ? "danger" : ""}`} onClick={() => onResolve(true)}>
            {dialog.confirmLabel || (dialog.kind === "confirm" ? "Confirm" : "Done")}
          </button>
        </div>
      </section>
    </div>
  );
}

const TABLE_TYPE_OPTIONS = [
  { value: "regular", label: "Regular", available: "#22c55e", occupied: "#475569", shape: "rounded" },
  { value: "alii_luau", label: "Aliʻi Luau", available: "#0ea5e9", occupied: "#075985", shape: "rounded" },
  { value: "luau", label: "Luau", available: "#f59e0b", occupied: "#92400e", shape: "rounded" },
  { value: "super_ambassadors", label: "Super Ambassadors", available: "#a855f7", occupied: "#581c87", shape: "circle" },
  { value: "gateway_regular", label: "Gateway Regular", available: "#14b8a6", occupied: "#115e59", shape: "rounded" },
  { value: "vip", label: "VIP", available: "#d4a017", occupied: "#7c5b08", shape: "rounded" },
];

function normalizeTableType(value) {
  if (["supervisor", "super", "ambassador", "super_ambassador"].includes(value)) return "super_ambassadors";
  return value || "regular";
}

function getTableTypeDefinition(value) {
  const normalized = normalizeTableType(value);
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
    canvasWidth: 4200,
    canvasHeight: 2800,
    minZoom: 0.45,
    maxZoom: 2,
    defaultZoom: 1,
    showGridDefault: false,
  },
  aloha: {
    name: "Hale Aloha",
    canvasWidth: 7200,
    canvasHeight: 4800,
    minZoom: 0.3,
    maxZoom: 2,
    defaultZoom: 0.55,
    showGridDefault: true,
  },
  gateway: {
    name: "Gateway",
    canvasWidth: 24000,
    canvasHeight: 14000,
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
    { id: "stage", label: "Stage", areaKind: "landmark", shape: "rounded", x: 300, y: 20, w: 340, h: 60, rotate: 0, locked: true, hidden: false, protected: true, status: "available", statusUpdatedAt: null },
    { id: "cr", label: "CR", areaKind: "landmark", shape: "pill", x: 20, y: 20, w: 60, h: 30, rotate: 0, locked: true, hidden: false, protected: true, status: "available", statusUpdatedAt: null },
    { id: "hibiscus", areaKind: "seating", label: "Hibiscus", shape: "rectangle", x: 20, y: 130, w: 245, h: 190, rotate: -8, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "bop", areaKind: "seating", label: "BOP", shape: "rectangle", x: 55, y: 330, w: 275, h: 185, rotate: -8, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "crown", areaKind: "seating", label: "Crown", shape: "rectangle", x: 335, y: 120, w: 150, h: 140, rotate: 0, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "ginger-2", areaKind: "seating", label: "Ginger 2", shape: "rectangle", x: 335, y: 280, w: 150, h: 140, rotate: 0, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "gardenia", areaKind: "seating", label: "Gardenia", shape: "rectangle", x: 500, y: 120, w: 150, h: 140, rotate: 0, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "ginger-1", areaKind: "seating", label: "Ginger 1", shape: "rectangle", x: 500, y: 280, w: 150, h: 140, rotate: 0, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "orchid", areaKind: "seating", label: "Orchid", shape: "rectangle", x: 735, y: 130, w: 245, h: 190, rotate: 8, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
    { id: "ilima", areaKind: "seating", label: "Ilima", shape: "rectangle", x: 670, y: 330, w: 275, h: 185, rotate: 8, locked: false, hidden: false, status: "available", statusUpdatedAt: null },
  ],
  aloha: [],
  gateway: [],
};

function cloneDefaultAreas(restaurantId) {
  return (DEFAULT_AREAS_BY_RESTAURANT[restaurantId] || []).map((area) => ({
    labelPosition: "top",
    labelAlign: "center",
    ...area,
  }));
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
        guestInitials: "",
        showTableNumber: true,
        showServerInitials: true,
        showGuestName: false,
        showGuestInitials: false,
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
  const legacy = t.tableType ?? (t.type === "super" ? "super_ambassadors" : "regular");
  return normalizeTableType(legacy);
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
    { color: "#a855f7", label: "Super Ambassadors Available" },
    { color: "#581c87", label: "Super Ambassadors Occupied" },
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
  onRequestCanvasExpand,
  onBeginInteraction,
  displaySettings,
}) {
  const interactionRef = useRef(null);

  if (area.hidden && !editMode) return null;

  const beginInteraction = (event, mode) => {
    event.stopPropagation();
    if (!editMode) return;
    onSelect(area.id);
    if (area.locked) return;
    onBeginInteraction?.();

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
      const x = Math.max(0, original.x + dx);
      const y = Math.max(0, original.y + dy);
      onRequestCanvasExpand?.(x + original.w + 600, y + original.h + 600);
      onChange(area.id, { x, y });
    }

    if (interaction.mode === "resize") {
      const w = Math.max(70, original.w + dx);
      const h = Math.max(45, original.h + dy);
      onRequestCanvasExpand?.(original.x + w + 600, original.y + h + 600);
      onChange(area.id, { w, h });
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
  const labelPosition = area.labelPosition || "top";
  const labelAlign = area.labelAlign || "center";
  const labelStyle = area.shape === "diamond" ? { transform: "rotate(-45deg)" } : undefined;

  return (
    <div
      className={`editable-area ${editMode ? "area-editable" : ""} ${selected ? "area-selected" : ""} ${area.locked ? "area-locked" : ""} ${area.hidden ? "area-hidden-preview" : ""} ${(area.areaKind ?? "seating") === "landmark" ? "area-landmark" : "area-seating"}`}
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
      {displaySettings.showAreaLabels !== false && (
        <span
          className={`editable-area-label label-${labelPosition} align-${labelAlign}`}
          style={{ ...labelStyle, fontSize: displaySettings.areaLabelSizePx }}
        >
          <span className={`inline-block w-2 h-2 rounded-full mr-1 ${area.status === "occupied" ? "bg-slate-500" : "bg-green-500"}`} />
          {area.label}
        </span>
      )}

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
  const [customLandmarkName, setCustomLandmarkName] = useState("");

  const addCustomLandmark = () => {
    const label = customLandmarkName.trim();
    if (!label) return;
    onAdd("rounded", "landmark", label);
    setCustomLandmarkName("");
  };

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
            <button type="button" onClick={() => onAdd("rectangle", "seating")}><Plus size={13} /> Rectangle</button>
            <button type="button" onClick={() => onAdd("rounded", "seating")}><Plus size={13} /> Rounded</button>
            <button type="button" onClick={() => onAdd("pill", "seating")}><Plus size={13} /> Pill</button>
            <button type="button" onClick={() => onAdd("diamond", "seating")}><Plus size={13} /> Diamond</button>
            <div className="area-manager-divider">Map landmarks</div>
            {["Stage", "Restroom", "Drinks", "Buffet", "Entrance", "Exit", "Station"].map((label) => (
              <button type="button" key={label} onClick={() => onAdd("rounded", "landmark", label)}><Plus size={13} /> {label}</button>
            ))}
            <div className="custom-landmark-creator">
              <label htmlFor="custom-landmark-name">Custom landmark</label>
              <div>
                <input
                  id="custom-landmark-name"
                  value={customLandmarkName}
                  onChange={(event) => setCustomLandmarkName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") addCustomLandmark(); }}
                  placeholder="Line 1, Fruit Station…"
                />
                <button type="button" onClick={addCustomLandmark} disabled={!customLandmarkName.trim()}><Plus size={13} /> Add</button>
              </div>
              <small>You can also select any landmark and rename it below.</small>
            </div>
            <button type="button" onClick={onReset} className="area-reset-button">Reset Venue Areas</button>
          </div>

          {selectedArea ? (
            <div className="area-editor-grid">
              <label>
                Area name
                <input value={selectedArea.label} onChange={(event) => onUpdate(selectedArea.id, { label: event.target.value })} />
              </label>
              <label>
                Area purpose
                <select value={selectedArea.areaKind ?? "seating"} onChange={(event) => onUpdate(selectedArea.id, { areaKind: event.target.value })}>
                  <option value="seating">Seating area</option>
                  <option value="landmark">Map landmark / legend only</option>
                </select>
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
                Label position
                <select value={selectedArea.labelPosition || "top"} onChange={(event) => onUpdate(selectedArea.id, { labelPosition: event.target.value })}>
                  <option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option><option value="center">Center</option>
                </select>
              </label>
              <label>
                Label alignment
                <select value={selectedArea.labelAlign || "center"} onChange={(event) => onUpdate(selectedArea.id, { labelAlign: event.target.value })}>
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </label>
              {(selectedArea.areaKind ?? "seating") === "seating" ? (
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
              ) : (
                <div className="area-landmark-note">Landmark areas are shown on the map but are excluded from guest seating and capacity totals.</div>
              )}
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
  displaySettings,
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
  onRequestCanvasExpand,
  onBeginMove,
  onEndMove,
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

  const tableNumberSizeMap = { small: 12, medium: 16, large: 22 };
  const capacitySizeMap = { small: 11, medium: 15, large: 19 };
  const resolveTableFontSize = (mode, customValue, globalValue, sizeMap) => {
    if (!mode || mode === "default") return globalValue;
    if (mode === "custom") return Math.max(8, Math.min(72, Number(customValue) || globalValue));
    return sizeMap[mode] || globalValue;
  };
  const effectiveTableNumberSize = resolveTableFontSize(
    table.tableNumberSizeMode,
    table.tableNumberCustomSize,
    displaySettings.tableNumberSizePx,
    tableNumberSizeMap
  );
  const effectiveCapacitySize = resolveTableFontSize(
    table.capacitySizeMode,
    table.capacityCustomSize,
    displaySettings.capacitySizePx,
    capacitySizeMap
  );
  const effectiveTextColor = table.textColorMode === "custom"
    ? (table.customTextColor || "#ffffff")
    : table.textColorMode === "white"
      ? "#ffffff"
      : table.textColorMode === "black"
        ? "#111827"
        : displaySettings.tableTextColor === "black" ? "#111827" : "#ffffff";
  const guestHighlight = getGuestHighlight(table.guestHighlight);
  const hasGuestHighlight = Boolean(table.guestHighlight);

  const onPointerDown = (e) => {
    e.stopPropagation();
    if (!canDrag) return; // Servers can still tap-to-select via onPointerUp below
    onBeginMove?.();
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
      const nx = Math.max(0, d.origX + dx);
      const ny = Math.max(0, d.origY + dy);
      onRequestCanvasExpand?.(nx + size.width + 600, ny + size.height + 600);
      onMove(table.id, nx, ny);
    }
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (canDrag) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) onSelect(table.id, e);
    else onEndMove?.(table.id);
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
        className={`table-chip relative flex flex-col items-center justify-center font-semibold shadow-md transition-transform hover:scale-105 ${displaySettings.accessibilityMode ? "accessibility-table" : ""} ${displaySettings.highlightTableNumbers ? "highlight-table-numbers" : ""} ${displaySettings.highlightEmptyTables && table.status !== "occupied" ? "highlight-empty-table" : ""} ${
          isSelected ? "ring-4 ring-offset-1 ring-purple-500" : ""
        } ${isSplitChild ? "ring-2 ring-offset-1 ring-orange-500" : ""} ${hasGuestHighlight ? "guest-highlight-active" : ""} ${
          typeDefinition.shape === "circle" ? "rounded-full" : "rounded-lg"
        }`}
        style={{
          width: displaySize.width,
          height: displaySize.height,
          background: fill,
          border: `${displaySettings.accessibilityMode ? 3 : 2}px solid ${borderColor}`,
          color: effectiveTextColor,
          boxShadow: hasGuestHighlight ? `0 0 0 4px ${guestHighlight.color}55, 0 8px 20px ${guestHighlight.color}44` : undefined,
        }}
        title={`Table ${table.number} · ${table.capacity} pax`}
      >
        {hasGuestHighlight && (
          <span className="guest-highlight-badge" style={{ background: guestHighlight.color }} title={table.guestHighlight === "custom" ? (table.customHighlightLabel || "Custom") : guestHighlight.label}>
            {guestHighlight.symbol || "•"}
          </span>
        )}
        {group && (
          <span
            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border-2 border-white"
            style={{ background: group.color }}
          />
        )}
        {isSplitChild && (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] bg-orange-600 text-white px-1 rounded">split</span>
        )}
        {table.isTableGroup && (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] bg-indigo-700 text-white px-1 rounded">group</span>
        )}
        {displaySettings.showTableNumbers !== false && table.showTableNumber !== false && <span className="table-number-value" style={{ fontSize: effectiveTableNumberSize }}>{table.number}</span>}
        {displaySettings.showPax !== false && <span className="table-capacity-value" style={{ fontSize: effectiveCapacitySize }}>{table.capacity}</span>}
        {displaySettings.showServerNames !== false && server && table.showServerInitials !== false && <span className="table-server-value">{server.initials}</span>}
        {displaySettings.showCelebrations !== false && table.showGuestName && table.guestName && <span className="table-chip-guest">{table.guestName}</span>}
        {displaySettings.showCelebrations !== false && table.showGuestInitials && table.guestInitials && <span className="table-chip-guest-initials">{table.guestInitials}</span>}
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

function TableEditor({ table, siblings, parentTable, servers, groups, permissions, displaySettings, onClose, onUpdate, onSplit, onMerge, onSplitGroup, onDelete }) {
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
        <label className="text-xs font-medium text-slate-500">Guest initials (optional)</label>
        <input
          value={table.guestInitials ?? ""}
          onChange={(e) => onUpdate(table.id, { guestInitials: e.target.value.toUpperCase().slice(0, 6) })}
          placeholder="e.g. LEE or LB"
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div className="table-display-toggles">
        <label><input type="checkbox" checked={table.showTableNumber !== false} onChange={(e)=>onUpdate(table.id,{showTableNumber:e.target.checked})}/> Show table number</label>
        <label><input type="checkbox" checked={table.showServerInitials !== false} onChange={(e)=>onUpdate(table.id,{showServerInitials:e.target.checked})}/> Show server initials</label>
        <label><input type="checkbox" checked={table.showGuestName === true} onChange={(e)=>onUpdate(table.id,{showGuestName:e.target.checked})}/> Show guest surname</label>
        <label><input type="checkbox" checked={table.showGuestInitials === true} onChange={(e)=>onUpdate(table.id,{showGuestInitials:e.target.checked})}/> Show guest initials</label>
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
      <div>
        <label className="text-xs font-medium text-slate-500">Guest highlight</label>
        <select value={table.guestHighlight || ""} onChange={(e) => onUpdate(table.id, { guestHighlight: e.target.value })} className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm">
          {GUEST_HIGHLIGHT_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
        </select>
        {table.guestHighlight === "custom" && <input value={table.customHighlightLabel || ""} onChange={(e) => onUpdate(table.id, { customHighlightLabel: e.target.value.slice(0, 30) })} placeholder="Custom highlight label" className="w-full mt-2 border border-slate-300 rounded px-2 py-1.5 text-sm" />}
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">Celebration message</label>
        <input value={table.celebrationMessage || ""} onChange={(e) => onUpdate(table.id, { celebrationMessage: e.target.value.slice(0, 100) })} placeholder="e.g. Sing after dessert" className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">Server notes</label>
        <textarea value={table.serverNotes || ""} onChange={(e) => onUpdate(table.id, { serverNotes: e.target.value.slice(0, 300) })} placeholder="Operational note for this table" rows={3} className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm resize-y" />
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

      <div className="table-text-customization">
        <div className="table-customization-heading">Table text appearance</div>
        <p className="table-customization-help">Use Default to follow the restaurant-wide Display settings. Overrides affect only this table.</p>

        <label className="text-xs font-medium text-slate-500">Text color</label>
        <select
          value={table.textColorMode || "default"}
          onChange={(e) => onUpdate(table.id, { textColorMode: e.target.value })}
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="default">Default ({displaySettings?.tableTextColor === "black" ? "Black" : "White"})</option>
          <option value="white">White</option>
          <option value="black">Black</option>
          <option value="custom">Custom color</option>
        </select>
        {table.textColorMode === "custom" && (
          <div className="table-custom-color-row">
            <input
              type="color"
              value={table.customTextColor || "#ffffff"}
              onChange={(e) => onUpdate(table.id, { customTextColor: e.target.value })}
              aria-label="Custom table text color"
            />
            <input
              type="text"
              value={table.customTextColor || "#ffffff"}
              onChange={(e) => {
                const value = e.target.value;
                onUpdate(table.id, { customTextColor: value });
              }}
              placeholder="#FFFFFF"
              maxLength={7}
            />
          </div>
        )}

        <label className="text-xs font-medium text-slate-500 mt-3 block">Table number size</label>
        <select
          value={table.tableNumberSizeMode || "default"}
          onChange={(e) => onUpdate(table.id, { tableNumberSizeMode: e.target.value })}
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="default">Default</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="custom">Custom size</option>
        </select>
        {table.tableNumberSizeMode === "custom" && (
          <label className="table-custom-px-row"><span>Custom size</span><input type="number" min="8" max="72" value={table.tableNumberCustomSize || 24} onChange={(e) => onUpdate(table.id, { tableNumberCustomSize: Math.max(8, Math.min(72, Number(e.target.value) || 8)) })}/><span>px</span></label>
        )}

        <label className="text-xs font-medium text-slate-500 mt-3 block">Capacity size</label>
        <select
          value={table.capacitySizeMode || "default"}
          onChange={(e) => onUpdate(table.id, { capacitySizeMode: e.target.value })}
          className="w-full mt-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="default">Default</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="custom">Custom size</option>
        </select>
        {table.capacitySizeMode === "custom" && (
          <label className="table-custom-px-row"><span>Custom size</span><input type="number" min="8" max="72" value={table.capacityCustomSize || 20} onChange={(e) => onUpdate(table.id, { capacityCustomSize: Math.max(8, Math.min(72, Number(e.target.value) || 8)) })}/><span>px</span></label>
        )}

        <button
          type="button"
          className="table-reset-appearance"
          onClick={() => onUpdate(table.id, {
            textColorMode: "default",
            customTextColor: "#ffffff",
            tableNumberSizeMode: "default",
            tableNumberCustomSize: null,
            capacitySizeMode: "default",
            capacityCustomSize: null,
          })}
        >
          Reset this table to global defaults
        </button>
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
        {table.isTableGroup ? (
          <button
            onClick={() => onSplitGroup(table.id)}
            className="w-full text-xs py-2 rounded-lg bg-indigo-700 text-white font-medium flex items-center justify-center gap-1.5"
          >
            <Scissors size={14} /> Split table group ({table.combinedTables?.length || 0} tables)
          </button>
        ) : table.parentId ? (
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

// ---------- Gateway greeter live dashboard ----------

function GatewayGreeterDashboard({ venueName, areas, tables, onLocateArea, onExit }) {
  const [partySize, setPartySize] = useState(4);
  const [query, setQuery] = useState("");
  const visibleTables = useMemo(
    () => tables.filter((table) => !(table.childIds && table.childIds.length)),
    [tables]
  );

  const tableAreaId = useCallback((table) => {
    const cx = (Number(table.pos?.x) || 0) + 18;
    const cy = (Number(table.pos?.y) || 0) + 18;
    const containing = areas.find((area) =>
      (area.areaKind ?? "seating") === "seating" &&
      !area.hidden &&
      cx >= Number(area.x) && cx <= Number(area.x) + Number(area.w) &&
      cy >= Number(area.y) && cy <= Number(area.y) + Number(area.h)
    );
    return containing?.id || "unassigned";
  }, [areas]);

  const areaRows = useMemo(() => {
    const seatingAreas = areas.filter((area) => (area.areaKind ?? "seating") === "seating" && !area.hidden);
    const rows = seatingAreas.map((area) => {
      const areaTables = visibleTables.filter((table) => tableAreaId(table) === area.id);
      const available = areaTables.filter((table) => table.status !== "occupied");
      const occupied = areaTables.filter((table) => table.status === "occupied");
      const capacities = [2, 4, 6, 8, 10, 12].map((size) => ({
        size,
        exact: available.filter((table) => Number(table.capacity) === size).length,
        fits: available.filter((table) => Number(table.capacity) >= size).length,
      }));
      const best = available
        .filter((table) => Number(table.capacity) >= partySize)
        .sort((a, b) => Number(a.capacity) - Number(b.capacity) || String(a.number).localeCompare(String(b.number)))[0];
      return { area, areaTables, available, occupied, capacities, best };
    });
    return rows.filter((row) => !query || row.area.label.toLowerCase().includes(query.toLowerCase()));
  }, [areas, visibleTables, tableAreaId, partySize, query]);

  const totals = useMemo(() => ({
    total: visibleTables.length,
    available: visibleTables.filter((table) => table.status !== "occupied").length,
    occupied: visibleTables.filter((table) => table.status === "occupied").length,
  }), [visibleTables]);

  return (
    <div className="greeter-dashboard">
      <header className="greeter-dashboard-header">
        <div>
          <span className="greeter-eyebrow">LIVE SEATING DISPATCH</span>
          <h2>{venueName} Greeter Dashboard</h2>
          <p>Updates automatically whenever a lead changes a table on the Gateway canvas.</p>
        </div>
        <button type="button" className="greeter-map-button" onClick={onExit}><MapPinned size={18}/> Open floor map</button>
      </header>

      <section className="greeter-summary-row">
        <article><strong>{totals.available}</strong><span>Available</span></article>
        <article><strong>{totals.occupied}</strong><span>Occupied</span></article>
        <article><strong>{totals.total}</strong><span>Total tables</span></article>
      </section>

      <section className="greeter-find-panel">
        <div><strong>Find seating for</strong><span>Select the arriving party size.</span></div>
        <div className="greeter-party-buttons">
          {[2,4,6,8,10,12].map((size) => <button key={size} type="button" className={partySize===size?'active':''} onClick={()=>setPartySize(size)}>{size}</button>)}
          <label>Custom<input type="number" min="1" max="100" value={partySize} onChange={(e)=>setPartySize(Math.max(1, Number(e.target.value)||1))}/></label>
        </div>
        <label className="greeter-search"><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search area…" /></label>
      </section>

      <section className="greeter-area-grid">
        {areaRows.map(({ area, areaTables, available, occupied, capacities, best }) => (
          <article className="greeter-area-card" key={area.id}>
            <div className="greeter-area-title">
              <div><h3>{area.label}</h3><span>{areaTables.length} tables</span></div>
              <strong className={available.length ? 'ready' : 'full'}>{available.length ? `${available.length} ready` : 'Full'}</strong>
            </div>
            <div className="greeter-capacity-list">
              {capacities.map(({size, exact, fits}) => <div key={size}><b>{size}</b><span>{exact} exact</span><small>{fits} can fit</small></div>)}
            </div>
            <div className="greeter-area-footer">
              <div>{best ? <><span>Best for {partySize}</span><strong>Table {best.number} · {best.capacity} seats</strong></> : <><span>Best for {partySize}</span><strong>No table available</strong></>}</div>
              <button type="button" onClick={()=>onLocateArea(area)}>View area</button>
            </div>
            <div className="greeter-card-status"><span>{available.length} available</span><span>{occupied.length} occupied</span></div>
          </article>
        ))}
        {!areaRows.length && <div className="greeter-empty">No seating areas match this search. Add or rename Gateway areas on the canvas and they will appear here automatically.</div>}
      </section>
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
  selectedIds = [],
  onSelect,
  onMove,
  permissions,
  zoom,
  onZoomChange,
  onContextDelete,
  onToggleStatus,
  onRequestCanvasExpand,
  blueprint,
  onBeginTableMove,
  onEndTableMove,
  onBeginAreaInteraction,
  onBoxSelect,
  layoutLocked = false,
  displaySettings,
  panPosition,
  onPanChange,
}) {
  const { canvasWidth, canvasHeight, minZoom, maxZoom, defaultZoom } = layoutConfig;

  const clampZoom = (value) => Math.max(minZoom, Math.min(maxZoom, value));

  const onWheel = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    onZoomChange(clampZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08)));
  };

  const scrollRef = useRef(null);
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const lassoRef = useRef(null);
  const [selectionBox, setSelectionBox] = useState(null);

  const touchDistance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const touchMidpoint = (touches) => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 });
  const onTouchStart = (event) => {
    if (event.touches.length !== 2) return;
    const node = scrollRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const midpoint = touchMidpoint(event.touches);
    pinchRef.current = {
      distance: touchDistance(event.touches),
      zoom,
      contentX: (node.scrollLeft + midpoint.x - rect.left) / zoom,
      contentY: (node.scrollTop + midpoint.y - rect.top) / zoom,
    };
  };
  const onTouchMove = (event) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const node = scrollRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const midpoint = touchMidpoint(event.touches);
    const nextZoom = clampZoom(pinchRef.current.zoom * (touchDistance(event.touches) / pinchRef.current.distance));
    onZoomChange(nextZoom);
    requestAnimationFrame(() => {
      node.scrollLeft = pinchRef.current.contentX * nextZoom - (midpoint.x - rect.left);
      node.scrollTop = pinchRef.current.contentY * nextZoom - (midpoint.y - rect.top);
    });
  };
  const onTouchEnd = (event) => { if (event.touches.length < 2) pinchRef.current = null; };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollLeft = Number(panPosition?.x) || 0;
    node.scrollTop = Number(panPosition?.y) || 0;
  }, [layoutConfig.name]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const savePan = () => onPanChange?.({ x: node.scrollLeft, y: node.scrollTop });
    node.addEventListener("scroll", savePan, { passive: true });
    return () => node.removeEventListener("scroll", savePan);
  }, [onPanChange]);

  const startLasso = (event) => {
    if (areaEditMode || event.button !== 0 || event.shiftKey || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / zoom;
    const y = (event.clientY - bounds.top) / zoom;
    lassoRef.current = { startX: x, startY: y, additive: event.ctrlKey || event.metaKey };
    setSelectionBox({ x, y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveLasso = (event) => {
    const start = lassoRef.current;
    if (!start) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const currentX = (event.clientX - bounds.left) / zoom;
    const currentY = (event.clientY - bounds.top) / zoom;
    setSelectionBox({ x: Math.min(start.startX, currentX), y: Math.min(start.startY, currentY), width: Math.abs(currentX - start.startX), height: Math.abs(currentY - start.startY) });
  };
  const endLasso = (event) => {
    const start = lassoRef.current;
    if (!start) return;
    const box = selectionBox;
    lassoRef.current = null;
    setSelectionBox(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (box && (box.width > 4 || box.height > 4)) onBoxSelect?.(box, start.additive);
    else if (!start.additive) onSelect(null);
  };
  const startPan = (event) => {
    if (!(event.button === 1 || event.shiftKey)) return;
    event.preventDefault();
    const node = scrollRef.current;
    if (!node) return;
    panRef.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop };
    node.setPointerCapture?.(event.pointerId);
  };
  const movePan = (event) => {
    const pan = panRef.current;
    const node = scrollRef.current;
    if (!pan || !node) return;
    node.scrollLeft = pan.left - (event.clientX - pan.x);
    node.scrollTop = pan.top - (event.clientY - pan.y);
  };
  const endPan = (event) => {
    if (panRef.current) scrollRef.current?.releasePointerCapture?.(event.pointerId);
    panRef.current = null;
  };

  const serverById = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  return (
    <div className="floor-canvas-shell">
      {layoutLocked && <div className="floor-mode-badge">🔒 Layout Locked</div>}
      {!layoutLocked && areaEditMode && <div className="floor-mode-badge">Area Edit Mode</div>}
      <div className="floor-workspace bg-white rounded-xl border border-slate-200">
        <div ref={scrollRef} className="floor-scroll-container" style={{ width: "100%", height: "100%", overflow: "auto" }} onWheel={onWheel} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
          <div className="floor-canvas-scale-layer" style={{ position: "relative", width: canvasWidth * zoom, height: canvasHeight * zoom }}>
          <div
            className={`floor-canvas ${areaEditMode ? "floor-area-edit-mode" : ""}`}
            style={{ position: "absolute", width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (areaEditMode) { onSelectArea(null); return; }
              startLasso(event);
            }}
            onPointerMove={moveLasso}
            onPointerUp={endLasso}
            onPointerCancel={endLasso}
          >
            {blueprint?.dataUrl && blueprint.visible !== false && (
              <img className="venue-blueprint-overlay" src={blueprint.dataUrl} alt="Imported venue blueprint" style={{ opacity: blueprint.opacity ?? 0.35 }} draggable="false" />
            )}
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
                onRequestCanvasExpand={onRequestCanvasExpand}
                onBeginInteraction={onBeginAreaInteraction}
                displaySettings={displaySettings}
              />
            ))}

            {!areaEditMode && tables
              .filter((table) => !(table.childIds && table.childIds.length))
              .map((table) => (
                <TableChip
                  key={table.id}
                  table={table}
                  displaySettings={displaySettings}
                  server={serverById.get(table.serverId)}
                  group={groupById.get(table.groupId)}
                  isSelected={selectedId === table.id || selectedIds.includes(table.id)}
                  onSelect={onSelect}
                  onMove={onMove}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  canDrag={permissions.canMoveTables}
                  canDelete={permissions.canDeleteTables}
                  onContextDelete={onContextDelete}
                  onToggleStatus={onToggleStatus}
                  onRequestCanvasExpand={onRequestCanvasExpand}
                  onBeginMove={onBeginTableMove}
                  onEndMove={onEndTableMove}
                />
              ))}
            {selectionBox && (
              <div className="table-selection-box" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />
            )}
          </div>
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
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountPasswordOpen, setAccountPasswordOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState(null);
  const dialogResolverRef = useRef(null);
  const openDialog = useCallback((dialog) => new Promise((resolve) => {
    dialogResolverRef.current = resolve;
    setActionDialog(dialog);
  }), []);
  const resolveDialog = useCallback((value) => {
    const resolve = dialogResolverRef.current;
    dialogResolverRef.current = null;
    setActionDialog(null);
    resolve?.(value);
  }, []);
  const showAlert = useCallback((title, message, options = {}) => openDialog({ kind: "alert", title, message, ...options }), [openDialog]);
  const showConfirm = useCallback((title, message, options = {}) => openDialog({ kind: "confirm", title, message, ...options }), [openDialog]);
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
  const lastCloudPartsRef = useRef({});
  const lastLocalSignatureRef = useRef("");

  const [restaurants] = useState(seedRestaurants);
  const [activeRid, setActiveRid] = useState(() =>
    seedRestaurants.some((restaurant) => restaurant.id === localSnapshot?.activeRid)
      ? localSnapshot.activeRid
      : seedRestaurants[0].id
  );

  const [layoutLocksByR, setLayoutLocksByR] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem("pcc-layout-locks-v14.3") || "{}"); } catch { return {}; }
  });
  const [layoutBaselineMetaByR, setLayoutBaselineMetaByR] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem("pcc-layout-baseline-meta-v14.3") || "{}"); } catch { return {}; }
  });
  const layoutLocked = layoutLocksByR[activeRid] === true;

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
const [blueprintsByR, setBlueprintsByR] = useState(() => Object.fromEntries(seedRestaurants.map((restaurant) => [restaurant.id, { dataUrl: null, opacity: 0.35, visible: true }])));

  useEffect(() => {
    window.localStorage.setItem("pcc-layout-locks-v14.3", JSON.stringify(layoutLocksByR));
  }, [layoutLocksByR]);
  useEffect(() => {
    window.localStorage.setItem("pcc-layout-baseline-meta-v14.3", JSON.stringify(layoutBaselineMetaByR));
  }, [layoutBaselineMetaByR]);
  useEffect(() => { if (layoutLocked) setAreaEditMode(false); }, [layoutLocked]);

  // ---------- authenticated roles & server-enforced venue access ----------
  const currentRole = authSession.profile.role;
  const isLeadOrAdmin = ["lead", "admin", "developer", "director", "manager", "assistant_manager", "front_lead", "back_lead"].includes(currentRole);
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
      setSelectedTableIds([]);
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

    canEditLayout: isLeadOrAdmin && !layoutLocked,
    canMoveTables: isLeadOrAdmin && !layoutLocked,
    canManageTables: isLeadOrAdmin && !layoutLocked,
    canDeleteTables: isLeadOrAdmin && !layoutLocked,
    canSplitTables: isLeadOrAdmin && !layoutLocked,
    canMergeTables: isLeadOrAdmin && !layoutLocked,
    canManageZones: isLeadOrAdmin && !layoutLocked,
    canManageServers: isLeadOrAdmin && !layoutLocked,
    canManageGroups: isLeadOrAdmin && !layoutLocked,
    canUseBulkGenerator: isLeadOrAdmin && !layoutLocked,
    canEditRestaurantSetup: isLeadOrAdmin && !layoutLocked,
    canManageStaffing: ["lead", "admin", "developer", "director", "manager", "assistant_manager", "front_lead", "back_lead"].includes(currentRole),
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
            showGrid: typeof saved?.showGrid === "boolean" ? saved.showGrid : RESTAURANT_LAYOUT_CONFIG[restaurant.id]?.showGridDefault ?? false,
            tableNumberSize: saved?.tableNumberSize || "medium",
            capacitySize: saved?.capacitySize || "large",
            tableTextColor: saved?.tableTextColor === "black" ? "black" : "white",
            accessibilityMode: Boolean(saved?.accessibilityMode),
            showTableNumbers: saved?.showTableNumbers !== false,
            showPax: saved?.showPax !== false,
            showAreaLabels: saved?.showAreaLabels !== false,
            showServerNames: saved?.showServerNames !== false,
            showCelebrations: saved?.showCelebrations !== false,
            highlightEmptyTables: Boolean(saved?.highlightEmptyTables),
            highlightTableNumbers: Boolean(saved?.highlightTableNumbers),
            sidebarCollapsed: Boolean(saved?.sidebarCollapsed),
            inspectorCollapsed: Boolean(saved?.inspectorCollapsed),
            operationsView: Boolean(saved?.operationsView),
            pan: saved?.pan || { x: 0, y: 0 },
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
  const updateViewSettings = (patch) => setViewSettingsByRestaurant((prev) => ({ ...prev, [activeRid]: { ...prev[activeRid], ...patch } }));
  const tableNumberSizeMap = { small: 12, medium: 16, large: 22 };
  const capacitySizeMap = { small: 11, medium: 15, large: 19 };
  const rawDisplaySettings = viewSettingsByRestaurant[activeRid] || {};
  const displaySettings = {
    ...rawDisplaySettings,
    tableNumberSizePx: rawDisplaySettings.accessibilityMode ? 22 : tableNumberSizeMap[rawDisplaySettings.tableNumberSize || "medium"],
    capacitySizePx: rawDisplaySettings.accessibilityMode ? 19 : capacitySizeMap[rawDisplaySettings.capacitySize || "large"],
    tableTextColor: rawDisplaySettings.tableTextColor === "black" ? "black" : "white",
    areaLabelSizePx: rawDisplaySettings.accessibilityMode ? 17 : 12,
  };

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => Boolean(viewSettingsByRestaurant[activeRid]?.sidebarCollapsed));
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => Boolean(viewSettingsByRestaurant[activeRid]?.inspectorCollapsed));
  const [operationsView, setOperationsView] = useState(() => Boolean(viewSettingsByRestaurant[activeRid]?.operationsView));
  const [mobileFocusMode, setMobileFocusMode] = useState(false);
  const [greeterView, setGreeterView] = useState(false);
  useEffect(() => {
    const saved = viewSettingsByRestaurant[activeRid] || {};
    setSidebarCollapsed(Boolean(saved.sidebarCollapsed));
    setInspectorCollapsed(Boolean(saved.inspectorCollapsed));
    setOperationsView(Boolean(saved.operationsView));
  }, [activeRid]);

  useEffect(() => {
    updateViewSettings({ sidebarCollapsed, inspectorCollapsed, operationsView });
  }, [sidebarCollapsed, inspectorCollapsed, operationsView]);

  const tableClipboardRef = useRef([]);
  const [activeTool, setActiveTool] = useState("tables");
  const [quickTableType, setQuickTableType] = useState("regular");
  const [customQuickCapacity, setCustomQuickCapacity] = useState(16);
  const [historyByR, setHistoryByR] = useState(() => Object.fromEntries(seedRestaurants.map((r) => [r.id, []])));
  const [futureByR, setFutureByR] = useState(() => Object.fromEntries(seedRestaurants.map((r) => [r.id, []])));
  const safeSnapshotRef = useRef(null);
  const retryCloudRef = useRef(null);
  const localTableEditUntilRef = useRef({});

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
          seedRestaurants.forEach((restaurant) => {
            const data = operational[restaurant.id];
            if (!data) return;
            lastCloudPartsRef.current[restaurant.id] = {
              tables: JSON.stringify(data.tables ?? []), servers: JSON.stringify(data.servers ?? []),
              groups: JSON.stringify(data.groups ?? []), areas: JSON.stringify(data.areas ?? []),
              canvas: JSON.stringify(data.canvas ?? {}), operations: JSON.stringify(data.operations ?? {}),
            };
          });

          setTablesByR((previous) =>
            Object.fromEntries(seedRestaurants.map((restaurant) => [
              restaurant.id,
              Date.now() < (localTableEditUntilRef.current[restaurant.id] || 0)
                ? previous[restaurant.id] ?? []
                : operational[restaurant.id].tables ?? previous[restaurant.id] ?? [],
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
    retryCloudRef.current = () => { lastCloudSignatureRef.current = ""; setCloudState("connecting"); setTablesByR((prev) => ({ ...prev })); };
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
          visibleRestaurants.map((restaurant) => {
            const venueData = operational[restaurant.id];
            const previous = lastCloudPartsRef.current[restaurant.id] || {};
            const current = {
              tables: JSON.stringify(venueData.tables || []), servers: JSON.stringify(venueData.servers || []),
              groups: JSON.stringify(venueData.groups || []), areas: JSON.stringify(venueData.areas || []),
              canvas: JSON.stringify(venueData.canvas || {}), operations: JSON.stringify(venueData.operations || {}),
            };
            const dirtyKeys = Object.keys(current).filter((key) => current[key] !== previous[key]);
            if (!dirtyKeys.length) return Promise.resolve();
            return saveVenueToCloud(restaurant.id, venueData, { uid: authSession.user.uid, clientId, role: currentRole }, dirtyKeys)
              .then(() => { lastCloudPartsRef.current[restaurant.id] = current; localTableEditUntilRef.current[restaurant.id] = 0; });
          })
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

  const captureVenueSnapshot = useCallback(() => ({
    tables: structuredClone(tablesByR[activeRid] || []),
    areas: structuredClone(areasByR[activeRid] || []),
    servers: structuredClone(serversByR[activeRid] || []),
    groups: structuredClone(groupsByR[activeRid] || []),
    canvas: structuredClone(canvasSettingsByR[activeRid] || {}),
    operations: structuredClone(venueOperationsByR[activeRid] || {}),
  }), [activeRid, tablesByR, areasByR, serversByR, groupsByR, canvasSettingsByR, venueOperationsByR]);

  const pushHistory = useCallback(() => {
    const snapshot = captureVenueSnapshot();
    setHistoryByR((prev) => ({ ...prev, [activeRid]: [...(prev[activeRid] || []), snapshot].slice(-40) }));
    setFutureByR((prev) => ({ ...prev, [activeRid]: [] }));
    safeSnapshotRef.current = snapshot;
  }, [activeRid, captureVenueSnapshot]);

  const restoreVenueSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setTablesByR((prev) => ({ ...prev, [activeRid]: structuredClone(snapshot.tables || []) }));
    setAreasByR((prev) => ({ ...prev, [activeRid]: structuredClone(snapshot.areas || []) }));
    setServersByR((prev) => ({ ...prev, [activeRid]: structuredClone(snapshot.servers || []) }));
    setGroupsByR((prev) => ({ ...prev, [activeRid]: structuredClone(snapshot.groups || []) }));
    setCanvasSettingsByR((prev) => ({ ...prev, [activeRid]: structuredClone(snapshot.canvas || prev[activeRid]) }));
    setVenueOperationsByR((prev) => ({ ...prev, [activeRid]: structuredClone(snapshot.operations || prev[activeRid]) }));
    setSelectedTableId(null); setSelectedAreaId(null);
  }, [activeRid]);

  const undo = useCallback(() => {
    const stack = historyByR[activeRid] || []; if (!stack.length) return;
    const previous = stack[stack.length - 1]; const current = captureVenueSnapshot();
    setHistoryByR((all) => ({ ...all, [activeRid]: stack.slice(0, -1) }));
    setFutureByR((all) => ({ ...all, [activeRid]: [...(all[activeRid] || []), current].slice(-40) }));
    restoreVenueSnapshot(previous);
  }, [activeRid, historyByR, captureVenueSnapshot, restoreVenueSnapshot]);

  const redo = useCallback(() => {
    const stack = futureByR[activeRid] || []; if (!stack.length) return;
    const next = stack[stack.length - 1]; const current = captureVenueSnapshot();
    setFutureByR((all) => ({ ...all, [activeRid]: stack.slice(0, -1) }));
    setHistoryByR((all) => ({ ...all, [activeRid]: [...(all[activeRid] || []), current].slice(-40) }));
    restoreVenueSnapshot(next);
  }, [activeRid, futureByR, captureVenueSnapshot, restoreVenueSnapshot]);

  const restoreSafeSnapshot = useCallback(async () => {
    if (!safeSnapshotRef.current) { await showAlert("No snapshot available", "Make a change first so the app can create a safe restore point."); return; }
    if (await showConfirm("Restore safe snapshot?", "The active venue will return to the most recent safe snapshot.", { confirmLabel: "Restore" })) restoreVenueSnapshot(safeSnapshotRef.current);
  }, [restoreVenueSnapshot]);

  const setTables = useCallback(
    (updater) => {
      // Protect active drag/generator edits from an older Firebase echo while
      // the debounced cloud save is still in flight.
      localTableEditUntilRef.current[activeRid] = Date.now() + 5000;
      setTablesByR((prev) => ({
        ...prev,
        [activeRid]: typeof updater === "function" ? updater(prev[activeRid] || []) : updater,
      }));
    },
    [activeRid]
  );

  const visibleTables = useMemo(
    () => tables.filter((table) => !(table.childIds && table.childIds.length)),
    [tables]
  );

  const selectTable = useCallback((id, event) => {
    const additive = bulkSelectMode || event?.ctrlKey || event?.metaKey || event?.shiftKey;
    if (!id) {
      setSelectedTableId(null);
      setSelectedTableIds([]);
      return;
    }
    if (additive) {
      setSelectedTableIds((previous) => {
        const exists = previous.includes(id);
        const next = exists ? previous.filter((tableId) => tableId !== id) : [...previous, id];
        setSelectedTableId(next.includes(id) ? id : next.at(-1) || null);
        return next;
      });
      return;
    }
    setSelectedTableId(id);
    setSelectedTableIds([id]);
  }, [bulkSelectMode]);

  const clearTableSelection = useCallback(() => {
    setSelectedTableId(null);
    setSelectedTableIds([]);
  }, []);

  const selectAllTables = useCallback(() => {
    const ids = visibleTables.map((table) => table.id);
    setSelectedTableIds(ids);
    setSelectedTableId(ids.at(-1) || null);
  }, [visibleTables]);

  const selectTablesInBox = useCallback((box, additive = false) => {
    const ids = visibleTables.filter((table) => {
      const size = getTableDisplaySize(table);
      const left = table.pos.x;
      const top = table.pos.y;
      const right = left + size.width;
      const bottom = top + size.height;
      return right >= box.x && left <= box.x + box.width && bottom >= box.y && top <= box.y + box.height;
    }).map((table) => table.id);
    setSelectedTableIds((previous) => {
      const next = additive ? Array.from(new Set([...previous, ...ids])) : ids;
      setSelectedTableId(next.at(-1) || null);
      return next;
    });
  }, [visibleTables]);

  const applyBulkTablePatch = useCallback((patch) => {
    if (!permissions.canManageTables || selectedTableIds.length === 0) return;
    pushHistory();
    const selected = new Set(selectedTableIds);
    setTables((previous) => previous.map((table) => selected.has(table.id) ? { ...table, ...patch } : table));
  }, [permissions.canManageTables, pushHistory, selectedTableIds, setTables]);

  const copySelectedTables = useCallback(() => {
    if (!selectedTableIds.length) return;
    const selected = new Set(selectedTableIds);
    tableClipboardRef.current = tables.filter((table) => selected.has(table.id) && !table.parentId).map((table) => structuredClone(table));
  }, [selectedTableIds, tables]);

  const pasteSelectedTables = useCallback(() => {
    const copied = tableClipboardRef.current || [];
    if (!permissions.canManageTables || !copied.length) return;
    pushHistory();
    const usedNumbers = new Set(tables.map((table) => String(table.number)));
    let candidate = Math.max(0, ...tables.map((table) => Number.parseInt(table.number, 10)).filter(Number.isFinite)) + 1;
    const pasted = copied.map((table) => {
      while (usedNumbers.has(String(candidate))) candidate += 1;
      const number = String(candidate++);
      usedNumbers.add(number);
      return { ...structuredClone(table), id: uid("t"), number, parentId: null, childIds: null, pos: { x: Math.max(0, (table.pos?.x || 0) + 28), y: Math.max(0, (table.pos?.y || 0) + 28) } };
    });
    setTables((previous) => [...previous, ...pasted]);
    setSelectedTableIds(pasted.map((table) => table.id));
    setSelectedTableId(pasted.at(-1)?.id || null);
    tableClipboardRef.current = pasted.map((table) => structuredClone(table));
  }, [permissions.canManageTables, pushHistory, setTables, tables]);

  const deleteSelectedTables = useCallback(async () => {
    if (!permissions.canDeleteTables || selectedTableIds.length === 0) return;
    const selected = new Set(selectedTableIds);
    const splitChildSelected = tables.some((table) => selected.has(table.id) && table.parentId);
    if (splitChildSelected) {
      await showAlert("Table cannot be deleted", "Merge the split table before deleting its individual parts.", { tone: "warning" });
      return;
    }
    if (!await showConfirm("Delete selected tables?", `${selectedTableIds.length} selected table${selectedTableIds.length === 1 ? "" : "s"} will be removed.`, { confirmLabel: "Delete", tone: "danger" })) return;
    pushHistory();
    setTables((previous) => previous.filter((table) => !selected.has(table.id) && !selected.has(table.parentId)));
    clearTableSelection();
  }, [clearTableSelection, permissions.canDeleteTables, pushHistory, selectedTableIds, setTables, tables]);

  const clearAllTables = useCallback(async () => {
    if (!permissions.canDeleteTables) return;
    if (!await showConfirm("Delete all tables?", `All tables in ${layoutConfig.name} will be removed. Areas and landmarks will remain.`, { confirmLabel: "Delete all", tone: "danger" })) return;
    pushHistory();
    setTables([]);
    clearTableSelection();
  }, [clearTableSelection, layoutConfig.name, permissions.canDeleteTables, pushHistory, setTables]);

  const saveDailyLayoutSnapshot = useCallback(async () => {
    if (!isLeadOrAdmin) return;
    const snapshot = captureVenueSnapshot();
    safeSnapshotRef.current = snapshot;
    const savedAt = new Date().toISOString();
    try {
      localStorage.setItem(`pcc-seating-layout-baseline-v14.3:${activeRid}`, JSON.stringify({ savedAt, venueId: activeRid, snapshot }));
      setLayoutBaselineMetaByR((previous) => ({ ...previous, [activeRid]: savedAt }));
      await showAlert("Layout saved", `${layoutConfig.name} is now the baseline for Reset Today’s Tables.`);
    } catch (error) {
      console.error("Unable to save layout baseline:", error);
      await showAlert("Layout could not be saved", "The browser could not store the layout baseline.", { tone: "danger" });
    }
  }, [activeRid, captureVenueSnapshot, isLeadOrAdmin, layoutConfig.name]);

  const toggleLayoutLock = useCallback(() => {
    if (!isLeadOrAdmin) return;
    setLayoutLocksByR((previous) => ({ ...previous, [activeRid]: !previous[activeRid] }));
    setSelectedAreaId(null);
    setSelectedTableId(null);
    setSelectedTableIds([]);
  }, [activeRid, isLeadOrAdmin]);

  const resetTodaysTables = useCallback(async () => {
    if (!isLeadOrAdmin) return;
    let stored;
    try { stored = JSON.parse(localStorage.getItem(`pcc-seating-layout-baseline-v14.3:${activeRid}`) || "null"); } catch { stored = null; }
    if (!stored?.snapshot?.tables) {
      await showAlert("No saved baseline", "Save Layout first before resetting today’s tables.", { tone: "warning" });
      return;
    }
    if (!await showConfirm("Reset today’s tables?", `Guest details, status, server assignments, and groups in ${layoutConfig.name} will be cleared while the saved venue layout is restored.`, { confirmLabel: "Reset tables", tone: "warning" })) return;
    pushHistory();
    const baseline = stored.snapshot;
    const cleanTables = structuredClone(baseline.tables).map((table) => ({
      ...table, status: "available", statusUpdatedAt: null, serverId: null, groupId: null,
      guestName: "", guestInitials: "", partySize: null, color: null,
    }));
    setTablesByR((previous) => ({ ...previous, [activeRid]: cleanTables }));
    setAreasByR((previous) => ({ ...previous, [activeRid]: structuredClone(baseline.areas || previous[activeRid] || []) }));
    setCanvasSettingsByR((previous) => ({ ...previous, [activeRid]: structuredClone(baseline.canvas || previous[activeRid]) }));
    setSelectedAreaId(null); setSelectedTableId(null); setSelectedTableIds([]);
  }, [activeRid, isLeadOrAdmin, layoutConfig.name, pushHistory]);


  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); selectAllTables(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && selectedTableIds.length) { event.preventDefault(); copySelectedTables(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { event.preventDefault(); pasteSelectedTables(); }
      if (event.key === "Escape") { clearTableSelection(); setBulkSelectMode(false); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedTableIds.length) { event.preventDefault(); deleteSelectedTables(); }
      if (selectedTableIds.length && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 20 : 5;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        pushHistory();
        const selected = new Set(selectedTableIds);
        setTables((previous) => previous.map((table) => selected.has(table.id)
          ? { ...table, pos: { x: Math.max(0, table.pos.x + dx), y: Math.max(0, table.pos.y + dy) } }
          : table));
      }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, selectAllTables, clearTableSelection, deleteSelectedTables, selectedTableIds, pushHistory, setTables, copySelectedTables, pasteSelectedTables]);

  useEffect(() => {
    if (!safeSnapshotRef.current) safeSnapshotRef.current = captureVenueSnapshot();
  }, [activeRid, captureVenueSnapshot]);
  // Guest name + status may always be edited (by Server or Lead); everything
  // else in the patch is dropped unless the caller has layout-edit rights.
  // This enforces permissions inside the handler itself, not just in the UI
  // that calls it (section 3).
  const updateTable = (id, patch) => {
    pushHistory();
    const allowedKeys = permissions.canEditLayout
      ? Object.keys(patch)
      : Object.keys(patch).filter((key) => ["status", "guestName", "guestInitials", "partySize", "showTableNumber", "showServerInitials", "showGuestName", "showGuestInitials", "guestHighlight", "customHighlightLabel", "celebrationMessage", "serverNotes"].includes(key));
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

  const requestCanvasExpansion = useCallback((requiredWidth, requiredHeight) => {
    setCanvasSettingsByR((previous) => {
      const current = previous[activeRid] || { width: layoutConfig.canvasWidth, height: layoutConfig.canvasHeight };
      const nextWidth = Math.min(200000, Math.max(current.width, Math.ceil(requiredWidth / 500) * 500));
      const nextHeight = Math.min(200000, Math.max(current.height, Math.ceil(requiredHeight / 500) * 500));
      if (nextWidth === current.width && nextHeight === current.height) return previous;
      return { ...previous, [activeRid]: { width: nextWidth, height: nextHeight } };
    });
  }, [activeRid, layoutConfig.canvasHeight, layoutConfig.canvasWidth]);

  const moveTable = (id, x, y) => {
    if (!permissions.canMoveTables) return;
    const source = tables.find((table) => table.id === id);
    if (!source) return;
    const isGroupMove = selectedTableIds.length > 1 && selectedTableIds.includes(id);
    const dx = x - source.pos.x;
    const dy = y - source.pos.y;
    const selected = new Set(selectedTableIds);
    setTables((previous) => previous.map((table) => {
      if (isGroupMove && selected.has(table.id)) {
        return { ...table, pos: { x: Math.max(0, table.pos.x + dx), y: Math.max(0, table.pos.y + dy) } };
      }
      return table.id === id ? { ...table, pos: { x, y } } : table;
    }));
  };

  const combineTables = useCallback((tableIds) => {
    if (!permissions.canManageTables) return;
    const ids = Array.from(new Set(tableIds));
    const selectedTables = tables.filter((table) => ids.includes(table.id));
    if (selectedTables.length < 2) return;

    const materialize = (table) => table.isTableGroup && Array.isArray(table.combinedTables)
      ? table.combinedTables.map((child) => ({
          ...structuredClone(child),
          groupOffset: undefined,
          pos: {
            x: table.pos.x + (Number(child.groupOffset?.x) || 0),
            y: table.pos.y + (Number(child.groupOffset?.y) || 0),
          },
        }))
      : [structuredClone(table)];

    const originals = selectedTables.flatMap(materialize);
    const minX = Math.min(...originals.map((table) => table.pos.x));
    const minY = Math.min(...originals.map((table) => table.pos.y));
    const numbers = originals.map((table) => String(table.number));
    const totalCapacity = originals.reduce((sum, table) => sum + (Number(table.capacity) || 0), 0);
    const first = originals[0];
    const combined = {
      ...first,
      id: uid("tg"),
      number: numbers.join("+").slice(0, 18),
      capacity: totalCapacity,
      status: originals.some((table) => table.status === "occupied") ? "occupied" : "available",
      statusUpdatedAt: new Date().toISOString(),
      guestName: "",
      guestInitials: "",
      partySize: null,
      parentId: null,
      childIds: null,
      isTableGroup: true,
      combinedTables: originals.map((table) => ({
        ...table,
        groupOffset: { x: table.pos.x - minX, y: table.pos.y - minY },
      })),
      displaySize: { width: Math.max(56, getTableDisplaySize(first).width), height: Math.max(48, getTableDisplaySize(first).height) },
      pos: { x: minX, y: minY },
    };
    pushHistory();
    setTables((previous) => [...previous.filter((table) => !ids.includes(table.id)), combined]);
    setSelectedTableId(combined.id);
    setSelectedTableIds([combined.id]);
  }, [permissions.canManageTables, pushHistory, setTables, tables]);

  const splitTableGroup = useCallback(async (groupId) => {
    if (!permissions.canManageTables) return;
    const group = tables.find((table) => table.id === groupId && table.isTableGroup);
    if (!group || !Array.isArray(group.combinedTables)) return;
    if (!await showConfirm("Split table group?", `Restore the ${group.combinedTables.length} original tables in this temporary group.`, { confirmLabel: "Split group" })) return;
    const restored = group.combinedTables.map((child) => ({
      ...structuredClone(child),
      groupOffset: undefined,
      pos: {
        x: group.pos.x + (Number(child.groupOffset?.x) || 0),
        y: group.pos.y + (Number(child.groupOffset?.y) || 0),
      },
    }));
    pushHistory();
    setTables((previous) => [...previous.filter((table) => table.id !== groupId), ...restored]);
    setSelectedTableId(restored[0]?.id || null);
    setSelectedTableIds(restored.map((table) => table.id));
  }, [permissions.canManageTables, pushHistory, setTables, tables]);

  const checkTableOverlapAfterMove = useCallback(async (movedId) => {
    if (!permissions.canManageTables || selectedTableIds.length > 1) return;
    const moved = tables.find((table) => table.id === movedId);
    if (!moved || moved.parentId || (moved.childIds && moved.childIds.length)) return;
    const movedSize = getTableDisplaySize(moved);
    const movedBox = { left: moved.pos.x, top: moved.pos.y, right: moved.pos.x + movedSize.width, bottom: moved.pos.y + movedSize.height };
    const matches = tables.filter((table) => table.id !== movedId && !table.parentId && !(table.childIds && table.childIds.length)).map((table) => {
      const size = getTableDisplaySize(table);
      const box = { left: table.pos.x, top: table.pos.y, right: table.pos.x + size.width, bottom: table.pos.y + size.height };
      const width = Math.max(0, Math.min(movedBox.right, box.right) - Math.max(movedBox.left, box.left));
      const height = Math.max(0, Math.min(movedBox.bottom, box.bottom) - Math.max(movedBox.top, box.top));
      const overlap = width * height;
      const threshold = Math.min(movedSize.width * movedSize.height, size.width * size.height) * 0.45;
      return { table, overlap, qualifies: overlap >= threshold };
    }).filter((item) => item.qualifies).sort((a, b) => b.overlap - a.overlap);
    const target = matches[0]?.table;
    if (!target) return;
    if (await showConfirm("Combine tables?", `Table ${moved.number} (${moved.capacity} guests) + Table ${target.number} (${target.capacity} guests) will create a temporary group with ${Number(moved.capacity || 0) + Number(target.capacity || 0)} guests. Original tables can be restored anytime.`, { confirmLabel: "Combine" })) {
      combineTables([moved.id, target.id]);
    }
  }, [combineTables, permissions.canManageTables, selectedTableIds.length, tables]);

  const setAllTableStatus = useCallback(async (status) => {
    if (!permissions.canManageTables) return;
    const count = tables.filter((table) => !(table.childIds && table.childIds.length)).length;
    if (!await showConfirm(`Set all tables ${status}?`, `${layoutConfig.name} has ${count} tables. Guest names, highlights, celebrations, and notes will remain unchanged.`, { confirmLabel: status === "available" ? "Set available" : "Set occupied" })) return;
    pushHistory();
    const changedAt = new Date().toISOString();
    setTables((previous) => previous.map((table) => ({ ...table, status, statusUpdatedAt: changedAt })));
  }, [layoutConfig.name, permissions.canManageTables, pushHistory, setTables, tables]);

  const clearAllGuestDetails = useCallback(async () => {
    if (!permissions.canManageTables) return;
    if (!await showConfirm("Clear guest details?", `Guest names, initials, party sizes, highlights, celebration messages, server notes, and groups will be removed from ${layoutConfig.name}. Table status will not change.`, { confirmLabel: "Clear details", tone: "danger" })) return;
    pushHistory();
    setTables((previous) => previous.map((table) => ({
      ...table, guestName: "", guestInitials: "", partySize: null, groupId: null, showGuestName: false, showGuestInitials: false, celebration: null, celebrations: null, guestHighlight: "", customHighlightLabel: "", celebrationMessage: "", serverNotes: "",
    })));
  }, [layoutConfig.name, permissions.canManageTables, pushHistory, setTables]);

  const deleteTable = async (id) => {
    if (!permissions.canDeleteTables) return;
    const target = tables.find((table) => table.id === id);
    if (!target) return;
    if (target.parentId) { await showAlert("Table cannot be deleted", "Merge the split table before deleting an individual split part.", { tone: "warning" }); return; }
    pushHistory();
    setTables((prev) => prev.filter((t) => t.id !== id && t.parentId !== id));
    setSelectedTableId(null);
    setSelectedTableIds((previous) => previous.filter((tableId) => tableId !== id));
  };

  const splitTable = async (id, rawParts) => {
    if (!permissions.canSplitTables) return;
    const parent = tables.find((t) => t.id === id);
    if (!parent || parent.parentId || (parent.childIds && parent.childIds.length)) return;
    const parts = (Array.isArray(rawParts) ? rawParts : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (parts.length < 2 || parts.reduce((a,b)=>a+b,0) !== Number(parent.capacity)) {
      await showAlert("Invalid split", `Split parts must total ${parent.capacity}.`, { tone: "warning" }); return;
    }
    pushHistory();
    setAreaEditMode(false); setActiveTool("tables");
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const parentSize = getTableDisplaySize(parent);
    const spacing = Math.max(parentSize.width + 12, 50);
    const children = parts.map((cap, i) => ({
      ...parent, id: uid("t"), number: `${parent.number}${letters[i] || i + 1}`, capacity: cap,
      childIds: null, parentId: parent.id, status: "available", statusUpdatedAt: null, guestName: "", guestInitials: "", partySize: null,
      pos: { x: Math.max(0, parent.pos.x + i * spacing), y: Math.max(0, parent.pos.y + parentSize.height + 18) },
    }));
    const childIds = children.map((c)=>c.id);
    setTables((prev) => prev.map((t)=>t.id===id ? {...t, childIds, status:"available"} : t).concat(children));
    const farthest = children.at(-1); if (farthest) requestCanvasExpansion(farthest.pos.x + parentSize.width + 600, farthest.pos.y + parentSize.height + 600);
    setSelectedTableId(children[0].id);
    setSelectedTableIds(children.map((child) => child.id));
  };

  const mergeTable = (parentId) => {
    if (!permissions.canMergeTables) return;
    pushHistory();
    setTables((prev) => {
      const parent = prev.find((t) => t.id === parentId);
      if (!parent) return prev;
      const withoutChildren = prev.filter((t) => t.parentId !== parentId);
      return withoutChildren.map((t) =>
        t.id === parentId ? { ...t, childIds: null, guestName: "", guestInitials: "", partySize: null, groupId: null } : t
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
    pushHistory();
    setServersByR((prev) => ({ ...prev, [activeRid]: prev[activeRid].filter((s) => s.id !== id) }));
    setTables((prev) => prev.map((table) => table.serverId === id ? { ...table, serverId: null } : table));
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
    pushHistory();
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
          type: tableType === "super_ambassadors" ? "super" : "regular",
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
  (shape = "rectangle", areaKind = "seating", suggestedLabel = "New Area") => {
    if (!permissions.canManageZones) return;
    const id = uid("area");
    const existingCount = areas.length;
    const offsetX = (existingCount % 8) * 36;
    const offsetY = Math.floor(existingCount / 8) * 36;
    const nextArea = {
      id,
      label: suggestedLabel,
      shape,
      areaKind,
      x: 380 + offsetX,
      y: 460 + offsetY,
      w: shape === "pill" ? 180 : 220,
      h: shape === "pill" ? 70 : 130,
      rotate: shape === "diamond" ? 0 : 0,
      locked: false,
      hidden: false,
      protected: false,
      status: "available",
      statusUpdatedAt: null,
    };
    setAreas((previous) => [...previous, nextArea]);
    setSelectedAreaId(id);
  },
  [areas.length, permissions.canManageZones, setAreas]
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
  async (id) => {
    if (!permissions.canManageZones) return;
    const target = areas.find((area) => area.id === id);
    if (!target || target.protected) return;
    if (!await showConfirm("Delete area?", `${target.label} will be removed, but its tables will remain on the floor.`, { confirmLabel: "Delete area", tone: "danger" })) return;
    setAreas((previous) => previous.filter((area) => area.id !== id));
    setSelectedAreaId(null);
  },
  [areas, permissions.canManageZones, setAreas]
);

const resetAreas = useCallback(async () => {
  if (!permissions.canManageZones) return;
  if (!await showConfirm("Reset all areas?", `${RESTAURANT_LAYOUT_CONFIG[activeRid].name} areas will return to their defaults.`, { confirmLabel: "Reset areas", tone: "warning" })) return;
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
    pushHistory();

    const area = areas.find((candidate) => candidate.id === config.areaId);
    if (!area) return { ok: false, message: "Choose a valid target area." };
    if ((area.areaKind ?? "seating") !== "seating") return { ok: false, message: "Choose a seating area. Landmarks cannot receive guest tables." };

    const count = Math.max(1, Math.min(100, Number(config.count) || 1));
    const startingNumber = Number.isFinite(Number(config.startingNumber))
      ? Number(config.startingNumber)
      : getNextTableNumber();
    const capacity = Math.max(1, Number(config.capacity) || 4);
    const tableType = getTableTypeDefinition(config.tableType).value;
    const tableSize = Math.max(28, Math.min(60, Number(config.tableSize) || 36));
    const gap = 12;
    const usableWidth = Math.max(tableSize, Number(area.w) - 24);
    const maxColumnsByWidth = Math.max(1, Math.floor((usableWidth + gap) / (tableSize + gap)));
    const columns = Math.min(count, maxColumnsByWidth);
    const rows = Math.ceil(count / columns);
    const stepX = tableSize + gap;
    const stepY = tableSize + gap;

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
        type: tableType === "super_ambassadors" ? "super" : "regular",
        tableType,
        displaySize: { width: tableSize, height: tableSize },
        status: "available",
        statusUpdatedAt: null,
        serverId: null,
        guestName: "",
        guestInitials: "",
        showTableNumber: true,
        showServerInitials: true,
        showGuestName: false,
        showGuestInitials: false,
        partySize: null,
        color: null,
        groupId: null,
        parentId: null,
        childIds: null,
        pos: {
          x: Math.max(0, rawX),
          y: Math.max(0, rawY),
        },
      };
    });

    const farthestGenerated = nextTables[nextTables.length - 1];
    if (farthestGenerated) requestCanvasExpansion(farthestGenerated.pos.x + tableSize + 600, farthestGenerated.pos.y + tableSize + 600);

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
  }, [areas, getNextTableNumber, permissions.canManageTables, pushHistory, requestCanvasExpansion, setTables, tables]);

  const generateDailyTables = useCallback((config) => {
    if (!permissions.canManageTables) {
      return { ok: false, message: "Lead access is required to generate tables." };
    }
    if (layoutLocked) {
      return { ok: false, message: "Unlock the layout before generating today’s tables." };
    }

    const seatingAreas = areas
      .filter((area) => (area.areaKind ?? "seating") === "seating" && !area.hidden)
      .sort((a, b) => (Number(a.y) - Number(b.y)) || (Number(a.x) - Number(b.x)));
    if (!seatingAreas.length) return { ok: false, message: "Add at least one visible seating area first." };

    const requestedEntries = (Array.isArray(config.entries) ? config.entries : [])
      .map((entry) => ({ capacity: Math.max(1, Number(entry.capacity) || 1), count: Math.max(0, Math.min(200, Number(entry.count) || 0)) }))
      .filter((entry) => entry.count > 0);
    if (!requestedEntries.length) return { ok: false, message: "Enter at least one table count." };

    // Default behavior is intentionally batch-based: every click adds exactly
    // what the lead entered. This avoids the confusing target-total behavior
    // where a second run could appear to do nothing after tables already existed.
    const mode = config.mode === "replace" ? "replace" : "add-batch";
    const entriesToCreate = requestedEntries;
    const totalCount = entriesToCreate.reduce((sum, entry) => sum + entry.count, 0);

    pushHistory();
    const startingNumber = Number.isFinite(Number(config.startingNumber)) ? Number(config.startingNumber) : 1;
    const tableType = getTableTypeDefinition(config.tableType).value;
    const tableSize = Math.max(28, Math.min(60, Number(config.tableSize) || 34));
    const gap = 10;
    const baseTables = mode === "replace" ? [] : tables;
    const occupied = baseTables.filter((table) => !table.parentId).map((table) => {
      const size = getTableDisplaySize(table);
      return { x: Number(table.pos?.x) || 0, y: Number(table.pos?.y) || 0, w: size.width, h: size.height };
    });
    const overlaps = (x, y) => occupied.some((box) => x < box.x + box.w + 4 && x + tableSize + 4 > box.x && y < box.y + box.h + 4 && y + tableSize + 4 > box.y);
    const slots = [];

    seatingAreas.forEach((area) => {
      const innerWidth = Math.max(tableSize, Number(area.w) - 24);
      const innerHeight = Math.max(tableSize, Number(area.h) - 42);
      const columns = Math.max(1, Math.floor((innerWidth + gap) / (tableSize + gap)));
      const rows = Math.max(1, Math.floor((innerHeight + gap) / (tableSize + gap)));
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = Math.max(0, Number(area.x) + 12 + column * (tableSize + gap));
          const y = Math.max(0, Number(area.y) + 28 + row * (tableSize + gap));
          if (!overlaps(x, y)) slots.push({ area, x, y });
        }
      }
    });

    const overflowArea = seatingAreas[seatingAreas.length - 1];
    const overflowColumns = Math.max(1, Math.floor((Math.max(tableSize, Number(overflowArea.w) - 24) + gap) / (tableSize + gap)));
    let overflowIndex = 0;
    while (slots.length < totalCount) {
      const row = Math.floor(overflowIndex / overflowColumns);
      const column = overflowIndex % overflowColumns;
      const x = Math.max(0, Number(overflowArea.x) + 12 + column * (tableSize + gap));
      const y = Math.max(0, Number(overflowArea.y) + Number(overflowArea.h) + 18 + row * (tableSize + gap));
      if (!overlaps(x, y)) slots.push({ area: overflowArea, x, y });
      overflowIndex += 1;
    }

    const usedNumbers = new Set(baseTables.map((table) => String(table.number)));
    let nextNumber = startingNumber;
    const takeNextNumber = () => {
      while (usedNumbers.has(String(nextNumber))) nextNumber += 1;
      const value = String(nextNumber);
      usedNumbers.add(value);
      nextNumber += 1;
      return value;
    };
    const capacities = entriesToCreate.flatMap((entry) => Array.from({ length: entry.count }, () => entry.capacity));
    const nextTables = capacities.map((capacity, index) => {
      const slot = slots[index];
      return {
        id: uid("t"), number: takeNextNumber(), capacity, zone: slot.area.label, areaId: slot.area.id,
        type: tableType === "super_ambassadors" ? "super" : "regular", tableType,
        displaySize: { width: tableSize, height: tableSize }, status: "available", statusUpdatedAt: null,
        serverId: null, guestName: "", guestInitials: "", showTableNumber: true, showServerInitials: true,
        showGuestName: false, showGuestInitials: false, partySize: null, color: null, groupId: null,
        parentId: null, childIds: null, pos: { x: slot.x, y: slot.y },
      };
    });

    const farthest = nextTables.reduce((best, table) => (!best || table.pos.y > best.pos.y ? table : best), null);
    if (farthest) requestCanvasExpansion(farthest.pos.x + tableSize + 600, farthest.pos.y + tableSize + 600);
    setSelectedTableId(null);
    setSelectedTableIds([]);
    setTables((previousTables) => mode === "replace" ? nextTables : [...previousTables, ...nextTables]);

    return {
      ok: true,
      count: totalCount,
      nextStartingNumber: nextNumber,
      message: mode === "replace"
        ? `${totalCount} tables rebuilt. Existing daily tables were replaced.`
        : `${totalCount} table${totalCount === 1 ? "" : "s"} added as a new batch. Existing tables and their positions were preserved.`,
    };
  }, [areas, layoutLocked, permissions.canManageTables, pushHistory, requestCanvasExpansion, setTables, tables]);

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

  const importVenueLayout = useCallback(async (payload) => {
    if (!permissions.canEditLayout) return { ok: false, message: "Developer or Lead access is required." };
    if (!payload || payload.format !== "pcc-seating-venue-layout") {
      return { ok: false, message: "This is not a PCC venue-layout export." };
    }
    if (!Array.isArray(payload.areas) || !Array.isArray(payload.tables)) {
      return { ok: false, message: "The layout file is missing areas or tables." };
    }
    if (!await showConfirm("Import layout backup?", `The current ${layoutConfig.name} layout will be replaced by this backup.`, { confirmLabel: "Import backup", tone: "warning" })) {
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

  const resetVenueLayout = useCallback(async () => {
    if (!permissions.canEditLayout) return;
    if (!await showConfirm("Reset venue to defaults?", `${layoutConfig.name} tables and areas will return to built-in defaults. Export a backup first if needed.`, { confirmLabel: "Reset venue", tone: "danger" })) return;
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
    if (!permissions.canManageStaffing) return;
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
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "tables", label: "Tables", icon: Plus },
    { id: "servers", label: "Servers", icon: Users },
    { id: "groups", label: "Groups", icon: Building2 },
    { id: "areas", label: "Areas", icon: MousePointer2 },
    { id: "designer", label: "Designer", icon: Grid3X3 },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "capacity", label: "Capacity", icon: Gauge },
    { id: "staffing", label: "Staffing", icon: CalendarDays },
    { id: "help", label: "Help", icon: CircleHelp },
    { id: "testing", label: "Testing", icon: FlaskConical },
    { id: "layout", label: "Layout", icon: Maximize2 },
    { id: "display", label: "Display", icon: Eye },
  ];

  return (
    <div className={`workspace-app ${mobileFocusMode ? "mobile-focus-mode" : ""} ${greeterView ? "greeter-view-active" : ""}`}>
      {!mobileFocusMode && <AppHeader
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
        onOpenAccount={() => setAccountModalOpen(true)}
        testingMode
        onRetryCloud={() => retryCloudRef.current?.()}
      />}

      <main className={`workspace-main ${sidebarCollapsed || operationsView || mobileFocusMode || greeterView ? "sidebar-collapsed" : ""} ${inspectorCollapsed || operationsView || mobileFocusMode || greeterView ? "inspector-collapsed" : ""} ${operationsView || mobileFocusMode ? "operations-view" : ""}`}>
        {!operationsView && !mobileFocusMode && !greeterView && !sidebarCollapsed && <ToolSidebar
          tabs={toolTabs}
          activeTool={activeTool}
          onToolChange={setActiveTool}
        >
          {activeTool === "dashboard" && (
            <LiveOperationsDashboard
              restaurants={visibleRestaurants}
              activeVenueId={activeRid}
              tablesByVenue={tablesByR}
              areasByVenue={areasByR}
              serversByVenue={serversByR}
              operationsByVenue={venueOperationsByR}
              activity={activity}
              staffingAssignments={staffingAssignments}
              onOpenVenue={(venueId) => { setActiveRid(venueId); setActiveTool("tables"); }}
            />
          )}

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
              <div className="bulk-table-tools">
                <div className="bulk-table-tools-header">
                  <strong>Bulk selection</strong>
                  <span>{selectedTableIds.length} selected</span>
                </div>
                <button type="button" className={bulkSelectMode ? "workspace-primary-action" : "workspace-secondary-action"} onClick={() => setBulkSelectMode((value) => !value)}>
                  <MousePointer2 size={14} /> {bulkSelectMode ? "Bulk select is ON" : "Turn on bulk select"}
                </button>
                <div className="bulk-table-button-grid">
                  <button type="button" onClick={selectAllTables}>Select all</button>
                  <button type="button" onClick={clearTableSelection}>Clear</button>
                  <button type="button" onClick={copySelectedTables} disabled={!selectedTableIds.length}><Copy size={14} /> Copy</button>
                  <button type="button" onClick={pasteSelectedTables}><Plus size={14} /> Paste</button>
                  <button type="button" onClick={saveDailyLayoutSnapshot}><Save size={14} /> Save layout</button>
                  <button type="button" className="bulk-danger" onClick={deleteSelectedTables} disabled={!selectedTableIds.length}><Trash2 size={14} /> Delete selected</button>
                </div>
                {selectedTableIds.length > 0 && (
                  <div className="bulk-assignment-grid">
                    <label><span>Assign server</span><select defaultValue="" onChange={(event) => { if (event.target.value !== "") applyBulkTablePatch({ serverId: event.target.value === "__none" ? null : event.target.value }); event.target.value = ""; }}><option value="">Choose…</option><option value="__none">No server</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.initials} — {server.name}</option>)}</select></label>
                    <label><span>Assign category</span><select defaultValue="" onChange={(event) => { if (event.target.value) applyBulkTablePatch({ tableType: event.target.value, type: event.target.value === "super_ambassadors" ? "super" : "regular" }); event.target.value = ""; }}><option value="">Choose…</option>{TABLE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label><span>Assign group</span><select defaultValue="" onChange={(event) => { if (event.target.value !== "") applyBulkTablePatch({ groupId: event.target.value === "__none" ? null : event.target.value }); event.target.value = ""; }}><option value="">Choose…</option><option value="__none">No group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                    <label><span>Status</span><select defaultValue="" onChange={(event) => { if (event.target.value) applyBulkTablePatch({ status: event.target.value, statusUpdatedAt: new Date().toISOString() }); event.target.value = ""; }}><option value="">Choose…</option><option value="available">Available</option><option value="occupied">Occupied</option></select></label>
                    <div className="bulk-number-actions"><span>Table numbers</span><button type="button" onClick={() => applyBulkTablePatch({ showTableNumber: true })}><Eye size={13} /> Show</button><button type="button" onClick={() => applyBulkTablePatch({ showTableNumber: false })}><EyeOff size={13} /> Hide</button></div>
                  </div>
                )}
                <div className="venue-bulk-status-card">
                  <strong>Whole venue status</strong>
                  <small>Quick reset for static buffet layouts. Guest details are kept.</small>
                  <div className="bulk-table-button-grid">
                    <button type="button" onClick={() => setAllTableStatus("available")}><Check size={14} /> All available</button>
                    <button type="button" onClick={() => setAllTableStatus("occupied")}><Check size={14} /> All occupied</button>
                  </div>
                  <button type="button" className="workspace-secondary-action" onClick={clearAllGuestDetails}><X size={14} /> Clear guest details</button>
                </div>
                <button type="button" className="designer-danger-action" onClick={clearAllTables}><Trash2 size={14} /> Delete all venue tables</button>
                <small>Drag a box to highlight. ⌘/Ctrl+C copies, ⌘/Ctrl+V pastes, arrows move, Delete removes, and Esc clears selection.</small>
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
              venueId={activeRid}
              venueName={layoutConfig.name}
              areas={areas}
              selectedAreaId={selectedAreaId}
              tables={tables}
              canManage={isLeadOrAdmin}
              canvasWidth={layoutConfig.canvasWidth}
              canvasHeight={layoutConfig.canvasHeight}
              onResizeCanvas={({ width, height }) => setCanvasSettingsByR((previous) => ({ ...previous, [activeRid]: { width, height } }))}
              onSelectTable={(id) => { setAreaEditMode(false); setSelectedTableId(id); }}
              onSelectArea={(id) => {
                setSelectedAreaId(id);
                if (id) setSelectedTableId(null);
              }}
              onGenerateTables={generateBulkTables}
              onGenerateDailyTables={generateDailyTables}
              onDuplicateAreaWithTables={duplicateAreaWithTables}
              onExportLayout={exportVenueLayout}
              onImportLayout={importVenueLayout}
              onResetVenue={resetVenueLayout}
              onSaveLayout={saveDailyLayoutSnapshot}
              onToggleLayoutLock={toggleLayoutLock}
              onResetTodaysTables={resetTodaysTables}
              layoutLocked={layoutLocked}
              layoutSavedAt={layoutBaselineMetaByR[activeRid] || null}
              onClearTables={clearAllTables}
              blueprint={blueprintsByR[activeRid]}
              onBlueprintChange={(patch) => setBlueprintsByR((previous) => ({ ...previous, [activeRid]: { ...(previous[activeRid] || {}), ...patch } }))}
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
              assignments={staffingAssignments}
              onChangeAssignment={updateStaffingAssignment}
              onSave={saveStaffing}
              canManage={permissions.canManageStaffing}
              saveState={staffingSaveState}
            />
          )}

          {activeTool === "help" && <HelpPanel />}
          {activeTool === "testing" && <TestingPanel
            canUndo={(historyByR[activeRid] || []).length > 0}
            canRedo={(futureByR[activeRid] || []).length > 0}
            onUndo={undo}
            onRedo={redo}
            onRestore={restoreSafeSnapshot}
            onExport={exportVenueLayout}
          />}

          {activeTool === "display" && (
            <div className="workspace-tool-content display-settings-panel">
              <div><h2>Accessibility & Display</h2><p>One set of controls updates the entire active restaurant instantly.</p></div>
              <label className="accessibility-switch"><span><strong>Accessibility Mode</strong><small>Larger text, thicker borders, and stronger contrast.</small></span><input type="checkbox" checked={displaySettings.accessibilityMode} onChange={(e) => updateViewSettings({ accessibilityMode: e.target.checked })} /></label>
              <fieldset><legend>Table Number Size</legend>{["small","medium","large"].map(v => <label key={v}><input type="radio" name="tableNumberSize" checked={displaySettings.tableNumberSize===v} onChange={() => updateViewSettings({tableNumberSize:v})}/><span>{v[0].toUpperCase()+v.slice(1)}</span></label>)}</fieldset>
              <fieldset><legend>Capacity Size</legend>{["small","medium","large"].map(v => <label key={v}><input type="radio" name="capacitySize" checked={displaySettings.capacitySize===v} onChange={() => updateViewSettings({capacitySize:v})}/><span>{v[0].toUpperCase()+v.slice(1)}</span></label>)}</fieldset>
              <fieldset><legend>Table Text Color</legend>{["white","black"].map(v => <label key={v}><input type="radio" name="tableTextColor" checked={displaySettings.tableTextColor===v} onChange={() => updateViewSettings({tableTextColor:v})}/><span>{v[0].toUpperCase()+v.slice(1)}</span></label>)}</fieldset>
              <div className="display-toggle-list">
                {[['showTableNumbers','Table Numbers'],['showPax','Pax'],['showAreaLabels','Area Labels'],['showServerNames','Server Names'],['showCelebrations','Celebrations'],['highlightTableNumbers','Highlight Table Numbers'],['highlightEmptyTables','Highlight Empty Tables']].map(([key,label]) => <label key={key}><input type="checkbox" checked={Boolean(displaySettings[key])} onChange={(e)=>updateViewSettings({[key]:e.target.checked})}/><span>{label}</span></label>)}
              </div>
              <div className="workspace-help-card"><strong>Workspace memory</strong><span>Full Floor, hidden panels, zoom, and pan position are saved automatically per venue.</span></div>
            </div>
          )}

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
        </ToolSidebar>}

        <section className="workspace-center" aria-label="Seating floor workspace">
          <div className="operations-view-toolbar">
            {!mobileFocusMode && !greeterView && <button type="button" onClick={() => setSidebarCollapsed((value) => !value)} title="Show or hide tools"><Menu size={16} /> <span>Tools</span></button>}
            {!mobileFocusMode && !greeterView && <button type="button" onClick={() => setInspectorCollapsed((value) => !value)} title="Show or hide inspector">{inspectorCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />} <span>Inspector</span></button>}
            {!greeterView && <button type="button" className={mobileFocusMode ? "active" : ""} onClick={() => setMobileFocusMode((value) => !value)} title="Phone and tablet map mode"><Smartphone size={16}/><span>{mobileFocusMode ? "Show controls" : "Mobile map"}</span></button>}
            {activeRid === "gateway" && <button type="button" className={greeterView ? "active" : ""} onClick={() => setGreeterView((value) => !value)} title="Gateway greeter dashboard"><LayoutDashboard size={16}/><span>{greeterView ? "Floor map" : "Greeter"}</span></button>}
            {!mobileFocusMode && !greeterView && <button type="button" className={operationsView ? "active" : ""} onClick={() => setOperationsView((value) => !value)} title="Large floor operations view">{operationsView ? <Minimize2 size={16} /> : <Maximize2 size={16} />} <span>{operationsView ? "Exit focus" : "Full floor"}</span></button>}
          </div>
          {greeterView ? (
            <GatewayGreeterDashboard
              venueName={layoutConfig.name}
              areas={areas}
              tables={tables}
              onExit={() => setGreeterView(false)}
              onLocateArea={(area) => {
                setGreeterView(false);
                setMobileFocusMode(true);
                setZoom(clampWorkspaceZoom(Math.max(layoutConfig.minZoom, 0.75)));
                updateViewSettings({ pan: { x: Math.max(0, area.x * 0.75 - 100), y: Math.max(0, area.y * 0.75 - 100) } });
              }}
            />
          ) : <>
          <div className="occupancy-widget" aria-label={`${layoutConfig.name} occupancy summary`}>
            <div className="occupancy-widget-title"><span>{layoutConfig.name}</span><strong>{seatingMetrics.totalTables} tables</strong></div>
            <div className="occupancy-widget-metrics">
              <div><span className="metric-dot available" /><strong>{seatingMetrics.availableTables}</strong><small>Available</small></div>
              <div><span className="metric-dot occupied" /><strong>{seatingMetrics.occupiedTables}</strong><small>Occupied</small></div>
              <div><Users size={14} /><strong>{seatingMetrics.seatedGuests}</strong><small>Guests</small></div>
              <div><Gauge size={14} /><strong>{seatingMetrics.totalTableCapacity}</strong><small>Capacity</small></div>
            </div>
            <div className="occupancy-progress"><span style={{ width: `${seatingMetrics.totalTables ? Math.round((seatingMetrics.occupiedTables / seatingMetrics.totalTables) * 100) : 0}%` }} /></div>
          </div>
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
            selectedIds={selectedTableIds}
            onSelect={selectTable}
            onMove={moveTable}
            permissions={permissions}
            zoom={zoom}
            onZoomChange={setZoom}
            onContextDelete={deleteTable}
            onToggleStatus={toggleTableStatus}
            onRequestCanvasExpand={requestCanvasExpansion}
            blueprint={blueprintsByR[activeRid]}
            onBeginTableMove={pushHistory}
            onEndTableMove={checkTableOverlapAfterMove}
            onBeginAreaInteraction={pushHistory}
            onBoxSelect={selectTablesInBox}
            layoutLocked={layoutLocked}
            displaySettings={displaySettings}
            panPosition={displaySettings.pan}
            onPanChange={(pan) => updateViewSettings({ pan })}
          />
          </>}
          {mobileFocusMode && <div className="mobile-map-hint">Pinch with two fingers to zoom · Drag to move around</div>}
        </section>

        {!operationsView && !mobileFocusMode && !greeterView && <InspectorPanel
          collapsed={inspectorCollapsed}
          onToggle={() => setInspectorCollapsed((value) => !value)}
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
              displaySettings={displaySettings}
              onClose={() => setSelectedTableId(null)}
              onUpdate={updateTable}
              onSplit={splitTable}
              onMerge={mergeTable}
              onSplitGroup={splitTableGroup}
              onDelete={deleteTable}
            />
          )}
        </InspectorPanel>}
      </main>

      {accountModalOpen && (
        <AccountSecurityModal
          profile={authSession.profile}
          onClose={() => { setAccountModalOpen(false); setAccountPasswordOpen(false); }}
          showPasswordForm={accountPasswordOpen}
          onShowPasswordForm={setAccountPasswordOpen}
        />
      )}

      <ActionDialog dialog={actionDialog} onResolve={resolveDialog} />

      {!mobileFocusMode && !greeterView && <WorkspaceFooter
        legend={<SeatingLegend />}
        zoom={zoom}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onResetZoom={resetZoom}
        onFit={fitZoom}
        areaEditMode={areaEditMode}
      />}
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

  if (authSession.status === "password-change-required") {
    return <PasswordChangeScreen profile={authSession.profile} required />;
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
