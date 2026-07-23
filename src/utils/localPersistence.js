const LEGACY_STORAGE_KEY = "pcc-seating-management-local-v1";
const STORAGE_PREFIX = "pcc-seating-management-user-v2";
const STORAGE_VERSION = 3;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}:${userId || "anonymous"}`;
}

function normalizeSnapshot(parsed) {
  if (!isObject(parsed)) return null;

  return {
    version: Number(parsed.version) || STORAGE_VERSION,
    activeRid: typeof parsed.activeRid === "string" ? parsed.activeRid : null,
    currentRole: ["server", "lead", "admin", "developer", "director", "manager", "assistant_manager", "front_lead", "trainer"].includes(parsed.currentRole)
      ? parsed.currentRole
      : "server",
    restaurants: Array.isArray(parsed.restaurants) ? parsed.restaurants : [],
    layoutConfigByR: isObject(parsed.layoutConfigByR) ? parsed.layoutConfigByR : {},
    tablesByR: isObject(parsed.tablesByR) ? parsed.tablesByR : {},
    serversByR: isObject(parsed.serversByR) ? parsed.serversByR : {},
    groupsByR: isObject(parsed.groupsByR) ? parsed.groupsByR : {},
    areasByR: isObject(parsed.areasByR) ? parsed.areasByR : {},
    venueOperationsByR: isObject(parsed.venueOperationsByR) ? parsed.venueOperationsByR : {},
    canvasSettingsByR: isObject(parsed.canvasSettingsByR) ? parsed.canvasSettingsByR : {},
    viewSettingsByRestaurant: isObject(parsed.viewSettingsByRestaurant)
      ? parsed.viewSettingsByRestaurant
      : {},
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
  };
}

export function loadLocalSnapshot(userId, options = {}) {
  try {
    const userKey = getStorageKey(userId);
    const userRaw = window.localStorage.getItem(userKey);
    if (userRaw) return normalizeSnapshot(JSON.parse(userRaw));

    // One-time migration is restricted to Lead/Admin accounts. A Server account
    // must never inherit another employee's unrestricted Phase 2 browser data.
    if (!options.allowLegacyMigration) return null;
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return null;

    const migrated = normalizeSnapshot(JSON.parse(legacyRaw));
    if (migrated) {
      window.localStorage.setItem(userKey, JSON.stringify(migrated));
    }
    return migrated;
  } catch (error) {
    console.error("Unable to load the local seating backup:", error);
    return null;
  }
}

export function saveLocalSnapshot(snapshot, userId) {
  const payload = {
    version: STORAGE_VERSION,
    ...snapshot,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(payload));
  return payload.savedAt;
}

export function clearLocalSnapshot(userId) {
  window.localStorage.removeItem(getStorageKey(userId));
}

export { LEGACY_STORAGE_KEY, STORAGE_PREFIX, STORAGE_VERSION };
