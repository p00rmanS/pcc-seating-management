const STORAGE_KEY = "pcc-seating-management-local-v1";
const STORAGE_VERSION = 1;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function loadLocalSnapshot() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) return null;

    return {
      version: Number(parsed.version) || STORAGE_VERSION,
      activeRid: typeof parsed.activeRid === "string" ? parsed.activeRid : null,
      currentRole: parsed.currentRole === "server" ? "server" : "lead",
      tablesByR: isObject(parsed.tablesByR) ? parsed.tablesByR : {},
      serversByR: isObject(parsed.serversByR) ? parsed.serversByR : {},
      groupsByR: isObject(parsed.groupsByR) ? parsed.groupsByR : {},
      areasByR: isObject(parsed.areasByR) ? parsed.areasByR : {},
      viewSettingsByRestaurant: isObject(parsed.viewSettingsByRestaurant)
        ? parsed.viewSettingsByRestaurant
        : {},
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
    };
  } catch (error) {
    console.error("Unable to load the local seating backup:", error);
    return null;
  }
}

export function saveLocalSnapshot(snapshot) {
  const payload = {
    version: STORAGE_VERSION,
    ...snapshot,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return payload.savedAt;
}

export function clearLocalSnapshot() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY, STORAGE_VERSION };
