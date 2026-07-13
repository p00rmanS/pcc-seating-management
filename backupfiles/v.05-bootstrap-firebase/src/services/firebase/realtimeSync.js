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
  return Object.values(value).filter(Boolean);
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
          tables: collectionToArray(value.tables),
          servers: collectionToArray(value.servers),
          groups: collectionToArray(value.groups),
          areas: collectionToArray(value.areas),
          metadata: value.metadata || null,
        };
        onData({ ...current });
      },
      onError
    );
  });

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
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
    set(ref(db, `${venuePath}/metadata`), {
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
    changedByClientId: event.clientId || null,
    changedByRole: event.role || null,
  });
}
