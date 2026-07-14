import { useEffect, useMemo, useState } from "react";
import { CalendarDays, RotateCcw, Sparkles } from "lucide-react";

const DEFAULT_ROWS = [
  { capacity: 2, count: 0 },
  { capacity: 4, count: 0 },
  { capacity: 6, count: 0 },
  { capacity: 8, count: 0 },
  { capacity: 10, count: 0 },
  { capacity: 11, count: 0, custom: true },
];

const TABLE_TYPES = [
  ["regular", "Regular"],
  ["alii_luau", "Aliʻi Luau"],
  ["luau", "Luau"],
  ["super_ambassadors", "Super Ambassadors"],
  ["gateway_regular", "Gateway Regular"],
  ["vip", "VIP"],
];

function defaultTypeForVenue(venueName = "") {
  const name = venueName.toLowerCase();
  if (name.includes("gateway")) return "gateway_regular";
  if (name.includes("aloha")) return "alii_luau";
  return "regular";
}

export default function DailySetupGenerator({ venueId, venueName, canManage, layoutLocked, onGenerate }) {
  const storageKey = `pcc-daily-setup-counts:v15.2:${venueId}`;
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [startingNumber, setStartingNumber] = useState(1);
  const [tableType, setTableType] = useState(() => defaultTypeForVenue(venueName));
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      setRows(Array.isArray(saved?.rows) && saved.rows.length ? saved.rows : DEFAULT_ROWS);
      setStartingNumber(Number(saved?.startingNumber) || 1);
      setTableType(saved?.tableType || defaultTypeForVenue(venueName));
    } catch {
      setRows(DEFAULT_ROWS);
    }
  }, [storageKey, venueName]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ rows, startingNumber, tableType }));
  }, [rows, startingNumber, storageKey, tableType]);

  const totalTables = useMemo(
    () => rows.reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0), 0),
    [rows]
  );
  const totalSeats = useMemo(
    () => rows.reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0) * Math.max(1, Number(row.capacity) || 1), 0),
    [rows]
  );

  const updateRow = (index, patch) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    setMessage("");
  };

  const clearCounts = () => {
    setRows((current) => current.map((row) => ({ ...row, count: 0 })));
    setMessage("Counts cleared.");
  };

  const generate = async () => {
    if (working || !canManage || layoutLocked || totalTables === 0) return;
    setWorking(true);
    setMessage("Building today’s tables…");
    try {
      const entries = rows
        .map((row) => ({ capacity: Math.max(1, Number(row.capacity) || 1), count: Math.max(0, Number(row.count) || 0) }))
        .filter((row) => row.count > 0);
      const result = await Promise.resolve(onGenerate?.({ entries, startingNumber, tableType, tableSize: 34 }));
      setMessage(result?.message || (result?.ok ? `${result.count} tables generated for ${venueName}.` : "Unable to generate today’s tables."));
    } catch (error) {
      console.error("Daily setup generation failed:", error);
      setMessage(`Generator error: ${error?.message || "Unknown error"}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="daily-setup-v152">
      <header className="daily-setup-v152-header">
        <div className="daily-setup-v152-icon"><CalendarDays size={17} /></div>
        <div>
          <h2>Today&apos;s Table Setup</h2>
          <p>Copy the counts from your boss&apos;s setup sheet, then generate the full venue in one click.</p>
        </div>
      </header>

      <div className="daily-setup-v152-grid">
        {rows.map((row, index) => (
          <article className="daily-setup-v152-card" key={`${index}-${row.custom ? "custom" : row.capacity}`}>
            <label>
              <span>{row.custom ? "Other pax" : `${row.capacity} PAX`}</span>
              {row.custom && (
                <input
                  className="daily-pax-input"
                  aria-label="Other pax capacity"
                  type="number"
                  min="1"
                  max="300"
                  value={row.capacity}
                  onChange={(event) => updateRow(index, { capacity: Number(event.target.value) || 1 })}
                />
              )}
            </label>
            <div className="daily-count-control">
              <button type="button" onClick={() => updateRow(index, { count: Math.max(0, Number(row.count) - 1) })} aria-label={`Remove one ${row.capacity}-pax table`}>−</button>
              <input
                aria-label={`${row.capacity}-pax table count`}
                type="number"
                min="0"
                max="200"
                value={row.count}
                onFocus={(event) => event.target.select()}
                onChange={(event) => updateRow(index, { count: Math.max(0, Number(event.target.value) || 0) })}
              />
              <button type="button" onClick={() => updateRow(index, { count: Math.min(200, Number(row.count) + 1) })} aria-label={`Add one ${row.capacity}-pax table`}>+</button>
            </div>
            <small>tables</small>
          </article>
        ))}
      </div>

      <div className="daily-setup-v152-options">
        <label><span>Start table #</span><input type="number" min="0" value={startingNumber} onChange={(event) => setStartingNumber(Number(event.target.value) || 0)} /></label>
        <label><span>Category</span><select value={tableType} onChange={(event) => setTableType(event.target.value)}>{TABLE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      <div className="daily-setup-v152-summary">
        <span><strong>{totalTables}</strong> tables</span>
        <span><strong>{totalSeats}</strong> seats</span>
        <small>Existing daily tables will be replaced. Areas, landmarks, and the venue map stay safe.</small>
      </div>

      <button type="button" className="daily-setup-v152-generate" disabled={!canManage || layoutLocked || working || totalTables === 0} onClick={generate}>
        <Sparkles size={15} /> {working ? "Generating…" : `Generate ${totalTables || "Today’s"} Tables`}
      </button>
      <button type="button" className="daily-setup-v152-clear" onClick={clearCounts}><RotateCcw size={13} /> Clear counts</button>

      {layoutLocked && <div className="daily-setup-v152-message warning">Unlock the layout before generating today&apos;s tables.</div>}
      {message && <div className="daily-setup-v152-message" role="status">{message}</div>}
    </section>
  );
}
