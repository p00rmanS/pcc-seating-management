import { Gauge, UsersRound } from "lucide-react";

function NumberField({ label, value, onChange, helper, disabled }) {
  return (
    <label className="capacity-field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value ?? 0}
        disabled={disabled}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      />
      {helper && <small>{helper}</small>}
    </label>
  );
}

export default function CapacityPanel({
  venueName,
  operations,
  metrics,
  onUpdate,
  canManage,
}) {
  const expected = operations.expectedGuests ?? 0;
  const scanned = operations.scannedGuests ?? 0;
  const venueCapacity = operations.venueCapacity ?? 0;
  const unscanned = Math.max(0, expected - scanned);
  const waitingAfterScan = Math.max(0, scanned - metrics.seatedGuests);
  const remainingCapacity = venueCapacity > 0
    ? Math.max(0, venueCapacity - metrics.seatedGuests)
    : Math.max(0, metrics.totalTableCapacity - metrics.seatedGuests);

  return (
    <div className="workspace-tool-content operation-panel">
      <div>
        <h2 className="operation-heading"><Gauge size={15} /> Venue capacity</h2>
        <p>Live seating estimates for {venueName}. Scanner totals remain manual until PCC grants an approved integration.</p>
      </div>

      <div className="capacity-summary-grid">
        <div><span>Occupied tables</span><strong>{metrics.occupiedTables}</strong></div>
        <div><span>Seated estimate</span><strong>{metrics.seatedGuests}</strong></div>
        <div><span>Waiting after scan</span><strong>{waitingAfterScan}</strong></div>
        <div><span>Open seats</span><strong>{remainingCapacity}</strong></div>
      </div>

      <div className="capacity-form">
        <NumberField
          label="Expected guests"
          value={expected}
          onChange={(value) => onUpdate({ expectedGuests: value })}
          helper="Example: 900 expected guests"
          disabled={!canManage}
        />
        <NumberField
          label="Scanned guests"
          value={scanned}
          onChange={(value) => onUpdate({ scannedGuests: value })}
          helper={`Unscanned: ${unscanned}`}
          disabled={!canManage}
        />
        <NumberField
          label="Venue guest capacity"
          value={venueCapacity}
          onChange={(value) => onUpdate({ venueCapacity: value })}
          helper={venueCapacity > 0 ? "Configured venue capacity" : `Using table capacity estimate: ${metrics.totalTableCapacity}`}
          disabled={!canManage}
        />
      </div>

      {!canManage && (
        <div className="operation-notice"><UsersRound size={15} /> Capacity inputs are read-only for this role.</div>
      )}

      <div className="capacity-method-note">
        <strong>How seated guests are calculated</strong>
        <span>Occupied tables use the entered party size. When no party size is entered, the table capacity is used as an estimate.</span>
      </div>
    </div>
  );
}
