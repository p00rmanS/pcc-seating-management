import { Building2, ChevronDown, ShieldCheck } from "lucide-react";

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
  onOpenAccount,
  testingMode = false,
  onRetryCloud,
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
      {testingMode && (
        <div className="development-banner">
          <strong>DEVELOPMENT / TEST MODE</strong>
          <span>Use fake guest names only while workflows and security are being verified.</span>
        </div>
      )}
      <div className="workspace-header-main">
        <div className="workspace-title-block">
          <h1>{title}</h1>
          <p>{instructions}</p>
        </div>

        <div className="workspace-account-area">
          <div className="workspace-sync-stack">
            <span><i className={saveDotClass} />{saveLabel}</span>
            <span><i className={cloudDot} />{cloudLabel}{cloudState === "error" && onRetryCloud ? <button type="button" className="sync-retry-button" onClick={onRetryCloud}>Retry</button> : null}</span>
          </div>

          <button type="button" className="workspace-account-card workspace-account-button" onClick={onOpenAccount}>
            <ShieldCheck size={16} />
            <div>
              <strong>{profile.displayName}</strong>
              <span className="capitalize">{currentRole} · {visibleRestaurants.map((venue) => venue.name).join(", ")}</span>
            </div>
            <ChevronDown size={16} />
          </button>
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
