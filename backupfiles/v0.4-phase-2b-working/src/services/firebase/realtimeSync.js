import {
  onValue,
  push,
  ref,
  serverTimestamp,
  set,
} from "firebase/database";
import { db } from "./firebase";

const ROOT_PATH = "pccSeating/v1";
const CLIENT_ID_KEY = "pcc-seating-client-id";

export function getClientId() {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const id = `client_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export function subscribeToCloudVenues(onData, onError) {
  const venuesRef = ref(db, `${ROOT_PATH}/venues`);
  return onValue(
    venuesRef,
    (snapshot) => onData(snapshot.val() || null),
    onError
  );
}

export function subscribeToConnectionState(onChange) {
  const connectedRef = ref(db, ".info/connected");
  return onValue(connectedRef, (snapshot) => onChange(snapshot.val() === true));
}

export async function saveVenueToCloud(venueId, venueData, metadata = {}) {
  const venueRef = ref(db, `${ROOT_PATH}/venues/${venueId}`);
  await set(venueRef, {
    ...venueData,
    updatedAt: serverTimestamp(),
    updatedByClientId: metadata.clientId || null,
    updatedByRole: metadata.role || null,
  });
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
    changedByClientId: event.clientId || null,
    changedByRole: event.role || null,
  });
}
