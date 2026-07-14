import { Activity, Armchair, CalendarDays, Gauge, PartyPopper, Users, UtensilsCrossed } from "lucide-react";

function visibleTables(tables = []) {
  return tables.filter((table) => !(table.childIds && table.childIds.length));
}

function venueMetrics({ tables = [], areas = [], servers = [], operations = {} }) {
  const floorTables = visibleTables(tables);
  const occupied = floorTables.filter((table) => table.status === "occupied");
  const seatedGuests = occupied.reduce((sum, table) => {
    const partySize = Number(table.partySize);
    return sum + (partySize > 0 ? partySize : Number(table.capacity) || 0);
  }, 0);
  const vipTables = floorTables.filter((table) => table.tableType === "vip").length;
  const celebrationTables = floorTables.filter((table) =>
    /birthday|anniversary|honeymoon|celebration|congrat/i.test(`${table.guestName || ""} ${table.notes || ""}`)
  ).length;
  const largeParties = floorTables.filter((table) => Math.max(Number(table.partySize) || 0, Number(table.capacity) || 0) >= 16).length;
  const venueCapacity = Number(operations.venueCapacity) || floorTables.reduce((sum, table) => sum + (Number(table.capacity) || 0), 0);
  const occupancyPercent = venueCapacity > 0 ? Math.min(100, Math.round((seatedGuests / venueCapacity) * 100)) : 0;
  return {
    occupiedTables: occupied.length,
    availableTables: floorTables.length - occupied.length,
    totalTables: floorTables.length,
    seatedGuests,
    scannedGuests: Number(operations.scannedGuests) || 0,
    expectedGuests: Number(operations.expectedGuests) || 0,
    venueCapacity,
    occupancyPercent,
    vipTables,
    celebrationTables,
    largeParties,
    assignedStaff: servers.length,
    seatingAreas: areas.filter((area) => (area.areaKind ?? "seating") === "seating" && !area.hidden).length,
  };
}

export default function LiveOperationsDashboard({
  restaurants,
  activeVenueId,
  tablesByVenue,
  areasByVenue,
  serversByVenue,
  operationsByVenue,
  activity,
  staffingAssignments,
  onOpenVenue,
}) {
  const cards = restaurants.map((restaurant) => ({
    restaurant,
    metrics: venueMetrics({
      tables: tablesByVenue[restaurant.id],
      areas: areasByVenue[restaurant.id],
      servers: serversByVenue[restaurant.id],
      operations: operationsByVenue[restaurant.id],
    }),
  }));

  const activeStaffCount = Object.values(staffingAssignments || {}).filter(Boolean).length;
  const recentActivity = (activity || []).slice(0, 12);

  return (
    <div className="operations-dashboard">
      <div className="operations-dashboard-heading">
        <div>
          <h2><Gauge size={17} /> Live Operations</h2>
          <p>Real-time seating, staffing, capacity, VIP, large-party, and activity overview.</p>
        </div>
        <span className="live-pill"><span /> Live</span>
      </div>

      <div className="operations-venue-grid">
        {cards.map(({ restaurant, metrics }) => (
          <button type="button" key={restaurant.id} className={`operations-venue-card ${activeVenueId === restaurant.id ? "active" : ""}`} onClick={() => onOpenVenue?.(restaurant.id)}>
            <div className="operations-card-head">
              <strong>{restaurant.name}</strong>
              <span>{metrics.occupancyPercent}% full</span>
            </div>
            <div className="operations-progress"><span style={{ width: `${metrics.occupancyPercent}%` }} /></div>
            <div className="operations-kpi-grid">
              <div><Users size={14} /><strong>{metrics.seatedGuests}</strong><span>Seated</span></div>
              <div><Armchair size={14} /><strong>{metrics.occupiedTables}</strong><span>Occupied</span></div>
              <div><Armchair size={14} /><strong>{metrics.availableTables}</strong><span>Available</span></div>
              <div><UtensilsCrossed size={14} /><strong>{metrics.venueCapacity}</strong><span>Capacity</span></div>
            </div>
            <div className="operations-card-tags">
              <span>VIP {metrics.vipTables}</span>
              <span>Celebrations {metrics.celebrationTables}</span>
              <span>Large parties {metrics.largeParties}</span>
              <span>Areas {metrics.seatingAreas}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="operations-dashboard-columns">
        <section className="operations-summary-panel">
          <h3><CalendarDays size={15} /> Active venue staffing</h3>
          <div className="operations-summary-row"><span>Assignments today</span><strong>{activeStaffCount}</strong></div>
          <div className="operations-summary-row"><span>Expected guests</span><strong>{Number(operationsByVenue[activeVenueId]?.expectedGuests) || 0}</strong></div>
          <div className="operations-summary-row"><span>Scanned guests</span><strong>{Number(operationsByVenue[activeVenueId]?.scannedGuests) || 0}</strong></div>
          <div className="operations-summary-row"><span>Unscanned</span><strong>{Math.max(0, (Number(operationsByVenue[activeVenueId]?.expectedGuests) || 0) - (Number(operationsByVenue[activeVenueId]?.scannedGuests) || 0))}</strong></div>
          <p>Scanner counts remain manual until PCC grants an approved system integration.</p>
        </section>

        <section className="operations-activity-panel">
          <h3><Activity size={15} /> Recent activity</h3>
          {recentActivity.length === 0 ? (
            <div className="operations-empty">No activity recorded yet.</div>
          ) : (
            <div className="operations-activity-list">
              {recentActivity.map((event, index) => (
                <div key={event.id || `${event.changedAtClient}-${index}`}>
                  <span className="activity-dot" />
                  <div><strong>{event.changedByName || event.changedByRole || "Employee"}</strong><p>{event.label || event.entityId} → {event.toStatus || event.action || "updated"}</p></div>
                  <time>{event.changedAtClient ? new Date(event.changedAtClient).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now"}</time>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="operations-dashboard-note"><PartyPopper size={15} /> Celebration totals currently use guest names/notes containing birthday, anniversary, honeymoon, celebration, or congratulations.</div>
    </div>
  );
}
