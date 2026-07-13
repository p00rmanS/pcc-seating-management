import {
  onValue,
  push,
  ref,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { db } from "./firebase";

const ROOT_PATH = "pccSeating/v1";
const CLIENT_ID_KEY = "pcc-seating-client-id";

function collectionToArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .map(([id, item]) => (item && typeof item === "object" ? { id: item.id || id, ...item } : null))
    .filter(Boolean);
}

function arrayToCollection(items) {
  return Object.fromEntries(
    (Array.isArray(items) ? items : [])
      .filter((item) => item?.id)
      .map((item) => [item.id, item])
  );
}

export function getClientId() {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const id = `client_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export function subscribeToAuthorizedVenues(venueIds, onData, onError) {
  const current = {};
  const unsubscribers = venueIds.map((venueId) => {
    const venueRef = ref(db, `${ROOT_PATH}/venues/${venueId}`);
    return onValue(
      venueRef,
      (snapshot) => {
        const value = snapshot.val() || {};
        current[venueId] = {
          exists: snapshot.exists(),
          tables: collectionToArray(value.tables),
          servers: collectionToArray(value.servers),
          groups: collectionToArray(value.groups),
          areas: collectionToArray(value.areas),
          operations: value.operations || null,
          metadata: value.metadata || null,
          canvas: value.canvas || null,
        };
        onData({ ...current });
      },
      onError
    );
  });

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export function subscribeToActivity(venueIds, onData, onError) {
  return onValue(
    ref(db, `${ROOT_PATH}/activity`),
    (snapshot) => {
      const rows = collectionToArray(snapshot.val())
        .filter((event) => venueIds.includes(event.venueId))
        .sort((a, b) => String(b.changedAtClient || "").localeCompare(String(a.changedAtClient || "")))
        .slice(0, 150);
      onData(rows);
    },
    onError
  );
}

export function subscribeToConnectionState(onChange) {
  const connectedRef = ref(db, ".info/connected");
  return onValue(connectedRef, (snapshot) => onChange(snapshot.val() === true));
}

export async function saveVenueToCloud(venueId, venueData, metadata = {}) {
  const venuePath = `${ROOT_PATH}/venues/${venueId}`;
  await Promise.all([
    set(ref(db, `${venuePath}/tables`), arrayToCollection(venueData.tables)),
    set(ref(db, `${venuePath}/servers`), arrayToCollection(venueData.servers)),
    set(ref(db, `${venuePath}/groups`), arrayToCollection(venueData.groups)),
    set(ref(db, `${venuePath}/areas`), arrayToCollection(venueData.areas)),
    set(ref(db, `${venuePath}/canvas`), {
      width: Number(venueData.canvas?.width) || 0,
      height: Number(venueData.canvas?.height) || 0,
    }),
    set(ref(db, `${venuePath}/operations`), {
      expectedGuests: Number(venueData.operations?.expectedGuests) || 0,
      scannedGuests: Number(venueData.operations?.scannedGuests) || 0,
      venueCapacity: Number(venueData.operations?.venueCapacity) || 0,
      updatedAt: serverTimestamp(),
      updatedByUid: metadata.uid || null,
    }),
    set(ref(db, `${venuePath}/metadata`), {
      initialized: true,
      schemaVersion: 2,
      updatedAt: serverTimestamp(),
      updatedByUid: metadata.uid || null,
      updatedByClientId: metadata.clientId || null,
      updatedByRole: metadata.role || null,
    }),
  ]);
}

export async function saveOperationalTableUpdate(venueId, tableId, patch, metadata = {}) {
  const allowed = {};
  if (Object.prototype.hasOwnProperty.call(patch, "status")) allowed.status = patch.status;
  if (Object.prototype.hasOwnProperty.call(patch, "guestName")) allowed.guestName = patch.guestName;
  if (Object.prototype.hasOwnProperty.call(patch, "partySize")) allowed.partySize = patch.partySize;
  if (Object.prototype.hasOwnProperty.call(patch, "statusUpdatedAt")) {
    allowed.statusUpdatedAt = patch.statusUpdatedAt;
  }

  allowed.operationalUpdatedAt = serverTimestamp();
  allowed.operationalUpdatedByUid = metadata.uid || null;
  await update(ref(db, `${ROOT_PATH}/venues/${venueId}/tables/${tableId}`), allowed);
}

export async function logStatusChange(event) {
  const activityRef = push(ref(db, `${ROOT_PATH}/activity`));
  await set(activityRef, {
    venueId: event.venueId,
    entityType: event.entityType,
    entityId: event.entityId,
    label: event.label,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    changedAt: serverTimestamp(),
    changedAtClient: new Date().toISOString(),
    changedByUid: event.uid || null,
    changedByName: event.changedByName || null,
    changedByClientId: event.clientId || null,
    changedByRole: event.role || null,
  });
}

export function subscribeToEmployees(onData, onError) {
  return onValue(
    ref(db, `${ROOT_PATH}/employees`),
    (snapshot) => onData(snapshot.val() || {}),
    onError
  );
}

export function subscribeToVenueStaffing(venueId, date, onData, onError) {
  if (!venueId || !date) return () => {};
  return onValue(
    ref(db, `${ROOT_PATH}/venues/${venueId}/staffing/${date}`),
    (snapshot) => onData(snapshot.val() || {}),
    onError
  );
}

export async function saveVenueStaffing(venueId, date, assignments, metadata = {}) {
  await set(ref(db, `${ROOT_PATH}/venues/${venueId}/staffing/${date}`), {
    assignments: assignments || {},
    updatedAt: serverTimestamp(),
    updatedByUid: metadata.uid || null,
    updatedByName: metadata.name || null,
  });
}
