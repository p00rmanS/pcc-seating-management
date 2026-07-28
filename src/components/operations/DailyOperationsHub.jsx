import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  Flower2,
  Gauge,
  IceCreamBowl,
  LayoutDashboard,
  Mic,
  Package,
  Plus,
  Save,
  Search,
  Shirt,
  ShoppingBasket,
  Trash2,
  Unlock,
  Upload,
  WifiOff,
  X,
  XCircle,
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
const NEEDS_REORDER_LEVELS = new Set(["Almost Out", "Empty"]);
const UNIT_OPTIONS = ["tubs", "pans", "bags"];
const PAX_SIZES = [1,2,3,4,5,6,7,8,9,10,12];
const WORKFLOW_LABELS = { not_started: "Not Started", in_progress: "In Progress", submitted: "Submitted", reopened: "Reopened" };

// Default breakout catalog — grouped by area, seeded from the operations team's list.
const DEFAULT_BREAKOUT = {
  "Drink Station": [
    "Cup 12oz DB-WL Hot (Coffee Cups)", "20oz Clear Cups", "Lip Sippers", "Clear Straws", "Toothpicks",
    "Wooden Chopsticks", "Wood Coffee Stirrers", "Hot Chocolate Packets", "Equal Packets", "Sugar Packets",
    "Splenda Packets", "Salt Packets", "Pepper Packets", "Black Tea", "Refresh Mint Tea", "Green Tea",
    "Chamomile Tea", "Tea Coconut Macadamia", "Tea Mango Maui", "Tea Hawaiian Pineapple",
    "Gold Roast Decaf Coffee", "Vanilla Macadamia Coffee", "Honolulu Regular Ground Coffee",
    "Coffee Filter", "Creamer Cups",
  ],
  "Ice-Cream Station": [
    "Ice Cream Cones", "Oreo Crumbs", "Shredded Coconut", "Plain M&M", "Skittles",
    "Chocolate Sprinkles", "Rainbow Sprinkles", "Marshmallows", "Cocoa Pebbles", "Lucky Charms",
    "Fruit Loops", "Frosted Flakes", "Fruity Pebbles", "Graham Crumbs", "4 OZ Portion Cups",
    "Paper Napkins", "Disposable Spoons",
  ],
  "Keiki Station": [
    "Ketchup Packet", "Mayonnaise Packet", "Soy Sauce Packet", "Mustard Packet", "Tabasco Sauce Packet",
    "Ranch Cups", "Sweet and Sour Sauce Cups", "BBQ Sauce Cups", "Honey Mustard Sauce Cups",
    "Towelette Wipes", "4 OZ Portion Cups",
  ],
  "Back Area (Janitorial Items)": [
    "Cloth Wiper", "Glove Medium", "Glove Large", "Glove XL", "Towel Roll Scott (Paper Towels)",
    "Probe Wipes", "Floor Cleaner Spic&Span (Green Liquid)", "Dawn Regular (Dish Soap – Scrappers)",
    "Cascade Silverware Presoak", "Disinfecting Cleaner Spray", "Sanitizer Clean Quick (Light Red Liquid)",
    "Handsoap Safeguard", "Hand Sanitizer", "Cleaner Pine Sol", "Trash Liner Large", "Trash Liner Small",
    "Blue Scour Pad (Sponge – Scrappers)", "Disposable Apron", "Bleach",
  ],
  "Back Area (Non-Food Cost Items)": [
    "Whole Ahi", "Ice Cubes", "Kale", "Pineapple Soft Serve", "Whole Milk", "Plastic Wrap",
    "Ziplock Bags", "Plain Salt", "BIB Mountain Dew", "BIB Pepsi Regular", "BIB Diet Pepsi",
    "BIB Pepsi Zero", "BIB Orange Crush", "BIB Dr. Pepper", "BIB Starry Lime", "BIB Pink Lemonade",
    "BIB Fruit Punch", "BIB Raspberry Iced Tea", "Lipton Sweetened Iced Tea", "Lipton Unsweetened Iced Tea",
    "Plastic Fork", "Plastic Plates", "Butter Continental Chips",
  ],
};
const BREAKOUT_LOW_STOCK_THRESHOLD = 5;
// Canonical unit vocabulary pulled from the venue's real warehouse breakout
// list (cases, gallons, drums, bag-in-box soda, etc.) — offered as a
// datalist so staff can pick one or keep typing a custom unit.
const BREAKOUT_UNIT_OPTIONS = ["CS", "BOX", "BG", "GAL", "EA", "DRUM", "BIB", "PK", "LBS", "CTN"];
const BREAKOUT_UNIT_SYNONYMS = {
  case: "CS", cases: "CS", cs: "CS",
  box: "BOX", boxes: "BOX",
  bag: "BG", bags: "BG", bg: "BG",
  gallon: "GAL", gallons: "GAL", gal: "GAL",
  each: "EA", ea: "EA",
  drum: "DRUM", drums: "DRUM",
  bib: "BIB",
  pack: "PK", packs: "PK", pk: "PK",
  lb: "LBS", lbs: "LBS", pound: "LBS", pounds: "LBS",
  carton: "CTN", ctn: "CTN",
};
function normalizeBreakoutUnit(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return trimmed;
  return BREAKOUT_UNIT_SYNONYMS[trimmed.toLowerCase()] || trimmed;
}
const BREAKOUT_STATUS_META = {
  urgent: { label: "Urgent", icon: XCircle },
  low: { label: "Low stock", icon: AlertTriangle },
  ok: { label: "OK", icon: CheckCircle2 },
};
function getBreakoutStatus(stock, par) {
  const value = Number(stock) || 0;
  const parValue = Number.isFinite(Number(par)) ? Number(par) : BREAKOUT_LOW_STOCK_THRESHOLD;
  if (value <= 0) return "urgent";
  if (value < parValue) return "low";
  return "ok";
}
function getReorderSuggestion(stock, par) {
  const value = Number(stock) || 0;
  const parValue = Number.isFinite(Number(par)) ? Number(par) : BREAKOUT_LOW_STOCK_THRESHOLD;
  const needed = Math.max(0, parValue - value);
  if (value <= 0) return { qty: needed, text: `Suggest ordering ${needed} unit${needed === 1 ? "" : "s"} to reach par of ${parValue}` };
  if (value < parValue) return { qty: needed, text: `Consider ordering ${needed} unit${needed === 1 ? "" : "s"} to reach par` };
  return { qty: 0, text: "At par level" };
}
function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
// Same string-or-object backward-compat pattern as normalizeFlavorConfig, plus
// an "area" grouping key. Falls back to the full default catalog when nothing
// has been saved yet.
function normalizeBreakoutConfig(value) {
  const list = Array.isArray(value) && value.length
    ? value
    : Object.entries(DEFAULT_BREAKOUT).flatMap(([area, names]) => names.map((name) => ({ area, name })));
  return list
    .filter(Boolean)
    .map((item, index) => ({
      id: item.id || `${slugify(item.area || "other")}--${slugify(item.name || index)}`,
      area: item.area || "Other",
      name: item.name || `Item ${index + 1}`,
      code: item.code || "",
      unit: item.unit ? normalizeBreakoutUnit(item.unit) : "",
      par: Number.isFinite(Number(item.par)) && Number(item.par) >= 0 ? Number(item.par) : BREAKOUT_LOW_STOCK_THRESHOLD,
      price: Number.isFinite(Number(item.price)) && Number(item.price) >= 0 ? Number(item.price) : 0,
      active: item.active !== false,
      order: Number.isFinite(item.order) ? item.order : index,
    }))
    .sort((a, b) => a.order - b.order);
}

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
function sortedTableSizeEntries(breakdown) {
  return Object.entries(breakdown).sort(([a], [b]) => {
    if (a === "10+") return 1;
    if (b === "10+") return -1;
    return Number(a) - Number(b);
  });
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
function formatElapsed(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function trendArrowText(current, previous) {
  if (!previous) return "";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return " (even)";
  return ` (${pct > 0 ? "+" : ""}${pct}%)`;
}
function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field); field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += char;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function parseBreakoutCost(raw) {
  const cleaned = String(raw || "").replace(/[^0-9.]/g, "");
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}
// Parses the venue's real warehouse export: 2-3 categories side by side,
// each a repeating "Item No., Description, UOM, Cost" column group. The
// category header row tells us where each group starts, so group width
// doesn't need to be assumed — we read 4 columns from each detected start.
function parseBreakoutCsvBlocks(text) {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => String(cell).trim() !== ""));
  if (rows.length < 3) return [];
  const blockStarts = [];
  rows[0].forEach((cell, index) => {
    if (String(cell || "").trim()) blockStarts.push({ start: index, area: String(cell).trim() });
  });
  if (!blockStarts.length) return [];
  const items = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    blockStarts.forEach(({ start, area }) => {
      const code = String(row[start] || "").trim();
      const name = String(row[start + 1] || "").trim();
      const unit = String(row[start + 2] || "").trim();
      if (!name) return;
      items.push({ area, code, name, unit: normalizeBreakoutUnit(unit), price: parseBreakoutCost(row[start + 3]) });
    });
  }
  return items;
}
function mergeBreakoutImport(existingConfig, importedItems) {
  const byId = new Map(existingConfig.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  const areasSeen = new Set();
  importedItems.forEach((entry) => {
    areasSeen.add(entry.area);
    const id = `${slugify(entry.area)}--${slugify(entry.code || entry.name)}`;
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, { ...existing, name: entry.name, code: entry.code, unit: entry.unit, price: entry.price, area: entry.area });
      updated++;
    } else {
      byId.set(id, { id, area: entry.area, name: entry.name, code: entry.code, unit: entry.unit, price: entry.price, par: BREAKOUT_LOW_STOCK_THRESHOLD, active: true, order: byId.size });
      added++;
    }
  });
  return { list: Array.from(byId.values()), added, updated, areaCount: areasSeen.size };
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
  // "employee" is the generic shared per-venue account (e.g. haleohana.e@) that
  // handles every daily operations task for its venue, so it gets every
  // data-entry section — only History stays management-only, matching the
  // audit-trail convention every other role follows.
  const sectionAccess = useMemo(() => ({
    assignments: true,
    cloths: canManage || role === "inventory" || role === "line" || role === "employee",
    leis: canManage || role === "inventory" || role === "employee",
    frozen: canManage || role === "gelato" || role === "dessert" || role === "employee",
    pax: canManage || role === "line" || role === "server" || role === "operations_server" || role === "employee",
    breakout: canManage || role === "employee" || role === "inventory",
    dashboard: canManage,
    history: canManage,
  }), [canManage, role]);
  const firstTab = Object.keys(sectionAccess).find((key) => sectionAccess[key]) || "assignments";
  const [activeTab, setActiveTab] = useState(firstTab);
  const [settings, setSettings] = useState(null);
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState({});
  const [saveState, setSaveState] = useState("idle");
  const [newItem, setNewItem] = useState("");
  const [assignmentRemarksId, setAssignmentRemarksId] = useState(null);
  const [assignmentRemarksDraft, setAssignmentRemarksDraft] = useState("");
  const [newFlavorName, setNewFlavorName] = useState("");
  const [newFlavorUnit, setNewFlavorUnit] = useState("tubs");
  const [newBreakoutName, setNewBreakoutName] = useState("");
  const [breakoutAreaTab, setBreakoutAreaTab] = useState(null);
  const [breakoutSearch, setBreakoutSearch] = useState("");
  const [breakoutStatusFilter, setBreakoutStatusFilter] = useState("all");
  const [breakoutTimerSeconds, setBreakoutTimerSeconds] = useState(0);
  const [breakoutTimerRunning, setBreakoutTimerRunning] = useState(false);
  const [breakoutNoteItemId, setBreakoutNoteItemId] = useState(null);
  const [breakoutNoteDraft, setBreakoutNoteDraft] = useState("");
  const breakoutCsvInputRef = useRef(null);
  const breakoutSearchInputRef = useRef(null);
  const [breakoutOnline, setBreakoutOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [breakoutBarcodeInput, setBreakoutBarcodeInput] = useState("");
  const [breakoutBarcodeError, setBreakoutBarcodeError] = useState("");
  const [breakoutHighlightId, setBreakoutHighlightId] = useState(null);
  const [breakoutVoiceActive, setBreakoutVoiceActive] = useState(false);
  const [breakoutVoiceTranscript, setBreakoutVoiceTranscript] = useState("");
  const breakoutVoiceRecognitionRef = useRef(null);

  useEffect(() => {
    const goOnline = () => setBreakoutOnline(true);
    const goOffline = () => setBreakoutOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  useEffect(() => {
    if (!breakoutTimerRunning) return undefined;
    const interval = window.setInterval(() => setBreakoutTimerSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, [breakoutTimerRunning]);

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
  const breakoutConfig = useMemo(() => normalizeBreakoutConfig(settings?.breakoutItems), [settings?.breakoutItems]);
  const activeBreakoutItems = useMemo(() => breakoutConfig.filter((item) => item.active), [breakoutConfig]);
  const breakoutAreaNames = useMemo(() => {
    const seen = [];
    activeBreakoutItems.forEach((item) => { if (!seen.includes(item.area)) seen.push(item.area); });
    return seen;
  }, [activeBreakoutItems]);
  useEffect(() => {
    if (breakoutAreaNames.length && !breakoutAreaNames.includes(breakoutAreaTab)) setBreakoutAreaTab(breakoutAreaNames[0]);
  }, [breakoutAreaNames, breakoutAreaTab]);

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
        freezerStock: legacy.freezerStock ?? 0,
      }];
    })),
    frozenWorkflow: record?.frozenWorkflow || { status: "not_started" },
    breakout: Object.fromEntries(breakoutConfig.map((item) => [item.id, { stock: 0, stockUnit: item.unit || "", orderQuantity: 0, done: false, notes: "", level: "Full", ...(record?.breakout?.[item.id] || {}) }])),
    pax: { ...Object.fromEntries(PAX_SIZES.map((size) => [size, 0])), ...(record?.pax || {}) },
    notes: record?.notes || "",
  }), [clothItems, frozenConfig, breakoutConfig, leiItems, record]);

  const breakoutUrgentByArea = useMemo(() => {
    const counts = {};
    activeBreakoutItems.forEach((item) => {
      if (getBreakoutStatus(current.breakout[item.id]?.stock, item.par) === "urgent") counts[item.area] = (counts[item.area] || 0) + 1;
    });
    return counts;
  }, [activeBreakoutItems, current.breakout]);
  const breakoutSearchTerm = breakoutSearch.trim().toLowerCase();
  const visibleBreakoutItems = activeBreakoutItems
    .filter((item) => item.area === breakoutAreaTab)
    .filter((item) => !breakoutSearchTerm || item.name.toLowerCase().includes(breakoutSearchTerm) || (item.code || "").toLowerCase().includes(breakoutSearchTerm))
    .filter((item) => {
      if (breakoutStatusFilter === "all") return true;
      const stock = Number(current.breakout[item.id]?.stock) || 0;
      if (breakoutStatusFilter === "belowPar") return stock < item.par;
      if (breakoutStatusFilter === "needsRefill") return NEEDS_REORDER_LEVELS.has(current.breakout[item.id]?.level);
      return getBreakoutStatus(stock, item.par) === breakoutStatusFilter;
    });
  const breakoutDoneCount = activeBreakoutItems.filter((item) => current.breakout[item.id]?.done).length;
  const breakoutTotalCount = activeBreakoutItems.length;
  const breakoutProgressPct = breakoutTotalCount ? Math.round((breakoutDoneCount / breakoutTotalCount) * 100) : 0;
  const breakoutIsComplete = breakoutTotalCount > 0 && breakoutDoneCount === breakoutTotalCount;
  const breakoutOrderedItems = activeBreakoutItems.filter((item) => Number(current.breakout[item.id]?.orderQuantity) > 0);
  const breakoutTotalCost = breakoutOrderedItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(current.breakout[item.id]?.orderQuantity || 0), 0);
  const breakoutNoteCount = activeBreakoutItems.filter((item) => (current.breakout[item.id]?.notes || "").trim()).length;
  const previousBreakoutDate = Object.keys(history || {})
    .filter((date) => date < staffingDate && history[date]?.breakout)
    .sort((a, b) => b.localeCompare(a))[0] || null;
  const previousBreakoutRecord = previousBreakoutDate ? history[previousBreakoutDate] : null;
  const previousBreakoutStats = previousBreakoutRecord
    ? (() => {
        const items = activeBreakoutItems.filter((item) => Number(previousBreakoutRecord.breakout?.[item.id]?.orderQuantity) > 0);
        const cost = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(previousBreakoutRecord.breakout[item.id].orderQuantity || 0), 0);
        return { itemCount: items.length, cost };
      })()
    : null;

  const breakoutOfflineKey = `pcc_breakout_draft_${venueId}_${staffingDate}`;
  const breakoutLocalDraft = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(breakoutOfflineKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [breakoutOfflineKey]);
  const breakoutDraftDiffers = Boolean(breakoutLocalDraft && JSON.stringify(breakoutLocalDraft.record) !== JSON.stringify(record));

  useEffect(() => {
    if (!record) return;
    try {
      window.localStorage.setItem(breakoutOfflineKey, JSON.stringify({ savedAt: Date.now(), record }));
    } catch {
      // localStorage unavailable (private browsing, quota) — offline backup just won't be there.
    }
  }, [record, breakoutOfflineKey]);

  const restoreBreakoutDraft = () => { if (breakoutLocalDraft?.record) setRecord(breakoutLocalDraft.record); };

  const breakoutUrgentItemsAll = activeBreakoutItems.filter((item) => getBreakoutStatus(current.breakout[item.id]?.stock, item.par) === "urgent");
  const breakoutLowItemsAll = activeBreakoutItems.filter((item) => getBreakoutStatus(current.breakout[item.id]?.stock, item.par) === "low");
  const breakoutPaceItemsPerSecond = breakoutTimerSeconds > 0 && breakoutDoneCount > 0 ? breakoutDoneCount / breakoutTimerSeconds : 0;
  const breakoutRemainingCount = Math.max(0, breakoutTotalCount - breakoutDoneCount);
  const breakoutEtaSeconds = breakoutPaceItemsPerSecond > 0 ? Math.round(breakoutRemainingCount / breakoutPaceItemsPerSecond) : null;
  const jumpToBreakoutItem = (item) => {
    setBreakoutStatusFilter("all");
    setBreakoutSearch("");
    setBreakoutAreaTab(item.area);
    setActiveTab("breakout");
    setBreakoutHighlightId(item.id);
    window.setTimeout(() => setBreakoutHighlightId((current) => (current === item.id ? null : current)), 2500);
  };
  const handleBreakoutBarcodeSubmit = (event) => {
    event.preventDefault();
    const code = breakoutBarcodeInput.trim();
    if (!code) return;
    const match = activeBreakoutItems.find((item) => item.code && item.code.toLowerCase() === code.toLowerCase());
    setBreakoutBarcodeInput("");
    if (!match) {
      setBreakoutBarcodeError(`No item found for "${code}"`);
      window.setTimeout(() => setBreakoutBarcodeError(""), 2500);
      return;
    }
    setBreakoutBarcodeError("");
    jumpToBreakoutItem(match);
  };

  const breakoutVoiceSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const parseBreakoutVoiceCommand = (transcript) => {
    const match = transcript.trim().match(/^(?:order\s+)?(\d+)\s+(.+)$/i);
    if (match) return { qty: Number(match[1]), query: match[2].trim() };
    return { qty: 1, query: transcript.replace(/^order\s+/i, "").trim() };
  };
  const applyBreakoutVoiceCommand = (transcript) => {
    setBreakoutVoiceTranscript(transcript);
    const { qty, query } = parseBreakoutVoiceCommand(transcript);
    if (!query) return;
    const lowerQuery = query.toLowerCase();
    const match = activeBreakoutItems.find((item) => item.name.toLowerCase().includes(lowerQuery) || lowerQuery.includes(item.name.toLowerCase()));
    if (!match) {
      setBreakoutBarcodeError(`Didn't recognize an item in "${transcript}"`);
      window.setTimeout(() => setBreakoutBarcodeError(""), 3000);
      return;
    }
    const value = current.breakout[match.id];
    patchSection("breakout", { [match.id]: { ...value, orderQuantity: qty } });
    jumpToBreakoutItem(match);
  };
  const toggleBreakoutVoiceOrder = () => {
    if (breakoutVoiceActive) {
      breakoutVoiceRecognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      applyBreakoutVoiceCommand(transcript);
    };
    recognition.onerror = () => setBreakoutVoiceActive(false);
    recognition.onend = () => setBreakoutVoiceActive(false);
    breakoutVoiceRecognitionRef.current = recognition;
    recognition.start();
    setBreakoutVoiceActive(true);
  };

  const workflowStatusKey = current.frozenWorkflow?.status || "not_started";
  const frozenLocked = !canManage && workflowStatusKey === "submitted";

  const patchSection = (section, patch) => setRecord((previous) => ({ ...(previous || {}), [section]: { ...(current[section] || {}), ...patch } }));
  const saveRecord = async () => {
    if (!breakoutOnline) {
      // Realtime Database queues writes made while offline and flushes them on
      // reconnect, but the promise won't resolve until then — don't block the
      // UI on it. The localStorage draft (kept in sync below) is the real
      // safety net if the tab reloads before that happens.
      setSaveState("offline");
      window.setTimeout(() => setSaveState("idle"), 2200);
      saveDailyOperationsRecord(venueId, staffingDate, current, { uid: profile?.uid, name: profile?.displayName, role }).catch(() => {});
      return;
    }
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

  const updateBreakoutConfig = (nextList) =>
    saveOperationsSettings(venueId, { breakoutItems: nextList }, { uid: profile?.uid, name: profile?.displayName });
  const addBreakoutItem = async (area) => {
    const clean = newBreakoutName.trim();
    if (!clean || !area) return;
    if (breakoutConfig.some((item) => item.area === area && item.name.toLowerCase() === clean.toLowerCase())) return;
    await updateBreakoutConfig([...breakoutConfig, { id: `${slugify(area)}--${slugify(clean)}-${Date.now()}`, area, name: clean, code: "", active: true, order: breakoutConfig.length }]);
    setNewBreakoutName("");
  };
  const renameBreakoutItem = (id, name) => updateBreakoutConfig(breakoutConfig.map((item) => (item.id === id ? { ...item, name } : item)));
  const setBreakoutItemCode = (id, code) => updateBreakoutConfig(breakoutConfig.map((item) => (item.id === id ? { ...item, code } : item)));
  const setBreakoutItemUnit = (id, unit) => updateBreakoutConfig(breakoutConfig.map((item) => (item.id === id ? { ...item, unit } : item)));
  const setBreakoutItemPar = (id, par) => updateBreakoutConfig(breakoutConfig.map((item) => (item.id === id ? { ...item, par: Math.max(0, Number(par) || 0) } : item)));
  const setBreakoutItemPrice = (id, price) => updateBreakoutConfig(breakoutConfig.map((item) => (item.id === id ? { ...item, price: Math.max(0, Number(price) || 0) } : item)));
  const resetBreakoutSession = () => {
    patchSection("breakout", Object.fromEntries(activeBreakoutItems.map((item) => [item.id, { ...current.breakout[item.id], done: false, orderQuantity: 0 }])));
    setBreakoutTimerSeconds(0);
    setBreakoutTimerRunning(false);
  };
  const exportBreakoutCsv = async () => {
    const rows = breakoutOrderedItems.map((item) => {
      const entry = current.breakout[item.id];
      const qty = Number(entry.orderQuantity) || 0;
      const price = Number(item.price) || 0;
      const status = getBreakoutStatus(entry.stock, item.par);
      return [item.code || "", item.name, entry.stockUnit || "", `$${price.toFixed(2)}`, qty, `$${(price * qty).toFixed(2)}`, entry.notes || "", item.area, BREAKOUT_STATUS_META[status].label.toUpperCase()];
    });
    const header = ["ITEM #", "ITEM DESCRIPTION", "UOM", "PRICE", "QUANTITY", "TOTAL", "NOTES", "CATEGORY", "STATUS"];
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const filename = `breakout_${staffingDate}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}.csv`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (showAlert) await showAlert("CSV exported", `Saved as ${filename}`, { tone: "success" });
  };
  const handleBreakoutCsvImport = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = parseBreakoutCsvBlocks(String(reader.result || ""));
        if (!parsed.length) {
          if (showAlert) await showAlert("Import failed", "No items found in that file. Expected the Item No. / Description / UOM / Cost warehouse export format.", { tone: "danger" });
          return;
        }
        const { list, added, updated, areaCount } = mergeBreakoutImport(breakoutConfig, parsed);
        await updateBreakoutConfig(list);
        if (showAlert) await showAlert("CSV imported", `${added} item${added === 1 ? "" : "s"} added, ${updated} updated across ${areaCount} area${areaCount === 1 ? "" : "s"}.`, { tone: "success" });
      } catch (error) {
        console.error(error);
        if (showAlert) await showAlert("Import failed", "Couldn't read that file. Make sure it's the warehouse breakout CSV export.", { tone: "danger" });
      }
    };
    reader.readAsText(file);
  };
  const openBreakoutNote = (item) => { setBreakoutNoteItemId(item.id); setBreakoutNoteDraft(current.breakout[item.id]?.notes || ""); };
  const closeBreakoutNote = () => { setBreakoutNoteItemId(null); setBreakoutNoteDraft(""); };
  const saveBreakoutNote = () => {
    patchSection("breakout", { [breakoutNoteItemId]: { ...current.breakout[breakoutNoteItemId], notes: breakoutNoteDraft } });
    closeBreakoutNote();
  };
  const breakoutNoteItem = breakoutNoteItemId ? breakoutConfig.find((item) => item.id === breakoutNoteItemId) : null;
  const toggleBreakoutItemActive = (id) => updateBreakoutConfig(breakoutConfig.map((item) => (item.id === id ? { ...item, active: !item.active } : item)));

  useEffect(() => {
    if (activeTab !== "breakout") return undefined;
    const handleKeyDown = (event) => {
      const isMeta = event.metaKey || event.ctrlKey;
      const tag = event.target.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable;

      if (event.key === "Escape" && breakoutNoteItemId) {
        event.preventDefault();
        closeBreakoutNote();
        return;
      }
      if (isMeta && event.key.toLowerCase() === "f") {
        event.preventDefault();
        breakoutSearchInputRef.current?.focus();
        return;
      }
      if (isMeta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (breakoutOrderedItems.length > 0) exportBreakoutCsv();
        return;
      }
      if (!isTyping && !isMeta && !event.altKey && /^[1-9]$/.test(event.key)) {
        const area = breakoutAreaNames[Number(event.key) - 1];
        if (area) setBreakoutAreaTab(area);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- closeBreakoutNote/exportBreakoutCsv are plain consts recreated each render; breakoutOrderedItems already forces re-subscription every render so the closures never go stale.
  }, [activeTab, breakoutNoteItemId, breakoutAreaNames, breakoutOrderedItems]);

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

  const tableSizeBreakdown = {};
  visibleTables.forEach((table) => {
    const cap = Number(table.capacity) || 0;
    if (cap <= 0) return;
    const key = cap >= 10 ? "10+" : String(cap);
    tableSizeBreakdown[key] = (tableSizeBreakdown[key] || 0) + 1;
  });
  const tableSizeEntries = sortedTableSizeEntries(tableSizeBreakdown);
  const tableSizeTotal = tableSizeEntries.reduce((sum, [, count]) => sum + count, 0);
  const taroRollsPerTable = {};
  tableSizeEntries.forEach(([size]) => {
    const saved = settings?.taroRollsPerTable?.[size];
    taroRollsPerTable[size] = Number.isFinite(Number(saved)) ? Number(saved) : 1;
  });
  const totalTaroBaskets = tableSizeEntries.reduce((sum, [size, count]) => sum + count * (taroRollsPerTable[size] || 0), 0);
  const setTaroRollsPerTable = (size, value) =>
    saveOperationsSettings(venueId, { taroRollsPerTable: { ...(settings?.taroRollsPerTable || {}), [size]: Math.max(0, Number(value) || 0) } }, { uid: profile?.uid, name: profile?.displayName });

  const tabs = [
    ["assignments", "Assignment", ClipboardList], ["cloths", "Cloths", Shirt], ["leis", "Leis", Flower2],
    ["frozen", "Gelato / Ice Cream", IceCreamBowl], ["breakout", "Breakout", Package], ["pax", "Taro Rolls", ShoppingBasket],
    ["dashboard", "Dashboard", LayoutDashboard], ["history", "History", CalendarDays],
  ].filter(([id]) => sectionAccess[id]);

  const openAssignmentRemarks = (id) => { setAssignmentRemarksId(id); setAssignmentRemarksDraft(staffingAssignments?.[id]?.notes || ""); };
  const closeAssignmentRemarks = () => { setAssignmentRemarksId(null); setAssignmentRemarksDraft(""); };
  const saveAssignmentRemarks = () => {
    const row = staffingAssignments?.[assignmentRemarksId];
    onChangeAssignment(assignmentRemarksId, { ...row, notes: assignmentRemarksDraft });
    closeAssignmentRemarks();
  };

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
        <div className="ops-assignment-grid">
          {Object.entries(staffingAssignments || {}).length === 0 && <div className="ops-empty">No assignments have been posted for this date.</div>}
          {Object.entries(staffingAssignments || {}).map(([id, value]) => {
            const hasRemarks = Boolean((value.notes || "").trim());
            return (
              <div className="ops-assignment-card" key={id}>
                <div className="ops-assignment-card-top">
                  <input disabled={!canManageStaffing} className="ops-assignment-station" value={value.position || value.assignment || value.areaName || ""} placeholder="Station / assignment" onChange={(event) => onChangeAssignment(id, {...value, position:event.target.value, assignment:event.target.value, areaName:event.target.value})}/>
                  {canManageStaffing && <button type="button" className="ops-assignment-remove" onClick={() => onChangeAssignment(id,null)}><Trash2 size={14}/></button>}
                </div>
                <input disabled={!canManageStaffing} className="ops-assignment-name" value={value.displayName || ""} placeholder="Employee name" onChange={(event) => onChangeAssignment(id, {...value, displayName:event.target.value})}/>
                <div className="ops-assignment-time-row">
                  <label><span>Opening</span><input type="time" disabled={!canManageStaffing} value={value.opening || ""} onChange={(event) => onChangeAssignment(id, {...value, opening:event.target.value})}/></label>
                  <label><span>Closing</span><input type="time" disabled={!canManageStaffing} value={value.closing || ""} onChange={(event) => onChangeAssignment(id, {...value, closing:event.target.value})}/></label>
                </div>
                <button type="button" className={`ops-assignment-remarks-button ${hasRemarks ? "has-remarks" : ""}`} onClick={() => openAssignmentRemarks(id)}>
                  {hasRemarks ? <em>{value.notes.slice(0, 60)}{value.notes.length > 60 ? "…" : ""}</em> : "+ Add remarks / SOP note"}
                </button>
              </div>
            );
          })}
          {canManageStaffing && <button type="button" className="ops-add ops-assignment-add" onClick={() => onChangeAssignment(`assignment-${Date.now()}`, { assignment:"", displayName:"", active:true })}><Plus size={14}/> Add assignment</button>}
        </div>

        {assignmentRemarksId && (
          <div className="pcc-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAssignmentRemarks(); }}>
            <section className="ops-breakout-note-modal" role="dialog" aria-modal="true">
              <div className="ops-breakout-note-modal-head">
                <strong>{staffingAssignments?.[assignmentRemarksId]?.displayName || staffingAssignments?.[assignmentRemarksId]?.position || "Assignment"} — Remarks</strong>
                <button type="button" onClick={closeAssignmentRemarks} aria-label="Close"><X size={15}/></button>
              </div>
              <textarea
                value={assignmentRemarksDraft}
                placeholder="SOP notes, reminders, or what to do at this station…"
                onChange={(event) => setAssignmentRemarksDraft(event.target.value)}
                rows={5}
                disabled={!canManageStaffing}
              />
              {canManageStaffing ? (
                <div className="ops-breakout-note-modal-actions">
                  <button type="button" className="ops-primary" onClick={saveAssignmentRemarks}>Save</button>
                  <button type="button" className="ops-secondary" onClick={closeAssignmentRemarks}>Cancel</button>
                </div>
              ) : (
                <div className="ops-breakout-note-modal-actions">
                  <button type="button" className="ops-secondary" onClick={closeAssignmentRemarks}>Close</button>
                </div>
              )}
            </section>
          </div>
        )}
      </section>}

      {activeTab === "cloths" && <section className="ops-panel">
        <div className="ops-panel-heading"><div><h3>Cloth Count</h3><p>Enter leftover quantities. The total updates automatically.</p></div><div className="ops-total-chip"><span>Total</span><strong>{clothTotal}</strong></div></div>
        <div className="ops-count-list">{clothItems.map((name) => <NumberRow key={name} label={name} value={current.cloths[name]} disabled={false} onChange={(value) => patchSection("cloths", {[name]:value})} onRemove={canManage ? () => removeSettingItem("clothItems", clothItems, name) : null}/>)}</div>
        {canManage && <div className="ops-inline-add"><input value={newItem} placeholder="Add another cloth item" onChange={(event)=>setNewItem(event.target.value)}/><button type="button" onClick={()=>addSettingItem("clothItems", clothItems)}><Plus size={14}/> Add</button></div>}
        <button type="button" className="ops-primary ops-save" onClick={saveRecord}><Save size={14}/>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "offline" ? "Saved locally (offline)" : "Save cloth count"}</button>
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

        {(() => {
          const reorderCount = activeFlavors.filter((flavor) => NEEDS_REORDER_LEVELS.has(current.frozen[flavor.name]?.status)).length;
          return reorderCount > 0 && (
            <div className="ops-reorder-banner"><AlertTriangle size={14}/> {reorderCount} flavor{reorderCount === 1 ? "" : "s"} almost out or empty — needs ordering.</div>
          );
        })()}

        <div className="ops-frozen-grid">
          {activeFlavors.map((flavor) => {
            const value = current.frozen[flavor.name];
            const expectedClosing = Math.max(0, Number(value.opening || 0) + Number(value.added || 0) - Number(value.used || 0) - Number(value.damaged || 0));
            const variance = Math.round((Number(value.actualClosing || 0) - expectedClosing) * 100) / 100;
            const needsReorder = NEEDS_REORDER_LEVELS.has(value.status);
            return (
              <div className={`ops-frozen-card ops-frozen-card-v2 ${needsReorder ? "needs-reorder" : ""}`} key={flavor.id}>
                <div className="ops-subheading">
                  <strong>{flavor.name}</strong>
                  <span className="ops-unit-chip">{flavor.unit}</span>
                  {needsReorder && <span className="ops-reorder-chip"><AlertTriangle size={11}/> Order</span>}
                </div>
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
                <DecimalStepper label="Freezer stock (backup, not at station)" value={value.freezerStock} disabled={frozenLocked} onChange={(next)=>patchSection("frozen",{[flavor.name]:{...value,freezerStock:next}})}/>
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

      {activeTab === "breakout" && <section className="ops-panel">
        <div className="ops-panel-heading">
          <div><h3>Breakout / Inventory</h3><p>Track stock on hand and how much to order, by area.</p></div>
          <button type="button" className="ops-secondary" onClick={exportBreakoutCsv} disabled={breakoutOrderedItems.length === 0}><Download size={14}/> Export CSV</button>
        </div>

        {!breakoutOnline && (
          <div className="ops-breakout-offline-banner"><WifiOff size={14}/> You're offline. Changes are saved to this device and will sync once you're back online.</div>
        )}
        {breakoutDraftDiffers && (
          <div className="ops-breakout-restore-banner">
            <span>Unsynced changes found from {new Date(breakoutLocalDraft.savedAt).toLocaleString()}.</span>
            <button type="button" onClick={restoreBreakoutDraft}>Restore</button>
          </div>
        )}

        <div className="ops-breakout-progress-row">
          <div className="ops-breakout-progress-track"><div className="ops-breakout-progress-fill" style={{ width: `${breakoutProgressPct}%` }} /></div>
          <span className="ops-breakout-progress-label">{breakoutDoneCount} of {breakoutTotalCount} items done ({breakoutProgressPct}%)</span>
          <div className="ops-breakout-timer">
            <span>⏱️ {formatElapsed(breakoutTimerSeconds)}</span>
            <button type="button" onClick={() => setBreakoutTimerRunning((running) => !running)}>{breakoutTimerRunning ? "Stop" : "Start"}</button>
            <button type="button" onClick={() => { setBreakoutTimerSeconds(0); setBreakoutTimerRunning(false); }}>Reset</button>
          </div>
        </div>

        {previousBreakoutStats && (
          <div className="ops-breakout-trend-strip">
            <span>vs {formatDate(previousBreakoutDate)}:</span>
            <span>Items {previousBreakoutStats.itemCount} → {breakoutOrderedItems.length}{trendArrowText(breakoutOrderedItems.length, previousBreakoutStats.itemCount)}</span>
            <span>Cost ${previousBreakoutStats.cost.toFixed(2)} → ${breakoutTotalCost.toFixed(2)}{trendArrowText(breakoutTotalCost, previousBreakoutStats.cost)}</span>
          </div>
        )}

        {breakoutIsComplete && (
          <div className="ops-breakout-complete-banner">
            <div><strong>Breakout Complete! ✓</strong><span>{breakoutOrderedItems.length} items ordered · ${breakoutTotalCost.toFixed(2)} total · {formatElapsed(breakoutTimerSeconds)} elapsed</span></div>
            <div className="ops-breakout-complete-actions">
              <button type="button" className="ops-primary" onClick={exportBreakoutCsv} disabled={breakoutOrderedItems.length === 0}>Export CSV</button>
              <button type="button" className="ops-secondary" onClick={resetBreakoutSession}>New Breakout</button>
            </div>
          </div>
        )}

        <div className="ops-breakout-search">
          <Search size={14} />
          <input
            ref={breakoutSearchInputRef}
            type="text"
            value={breakoutSearch}
            placeholder="Search items by name or code…"
            onChange={(event) => setBreakoutSearch(event.target.value)}
          />
          {breakoutSearch && <button type="button" onClick={() => setBreakoutSearch("")} aria-label="Clear search"><X size={13}/></button>}
        </div>

        <div className="ops-breakout-scan-row">
          <form className="ops-breakout-barcode-form" onSubmit={handleBreakoutBarcodeSubmit}>
            <Barcode size={14} />
            <input
              type="text"
              inputMode="numeric"
              value={breakoutBarcodeInput}
              placeholder="Scan or type item # + Enter"
              onChange={(event) => setBreakoutBarcodeInput(event.target.value)}
            />
          </form>
          {breakoutBarcodeError && <span className="ops-breakout-barcode-error">{breakoutBarcodeError}</span>}
          {breakoutVoiceSupported && (
            <button
              type="button"
              className={`ops-breakout-voice-button ${breakoutVoiceActive ? "active" : ""}`}
              onClick={toggleBreakoutVoiceOrder}
              title="Voice order: say &quot;order 50 ice cubes&quot;"
            >
              <Mic size={14}/> {breakoutVoiceActive ? "Listening…" : "Voice order"}
            </button>
          )}
          {breakoutVoiceTranscript && <span className="ops-breakout-voice-transcript">"{breakoutVoiceTranscript}"</span>}
        </div>

        <div className="ops-breakout-area-tabs">
          {breakoutAreaNames.map((area) => {
            const urgentCount = breakoutUrgentByArea[area] || 0;
            return (
              <button type="button" key={area} className={breakoutAreaTab === area ? "active" : ""} onClick={() => setBreakoutAreaTab(area)}>
                {area}{urgentCount > 0 && <span className="ops-breakout-urgent-badge">{urgentCount}</span>}
              </button>
            );
          })}
          {breakoutAreaNames.length === 0 && <span className="ops-empty">No breakout areas configured yet.</span>}
        </div>

        <div className="ops-breakout-status-filters">
          {[
            ["all", "All Items"],
            ["urgent", "🔴 Urgent"],
            ["low", "🟡 Low Stock"],
            ["ok", "✓ OK"],
            ["belowPar", "Below Par"],
            ["needsRefill", "🧺 Needs Refill"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`filter-${key} ${breakoutStatusFilter === key ? "active" : ""}`}
              onClick={() => setBreakoutStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="ops-breakout-shortcuts">⌨️ 1-9 Areas · Ctrl/⌘+F Search · Ctrl/⌘+S Export · Esc Close note</p>

        <datalist id="ops-breakout-unit-options">
          {BREAKOUT_UNIT_OPTIONS.map((unit) => <option key={unit} value={unit} />)}
        </datalist>

        <div className="ops-breakout-grid">
          {visibleBreakoutItems.map((item) => {
            const value = current.breakout[item.id];
            const status = getBreakoutStatus(value.stock, item.par);
            const StatusIcon = BREAKOUT_STATUS_META[status].icon;
            const suggestion = getReorderSuggestion(value.stock, item.par);
            const hasNote = Boolean((value.notes || "").trim());
            const previousQty = Number(previousBreakoutRecord?.breakout?.[item.id]?.orderQuantity) || 0;
            const currentQty = Number(value.orderQuantity) || 0;
            const deviationPct = previousQty > 0 ? Math.round(((currentQty - previousQty) / previousQty) * 100) : 0;
            const showDeviation = previousQty > 0 && currentQty > 0 && Math.abs(deviationPct) >= 25;
            return (
              <div className={`ops-breakout-card status-${status} ${value.done ? "is-done" : ""} ${hasNote ? "has-note" : ""} ${breakoutHighlightId === item.id ? "is-scanned" : ""}`} key={item.id}>
                <div className="ops-breakout-card-top">
                  <label className="ops-breakout-done-check">
                    <input type="checkbox" checked={!!value.done} onChange={(event) => patchSection("breakout", { [item.id]: { ...value, done: event.target.checked } })} />
                  </label>
                  <span className="ops-breakout-card-name">{item.name}{item.code && <small>{item.code}</small>}</span>
                  <span className="ops-breakout-status-badge"><StatusIcon size={11}/> {BREAKOUT_STATUS_META[status].label}</span>
                </div>
                <div className="ops-breakout-stock-value">
                  <input type="number" min="0" step="0.5" value={value.stock} onChange={(event) => patchSection("breakout", { [item.id]: { ...value, stock: Math.max(0, Number(event.target.value) || 0) } })} />
                  <input
                    type="text"
                    list="ops-breakout-unit-options"
                    placeholder="unit"
                    value={value.stockUnit}
                    onChange={(event) => patchSection("breakout", { [item.id]: { ...value, stockUnit: event.target.value } })}
                    onBlur={(event) => {
                      const normalized = normalizeBreakoutUnit(event.target.value);
                      if (normalized !== value.stockUnit) patchSection("breakout", { [item.id]: { ...value, stockUnit: normalized } });
                    }}
                  />
                </div>
                <div className={`ops-breakout-level-row ${NEEDS_REORDER_LEVELS.has(value.level) ? "needs-refill" : ""}`}>
                  <label>
                    <span>Compartment</span>
                    <select value={value.level || "Full"} onChange={(event) => patchSection("breakout", { [item.id]: { ...value, level: event.target.value } })}>
                      {LEVELS.map((level) => <option key={level}>{level}</option>)}
                    </select>
                  </label>
                  {NEEDS_REORDER_LEVELS.has(value.level) && <span className="ops-breakout-refill-chip"><AlertTriangle size={11}/> Refill</span>}
                </div>
                <div className="ops-breakout-par-row">
                  <span>Par: {item.par}</span>
                  <span className="ops-breakout-suggestion">{suggestion.text}</span>
                </div>
                <label className="ops-breakout-order-field">
                  <span>Order qty</span>
                  <div className="ops-breakout-order-input-row">
                    <input type="number" min="0" value={value.orderQuantity} onChange={(event) => patchSection("breakout", { [item.id]: { ...value, orderQuantity: Math.max(0, Number(event.target.value) || 0) } })} />
                    {suggestion.qty > 0 && <button type="button" className="ops-breakout-use-suggestion" onClick={() => patchSection("breakout", { [item.id]: { ...value, orderQuantity: suggestion.qty } })}>Use {suggestion.qty}</button>}
                  </div>
                  {showDeviation && (
                    <span className={`ops-breakout-deviation ${deviationPct > 0 ? "up" : "down"}`} title={`${previousQty} last time vs ${currentQty} now`}>
                      {deviationPct > 0 ? "↑" : "↓"} {Math.abs(deviationPct)}% vs last time
                    </span>
                  )}
                </label>
                <button type="button" className="ops-breakout-note-button" onClick={() => openBreakoutNote(item)}>
                  {hasNote ? <em>{value.notes.slice(0, 60)}{value.notes.length > 60 ? "…" : ""}</em> : "+ Add note"}
                </button>
              </div>
            );
          })}
          {breakoutAreaTab && visibleBreakoutItems.length === 0 && (
            <div className="ops-empty">
              {breakoutSearchTerm
                ? `No items found matching "${breakoutSearch.trim()}".`
                : breakoutStatusFilter !== "all"
                  ? "No items match this filter in this area."
                  : "No items in this area yet."}
            </div>
          )}
        </div>

        <button type="button" className="ops-primary ops-save" onClick={saveRecord}><Save size={14}/>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "offline" ? "Saved locally (offline)" : "Save breakout counts"}</button>
        {breakoutNoteCount > 0 && <span className="ops-breakout-note-count">Notes ({breakoutNoteCount})</span>}

        {breakoutNoteItem && (
          <div className="pcc-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBreakoutNote(); }}>
            <section className="ops-breakout-note-modal" role="dialog" aria-modal="true">
              <div className="ops-breakout-note-modal-head">
                <strong>{breakoutNoteItem.name}</strong>
                <button type="button" onClick={closeBreakoutNote} aria-label="Close"><X size={15}/></button>
              </div>
              <textarea
                value={breakoutNoteDraft}
                placeholder="e.g. Temporarily out at supplier, use CoolBlue vendor instead"
                onChange={(event) => setBreakoutNoteDraft(event.target.value)}
                rows={4}
              />
              <div className="ops-breakout-note-modal-actions">
                <button type="button" className="ops-primary" onClick={saveBreakoutNote}>Save</button>
                <button type="button" className="ops-secondary" onClick={closeBreakoutNote}>Cancel</button>
              </div>
            </section>
          </div>
        )}

        {canManage && (
          <div className="ops-flavor-config">
            <div className="ops-breakout-config-heading">
              <h4>Breakout item configuration</h4>
              <button type="button" className="ops-secondary" onClick={() => breakoutCsvInputRef.current?.click()}><Upload size={13}/> Import CSV</button>
              <input ref={breakoutCsvInputRef} hidden type="file" accept=".csv,text/csv" onChange={handleBreakoutCsvImport} />
            </div>
            <p className="designer-small-copy">Import the warehouse Item No. / Description / UOM / Cost export (side-by-side categories). Matching item numbers are updated in place; new ones are added.</p>
            <div className="ops-flavor-config-list">
              {breakoutConfig.filter((item) => item.area === breakoutAreaTab).map((item) => (
                <div className={`ops-flavor-config-row ops-breakout-config-row ${!item.active ? "inactive" : ""}`} key={item.id}>
                  <input value={item.name} onChange={(event) => renameBreakoutItem(item.id, event.target.value)} />
                  <input placeholder="Code (optional)" value={item.code} onChange={(event) => setBreakoutItemCode(item.id, event.target.value)} />
                  <input list="ops-breakout-unit-options" placeholder="Unit" title="Default unit" value={item.unit} onChange={(event) => setBreakoutItemUnit(item.id, event.target.value)} onBlur={(event) => setBreakoutItemUnit(item.id, normalizeBreakoutUnit(event.target.value))} />
                  <input type="number" min="0" placeholder="Par" title="Par level" value={item.par} onChange={(event) => setBreakoutItemPar(item.id, event.target.value)} />
                  <input type="number" min="0" step="0.01" placeholder="Price" title="Unit price" value={item.price} onChange={(event) => setBreakoutItemPrice(item.id, event.target.value)} />
                  <button type="button" className="ops-flavor-toggle" onClick={() => toggleBreakoutItemActive(item.id)}>{item.active ? "Deactivate" : "Restore"}</button>
                </div>
              ))}
            </div>
            <div className="ops-inline-add">
              <input value={newBreakoutName} placeholder={`Add item to ${breakoutAreaTab || "this area"}`} onChange={(event) => setNewBreakoutName(event.target.value)} />
              <button type="button" onClick={() => addBreakoutItem(breakoutAreaTab)}><Plus size={14}/> Add</button>
            </div>
          </div>
        )}
      </section>}

      {activeTab === "dashboard" && <section className="ops-panel">
        <div className="ops-panel-heading"><div><h3>Breakout Dashboard</h3><p>Live view of today's breakout — updates whenever anyone saves their counts.</p></div></div>

        <div className="ops-dashboard-grid">
          <div className="ops-dashboard-widget">
            <div className="ops-dashboard-widget-head"><XCircle size={14}/><span>Urgent items</span><strong className="urgent">{breakoutUrgentItemsAll.length}</strong></div>
            {breakoutUrgentItemsAll.length === 0 && <div className="ops-empty">Nothing urgent right now.</div>}
            <div className="ops-dashboard-item-list">
              {breakoutUrgentItemsAll.slice(0, 12).map((item) => (
                <button type="button" key={item.id} onClick={() => jumpToBreakoutItem(item)}>
                  <span>{item.name}</span><small>{item.area} · stock {current.breakout[item.id]?.stock ?? 0}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="ops-dashboard-widget">
            <div className="ops-dashboard-widget-head"><AlertTriangle size={14}/><span>Low stock</span><strong className="low">{breakoutLowItemsAll.length}</strong></div>
            {breakoutLowItemsAll.length === 0 && <div className="ops-empty">No low-stock items.</div>}
            <div className="ops-dashboard-item-list">
              {breakoutLowItemsAll.slice(0, 12).map((item) => (
                <button type="button" key={item.id} onClick={() => jumpToBreakoutItem(item)}>
                  <span>{item.name}</span><small>{item.area} · stock {current.breakout[item.id]?.stock ?? 0} / par {item.par}</small>
                </button>
              ))}
            </div>
            {breakoutLowItemsAll.length > 0 && <p className="designer-small-copy">Consider pre-ordering these before they go urgent.</p>}
          </div>

          <div className="ops-dashboard-widget">
            <div className="ops-dashboard-widget-head"><Gauge size={14}/><span>Progress</span></div>
            <div className="ops-breakout-progress-track"><div className="ops-breakout-progress-fill" style={{ width: `${breakoutProgressPct}%` }} /></div>
            <p>{breakoutDoneCount} of {breakoutTotalCount} items done ({breakoutProgressPct}%)</p>
            <p>⏱️ {formatElapsed(breakoutTimerSeconds)} elapsed</p>
            <p>{breakoutEtaSeconds !== null ? `Est. ${formatElapsed(breakoutEtaSeconds)} remaining at current pace` : "Not enough progress yet to estimate completion"}</p>
          </div>

          <div className="ops-dashboard-widget">
            <div className="ops-dashboard-widget-head"><Package size={14}/><span>Cost tracking</span></div>
            <p className="ops-dashboard-big-number">${breakoutTotalCost.toFixed(2)}</p>
            <p>{breakoutOrderedItems.length} items ordered so far</p>
            {previousBreakoutStats && <p>vs {formatDate(previousBreakoutDate)}: ${previousBreakoutStats.cost.toFixed(2)}{trendArrowText(breakoutTotalCost, previousBreakoutStats.cost)}</p>}
          </div>
        </div>
      </section>}

      {activeTab === "pax" && <section className="ops-panel">
        <div className="ops-panel-heading"><div><h3>Taro Rolls (Pax)</h3><p>Table counts come straight from today's seating layout — screenshot the tile row below for prep.</p></div></div>

        <div className="ops-taro-panel">
          {tableSizeEntries.length === 0 ? (
            <div className="ops-empty">No tables in today's seating layout yet.</div>
          ) : (
            <>
              <div className="ops-taro-grid">
                {tableSizeEntries.map(([size, count]) => (
                  <div className="ops-taro-tile" key={size}>
                    <span className="ops-taro-tile-count">{count}</span>
                    <span className="ops-taro-tile-label">table{count === 1 ? "" : "s"} of {size}</span>
                    {canManage && (
                      <label className="ops-taro-tile-baskets">
                        <span>Baskets/table</span>
                        <input type="number" min="0" step="0.5" value={taroRollsPerTable[size]} onChange={(event) => setTaroRollsPerTable(size, event.target.value)} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              <div className="ops-taro-total">
                <div><span>Total tables</span><strong>{tableSizeTotal}</strong></div>
                <div><span>Total baskets to prep</span><strong>{totalTaroBaskets}</strong></div>
              </div>
            </>
          )}
        </div>

        <div className="ops-panel-heading"><div><h4>Manual guest counts</h4><p>Optional — for reference alongside the live table breakdown above.</p></div></div>
        <div className="ops-metrics"><div><span>Manual tables</span><strong>{manualTableTotal}</strong></div><div><span>Manual guests</span><strong>{manualPaxTotal}</strong></div><div><span>Live occupied guests</span><strong>{liveGuestTotal}</strong></div></div>
        <div className="ops-pax-layout"><div><h4>Manual guest counts</h4>{PAX_SIZES.map((size)=><NumberRow key={size} label={`${size} Pax`} value={current.pax[size]} disabled={false} onChange={(value)=>patchSection("pax",{[size]:value})}/>)}</div><div><h4>Live occupied tables</h4><div className="ops-live-pax">{Object.keys(livePax).length===0?<div className="ops-empty">No occupied tables with guest counts yet.</div>:Object.entries(livePax).sort((a,b)=>Number(a[0])-Number(b[0])).map(([size,count])=><div key={size}><span>{size} Pax</span><strong>{count} table{Number(count)===1?"":"s"}</strong></div>)}</div></div></div>
        <button type="button" className="ops-primary ops-save" onClick={saveRecord}><Save size={14}/> Save pax counts</button>
      </section>}

      {activeTab === "history" && <section className="ops-panel"><div className="ops-panel-heading"><div><h3>Daily History</h3><p>Open a date to review or continue its saved counts.</p></div></div><div className="ops-history-list">{Object.keys(history).length===0?<div className="ops-empty">No daily records saved yet.</div>:Object.entries(history).sort(([a],[b])=>b.localeCompare(a)).map(([date,value])=><button type="button" key={date} onClick={()=>onDateChange(date)}><span><strong>{formatDate(date)}</strong><small>Updated by {value.updatedByName||"employee"}</small></span><span>{Object.values(value.cloths||{}).reduce((sum,item)=>sum+Number(item||0),0)} cloths</span></button>)}</div></section>}

      {saveState === "error" && <div className="ops-error">Unable to save. Check the Firebase connection and permissions.</div>}
    </div>
  );
}
