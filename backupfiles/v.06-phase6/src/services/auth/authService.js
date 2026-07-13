import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { onValue, ref, set } from "firebase/database";
import { auth, db } from "../firebase/firebase";

const SUPPORTED_ROLES = [
  "developer",
  "director",
  "manager",
  "assistant_manager",
  "trainer",
  "front_lead",
  "server",
  // Backward-compatible Phase 3 roles.
  "lead",
  "admin",
];

export async function signInEmployee(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function signOutEmployee() {
  return signOut(auth);
}

export async function saveOwnAccessProfile({
  uid,
  email,
  displayName,
  employeeId,
  role,
  active,
  venueIds,
}) {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("The authenticated account does not match this profile.");
  }

  const safeVenueIds = Object.fromEntries(
    ["ohana", "aloha", "gateway"]
      .filter((venueId) => venueIds?.[venueId] === true)
      .map((venueId) => [venueId, true])
  );

  return set(ref(db, `pccSeating/v1/users/${uid}`), {
    active: active !== false,
    displayName: displayName.trim(),
    email: email || auth.currentUser.email || "",
    employeeId: String(employeeId).trim(),
    role: SUPPORTED_ROLES.includes(role) ? role : "server",
    venueIds: safeVenueIds,
    updatedAt: new Date().toISOString(),
  });
}

function normalizeProfile(profile, user) {
  return {
    displayName: profile?.displayName || user.email || "Employee",
    email: profile?.email || user.email || "",
    employeeId: profile?.employeeId || "",
    role: SUPPORTED_ROLES.includes(profile?.role) ? profile.role : "server",
    venueIds:
      profile?.venueIds && typeof profile.venueIds === "object"
        ? profile.venueIds
        : {},
    active: profile?.active !== false,
  };
}

function profileIsComplete(profile) {
  return Boolean(
    profile &&
      profile.active !== false &&
      typeof profile.displayName === "string" &&
      profile.displayName.trim() &&
      typeof profile.employeeId === "string" &&
      profile.employeeId.trim() &&
      SUPPORTED_ROLES.includes(profile.role) &&
      profile.venueIds &&
      typeof profile.venueIds === "object" &&
      Object.values(profile.venueIds).some((value) => value === true)
  );
}

export function subscribeToAuthSession(onSession, onError) {
  let unsubscribeProfile = null;

  const unsubscribeAuth = onAuthStateChanged(
    auth,
    (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!user) {
        onSession({ status: "signed-out", user: null, profile: null });
        return;
      }

      onSession({ status: "loading-profile", user, profile: null });
      const profileRef = ref(db, `pccSeating/v1/users/${user.uid}`);
      unsubscribeProfile = onValue(
        profileRef,
        (snapshot) => {
          const profile = snapshot.val();
          if (!profile) {
            onSession({ status: "missing-profile", user, profile: null });
            return;
          }

          if (profile.active === false) {
            onSession({ status: "inactive", user, profile: normalizeProfile(profile, user) });
            return;
          }

          if (!profileIsComplete(profile)) {
            onSession({
              status: "incomplete-profile",
              user,
              profile: normalizeProfile(profile, user),
            });
            return;
          }

          onSession({
            status: "authenticated",
            user,
            profile: normalizeProfile(profile, user),
          });
        },
        onError
      );
    },
    onError
  );

  return () => {
    unsubscribeProfile?.();
    unsubscribeAuth();
  };
}
