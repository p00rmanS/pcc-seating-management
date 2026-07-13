import { Building2, ShieldCheck } from "lucide-react";

export default function AppHeader({
  title,
  instructions,
  saveLabel,
  saveDotClass,
  cloudState,
  lastCloudSavedAt,
  profile,
  currentRole,
  visibleRestaurants,
  activeRid,
  layoutConfig,
  onVenueChange,
  onSignOut,
}) {
  const cloudLabel =
    cloudState === "live"
      ? `Live sync${lastCloudSavedAt ? ` · ${new Date(lastCloudSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : " connected"}`
      : cloudState === "saving"
        ? "Saving to cloud…"
        : cloudState === "offline"
          ? "Offline · local backup active"
          : cloudState === "error"
            ? "Cloud sync failed"
            : "Connecting to Firebase…";

  const cloudDot =
    cloudState === "live"
      ? "bg-green-500"
      : cloudState === "saving" || cloudState === "connecting"
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <header className="workspace-header">
      <div className="workspace-header-main">
        <div className="workspace-title-block">
          <h1>{title}</h1>
          <p>{instructions}</p>
        </div>

        <div className="workspace-account-area">
          <div className="workspace-sync-stack">
            <span><i className={saveDotClass} />{saveLabel}</span>
            <span><i className={cloudDot} />{cloudLabel}</span>
          </div>

          <div className="workspace-account-card">
            <ShieldCheck size={16} />
            <div>
              <strong>{profile.displayName}</strong>
              <span className="capitalize">{currentRole} · {visibleRestaurants.map((venue) => venue.name).join(", ")}</span>
            </div>
            <button type="button" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </div>

      <nav className="workspace-venue-nav" aria-label="Authorized venues">
        <Building2 size={17} />
        {visibleRestaurants.map((restaurant) => (
          <button
            type="button"
            key={restaurant.id}
            onClick={() => onVenueChange(restaurant.id)}
            className={activeRid === restaurant.id ? "active" : ""}
          >
            <span>{restaurant.name}</span>
            <small>{layoutConfig[restaurant.id].canvasWidth}×{layoutConfig[restaurant.id].canvasHeight}</small>
          </button>
        ))}
      </nav>
    </header>
  );
}
