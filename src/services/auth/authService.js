import {
  browserLocalPersistence,
  browserSessionPersistence,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { onValue, ref, set, update } from "firebase/database";
import { auth, db } from "../firebase/firebase";

const REMEMBER_UNTIL_KEY = "pcc-seating-remember-until";
const REMEMBER_DAYS = 15;
const SESSION_ACTIVE_KEY = "pcc-seating-session-active";
const PASSWORD_CHANGE_COMPLETE_PREFIX = "pcc-seating-password-change-complete:";

const SUPPORTED_ROLES = [
  "developer",
  "director",
  "manager",
  "assistant_manager",
  "trainer",
  "front_lead",
  "server",
  "lead",
  "admin",
];


function passwordChangeCompletionKey(uid) {
  return `${PASSWORD_CHANGE_COMPLETE_PREFIX}${uid}`;
}

function markPasswordChangeComplete(uid) {
  if (uid) localStorage.setItem(passwordChangeCompletionKey(uid), new Date().toISOString());
}

function clearPasswordChangeComplete(uid) {
  if (uid) localStorage.removeItem(passwordChangeCompletionKey(uid));
}

function hasLocalPasswordChangeCompletion(uid) {
  return Boolean(uid && localStorage.getItem(passwordChangeCompletionKey(uid)));
}

async function syncPasswordChangeProfile(user) {
  await update(ref(db, `pccSeating/v1/users/${user.uid}`), {
    mustChangePassword: false,
    passwordChangedAt: new Date().toISOString(),
  });
  clearPasswordChangeComplete(user.uid);
}

export function getRememberedUntil() {
  const value = Number(localStorage.getItem(REMEMBER_UNTIL_KEY));
  return Number.isFinite(value) && value > Date.now() ? value : null;
}

export function clearRememberedDevice() {
  localStorage.removeItem(REMEMBER_UNTIL_KEY);
  sessionStorage.removeItem(SESSION_ACTIVE_KEY);
}

export async function signInEmployee(email, password, rememberDevice = false) {
  await setPersistence(
    auth,
    rememberDevice ? browserLocalPersistence : browserSessionPersistence
  );

  // Set the intended session state before Firebase emits onAuthStateChanged.
  // The previous implementation set this marker and immediately removed it
  // for session-only logins, which caused a successful login to sign itself out.
  sessionStorage.setItem(SESSION_ACTIVE_KEY, "true");

  if (rememberDevice) {
    localStorage.setItem(
      REMEMBER_UNTIL_KEY,
      String(Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000)
    );
  } else {
    localStorage.removeItem(REMEMBER_UNTIL_KEY);
  }

  try {
    return await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (error) {
    // Roll back markers when authentication fails.
    clearRememberedDevice();
    throw error;
  }
}

export async function signOutEmployee() {
  clearRememberedDevice();
  return signOut(auth);
}

export async function switchUser() {
  clearRememberedDevice();
  return signOut(auth);
}

export async function changeOwnPassword({ currentPassword, newPassword }) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("No authenticated account is available.");

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);

  // Firebase Authentication is the source of truth for the password change.
  // Record completion immediately so a temporary database-rule delay cannot
  // trap the employee in the required-password screen.
  markPasswordChangeComplete(user.uid);

  try {
    await syncPasswordChangeProfile(user);
  } catch (profileError) {
    // Keep the local completion marker and let the authenticated session retry
    // the profile sync in the background. Do not ask the employee to repeat a
    // password change that Firebase Authentication already accepted.
    console.warn("Password changed; profile flag sync will retry.", profileError);
  }

  await user.getIdToken(true);
  return { passwordChanged: true };
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
    mustChangePassword: profile?.mustChangePassword === true,
    passwordChangedAt: profile?.passwordChangedAt || null,
    positionLabel: profile?.positionLabel || "",
  };
}

function profileIsComplete(profile) {
  return Boolean(
    profile &&
      profile.active !== false &&
      typeof profile.displayName === "string" &&
      profile.displayName.trim() &&
      (profile.employeeId === undefined ||
        profile.employeeId === null ||
        typeof profile.employeeId === "string") &&
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
    async (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!user) {
        onSession({ status: "signed-out", user: null, profile: null });
        return;
      }

      const rememberedUntil = Number(localStorage.getItem(REMEMBER_UNTIL_KEY));
      const sessionIsActive = sessionStorage.getItem(SESSION_ACTIVE_KEY) === "true";
      if ((!rememberedUntil && !sessionIsActive) || (rememberedUntil && rememberedUntil <= Date.now())) {
        clearRememberedDevice();
        await signOut(auth);
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

          const completedLocally = hasLocalPasswordChangeCompletion(user.uid);

          if (profile.mustChangePassword === true && completedLocally) {
            // Retry clearing the server-side flag without blocking access.
            syncPasswordChangeProfile(user).catch((error) => {
              console.warn("Unable to sync password completion yet; will retry later.", error);
            });
          }

          onSession({
            status:
              profile.mustChangePassword === true && !completedLocally
                ? "password-change-required"
                : "authenticated",
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
