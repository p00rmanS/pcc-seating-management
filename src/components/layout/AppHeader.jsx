import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Plus,
  Calendar,
  Search,
  Users,
  Gauge,
  Copy,
  Pencil,
  X,
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
} from "lucide-react";

const HAWAII_TZ = "Pacific/Honolulu";
// Laie, Oahu — home of the Polynesian Cultural Center.
const VENUE_LAT = 21.6435;
const VENUE_LON = -157.9226;
const WEATHER_CACHE_KEY = "pcc-hawaii-weather-cache-v1";
const WEATHER_REFRESH_MS = 20 * 60 * 1000;

function weatherCodeToInfo(code) {
  if (code === 0) return { Icon: Sun, label: "Clear" };
  if (code === 1) return { Icon: CloudSun, label: "Mostly clear" };
  if (code === 2) return { Icon: CloudSun, label: "Partly cloudy" };
  if (code === 3) return { Icon: Cloud, label: "Overcast" };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: "Foggy" };
  if ([51, 53, 55, 56, 57].includes(code)) return { Icon: CloudDrizzle, label: "Drizzle" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { Icon: CloudRain, label: "Rain showers" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { Icon: CloudSnow, label: "Snow" };
  if ([95, 96, 99].includes(code)) return { Icon: CloudLightning, label: "Thunderstorms" };
  return { Icon: Cloud, label: "—" };
}

function useHawaiiClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat("en-US", { timeZone: HAWAII_TZ, weekday: "long", month: "long", day: "numeric" }).format(now),
    [now]
  );
  const timeLabel = useMemo(
    () => new Intl.DateTimeFormat("en-US", { timeZone: HAWAII_TZ, hour: "numeric", minute: "2-digit" }).format(now),
    [now]
  );
  return { dateLabel, timeLabel };
}

function useHawaiiWeather() {
  const [weather, setWeather] = useState(() => {
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(WEATHER_CACHE_KEY) || "null");
      return cached && Date.now() - cached.fetchedAt < WEATHER_REFRESH_MS * 3 ? cached : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${VENUE_LAT}&longitude=${VENUE_LON}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=${encodeURIComponent(HAWAII_TZ)}`
        );
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !data?.current) return;
        const next = {
          tempF: Math.round(data.current.temperature_2m),
          code: data.current.weather_code,
          fetchedAt: Date.now(),
        };
        setWeather(next);
        window.sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(next));
      } catch {
        // Offline or blocked — keep showing the last cached reading, if any.
      }
    };

    const isStale = !weather || Date.now() - weather.fetchedAt >= WEATHER_REFRESH_MS;
    if (isStale) fetchWeather();
    const timer = window.setInterval(fetchWeather, WEATHER_REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return weather;
}

function TableSearchBox({ tables, onLocateTable }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return (tables || [])
      .filter((table) => String(table.number || "").toLowerCase().includes(term) || String(table.guestName || "").toLowerCase().includes(term))
      .slice(0, 8);
  }, [query, tables]);

  const pick = (table) => {
    onLocateTable?.(table);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="header-table-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <Search size={14} />
      <input
        type="text"
        value={query}
        placeholder="Find table # or guest…"
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) pick(matches[0]); if (event.key === "Escape") { setQuery(""); setOpen(false); } }}
      />
      {query && <button type="button" className="header-table-search-clear" onClick={() => { setQuery(""); setOpen(false); }} aria-label="Clear search"><X size={12} /></button>}
      {open && query && (
        <div className="header-table-search-results" role="listbox">
          {matches.length === 0 && <div className="header-table-search-empty">No tables match “{query}”.</div>}
          {matches.map((table) => (
            <button type="button" key={table.id} onClick={() => pick(table)}>
              <strong>#{table.number}</strong>
              <span>{table.guestName || (table.status === "occupied" ? "Occupied" : "Available")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  onRetryCloud,
  collapsed = false,
  onToggleCollapsed,
  canCreateVenue = false,
  onCreateVenue,
  onDuplicateVenue,
  onRenameVenue,
  venueTables = [],
  onLocateTable,
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

  const { dateLabel, timeLabel } = useHawaiiClock();
  const weather = useHawaiiWeather();
  const WeatherIcon = weather ? weatherCodeToInfo(weather.code).Icon : Cloud;
  const weatherLabel = weather ? weatherCodeToInfo(weather.code).label : "Loading…";

  const visibleTables = useMemo(() => (venueTables || []).filter((table) => !(table.childIds && table.childIds.length)), [venueTables]);
  const occupiedCount = visibleTables.filter((table) => table.status === "occupied").length;
  const guestCount = visibleTables.reduce((sum, table) => sum + (Number(table.guestCount) || (table.status === "occupied" ? Number(table.capacity) || 0 : 0)), 0);

  return (
    <header className={`workspace-header ${collapsed ? "is-collapsed" : ""}`}>
      <button type="button" className="header-collapse-button" onClick={onToggleCollapsed} title={collapsed ? "Restore header" : "Minimize header"} aria-label={collapsed ? "Restore header" : "Minimize header"}>{collapsed ? <ChevronDown size={18}/> : <ChevronUp size={18}/>}</button>
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

      <div className="workspace-status-strip">
        <span className="header-status-chip" title="Local venue time"><Calendar size={13} />{dateLabel} · {timeLabel}</span>
        <span className="header-status-chip" title={weather ? `${weatherLabel} in Laie, Oʻahu` : "Fetching Laie, Oʻahu weather…"}><WeatherIcon size={13} />{weather ? `${weather.tempF}°F` : "—"} {weatherLabel}</span>
        <span className="header-status-chip" title="Tables occupied in this venue right now"><Gauge size={13} />{occupiedCount}/{visibleTables.length} tables</span>
        <span className="header-status-chip" title="Guests currently seated in this venue"><Users size={13} />{guestCount} guests</span>
        <TableSearchBox tables={visibleTables} onLocateTable={onLocateTable} />
      </div>

      <nav className="workspace-venue-nav" aria-label="Authorized venues">
        <Building2 size={17} />
        {visibleRestaurants.map((restaurant) => (
          <div className={`venue-nav-item ${activeRid === restaurant.id ? "active" : ""}`} key={restaurant.id}>
            <button type="button" onClick={() => onVenueChange(restaurant.id)} className={activeRid === restaurant.id ? "active" : ""}>
              <span>{restaurant.name}</span>
              <small>{layoutConfig[restaurant.id].canvasWidth}×{layoutConfig[restaurant.id].canvasHeight}</small>
            </button>
            {canCreateVenue && (
              <>
                <button type="button" className="venue-nav-icon-button" onClick={() => onRenameVenue?.(restaurant.id, restaurant.name)} title={`Rename ${restaurant.name}`} aria-label={`Rename ${restaurant.name}`}>
                  <Pencil size={12} />
                </button>
                <button type="button" className="venue-nav-icon-button" onClick={() => onDuplicateVenue?.(restaurant.id)} title={`Duplicate ${restaurant.name} into a new venue`} aria-label={`Duplicate ${restaurant.name}`}>
                  <Copy size={12} />
                </button>
              </>
            )}
          </div>
        ))}
        {canCreateVenue && (
          <button type="button" className="venue-create-button" onClick={onCreateVenue} title="Create a new venue canvas">
            <Plus size={17} />
            <span>Venue</span>
          </button>
        )}
      </nav>
    </header>
  );
}
