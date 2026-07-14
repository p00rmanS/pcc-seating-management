import { useEffect, useMemo, useState } from "react";

const DEFAULT_ROWS = [
  { capacity: 2, count: 0 },
  { capacity: 4, count: 0 },
  { capacity: 6, count: 0 },
  { capacity: 8, count: 0 },
  { capacity: 10, count: 0 },
  { capacity: 11, count: 0 },
];

const TABLE_TYPES = [
  ["regular", "Regular"],
  ["alii_luau", "Aliʻi Luau"],
  ["luau", "Luau"],
  ["super_ambassadors", "Super Ambassadors"],
  ["gateway_regular", "Gateway Regular"],
  ["vip", "VIP"],
];

export default function DailySetupGenerator({ venueId, venueName, canManage, onGenerate }) {
  const storageKey = `pcc-daily-setup-counts:${venueId}`;
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [startingNumber, setStartingNumber] = useState(1);
  const [tableType, setTableType] = useState("regular");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      setRows(Array.isArray(saved?.rows) ? saved.rows : DEFAULT_ROWS);
      setStartingNumber(Number(saved?.startingNumber) || 1);
      setTableType(saved?.tableType || "regular");
      setReplaceExisting(saved?.replaceExisting !== false);
    } catch {
      setRows(DEFAULT_ROWS);
    }
  }, [storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ rows, startingNumber, tableType, replaceExisting }));
  }, [replaceExisting, rows, startingNumber, storageKey, tableType]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0), 0), [rows]);
  const totalSeats = useMemo(() => rows.reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0) * Math.max(1, Number(row.capacity) || 1), 0), [rows]);

  const updateRow = (index, key, value) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: Number(value) || 0 } : row));
  };

  const clearCounts = () => {
    setRows((current) => current.map((row) => ({ ...row, count: 0 })));
    setMessage("Counts cleared.");
  };

  const generate = async () => {
    if (working || !canManage) return;
    setWorking(true);
    setMessage("Generating daily tables…");
    try {
      const result = await Promise.resolve(onGenerate?.({ entries: rows, startingNumber, tableType, replaceExisting, tableSize: 34 }));
      setMessage(result?.message || (result?.ok ? "Daily tables generated." : "Unable to generate daily tables."));
    } catch (error) {
      console.error("Daily setup generation failed:", error);
      setMessage(`Generator error: ${error?.message || "Unknown error"}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className={`daily-setup-generator ${collapsed ? "collapsed" : ""}`}>
      <header className="daily-setup-header">
        <div>
          <h2>Daily Setup Generator</h2>
          <p>Enter today’s table counts from the setup sheet, then create the complete {venueName} arrangement at once.</p>
        </div>
        <div className="daily-setup-summary">
          <strong>{total} tables</strong>
          <span>{totalSeats} seats</span>
          <button type="button" onClick={() => setCollapsed((value) => !value)}>{collapsed ? "Open" : "Collapse"}</button>
        </div>
      </header>

      {!collapsed && (
        <>
          <div className="daily-setup-grid">
            {rows.map((row, index) => (
              <article className="daily-setup-card" key={`${row.capacity}-${index}`}>
                <label><span>Pax</span><input type="number" min="1" max="300" value={row.capacity} onChange={(event) => updateRow(index, "capacity", event.target.value)} /></label>
                <label><span>Tables</span><input type="number" min="0" max="200" value={row.count} onChange={(event) => updateRow(index, "count", event.target.value)} /></label>
              </article>
            ))}
          </div>

          <div className="daily-setup-options">
            <label><span>Starting table #</span><input type="number" min="0" value={startingNumber} onChange={(event) => setStartingNumber(Number(event.target.value) || 0)} /></label>
            <label><span>Table category</span><select value={tableType} onChange={(event) => setTableType(event.target.value)}>{TABLE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="daily-setup-check"><input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /><span>Replace today’s existing tables; keep areas and landmarks</span></label>
          </div>

          <div className="daily-setup-actions">
            <button type="button" className="daily-setup-generate" disabled={!canManage || working || total === 0} onClick={generate}>{working ? "Generating…" : `Generate ${total || "Daily"} Tables`}</button>
            <button type="button" className="daily-setup-clear" onClick={clearCounts}>Clear Counts</button>
            {message && <output>{message}</output>}
          </div>
        </>
      )}
    </section>
  );
}
