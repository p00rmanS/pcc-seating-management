import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { onValue, ref } from "firebase/database";
import { auth, db } from "../firebase/firebase";

export async function signInEmployee(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function signOutEmployee() {
  return signOut(auth);
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
            onSession({ status: "inactive", user, profile });
            return;
          }

          onSession({
            status: "authenticated",
            user,
            profile: {
              displayName: profile.displayName || user.email || "Employee",
              email: profile.email || user.email || "",
              role: ["server", "lead", "admin"].includes(profile.role)
                ? profile.role
                : "server",
              venueIds:
                profile.venueIds && typeof profile.venueIds === "object"
                  ? profile.venueIds
                  : {},
              active: profile.active !== false,
            },
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
