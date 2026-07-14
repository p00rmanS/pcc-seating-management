import { useMemo, useState } from "react";
import {
  Building2,
  Check,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { saveOwnAccessProfile, signOutEmployee } from "../../services/auth/authService";
import brandLogo from "../../assets/mea-hookipa-pcc-logo.png";

const VENUES = [
  { id: "ohana", label: "Hale ʻOhana" },
  { id: "aloha", label: "Hale Aloha" },
  { id: "gateway", label: "Gateway" },
];

const ROLES = [
  { id: "developer", label: "Developer" },
  { id: "director", label: "Director" },
  { id: "manager", label: "Manager" },
  { id: "assistant_manager", label: "Assistant Manager" },
  { id: "trainer", label: "Trainer" },
  { id: "front_lead", label: "Front Lead" },
  { id: "server", label: "Server" },
];

const DEVELOPER_BOOTSTRAP_EMAILS = new Set([
  "james.lead@pccseating.dev",
]);

export default function ProfileSetupScreen({ authSession }) {
  const existing = authSession.profile || {};
  const signedInEmail = (authSession.user?.email || existing.email || "").toLowerCase();
  const canRepairProfile =
    DEVELOPER_BOOTSTRAP_EMAILS.has(signedInEmail) ||
    ["developer", "admin"].includes(existing.role);

  const [displayName, setDisplayName] = useState(existing.displayName || "James Dean");
  const [employeeId, setEmployeeId] = useState(existing.employeeId || "");
  const [role, setRole] = useState(existing.role || "developer");
  const [active, setActive] = useState(existing.active !== false);
  const [venueIds, setVenueIds] = useState(() => ({
    ohana: existing.venueIds?.ohana ?? true,
    aloha: existing.venueIds?.aloha ?? true,
    gateway: existing.venueIds?.gateway ?? true,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedVenueCount = useMemo(
    () => Object.values(venueIds).filter(Boolean).length,
    [venueIds]
  );

  const submit = async (event) => {
    event.preventDefault();
    if (!displayName.trim() || selectedVenueCount === 0 || !canRepairProfile) return;

    setSaving(true);
    setError("");
    try {
      await saveOwnAccessProfile({
        uid: authSession.user.uid,
        email: authSession.user.email || existing.email || "",
        displayName: displayName.trim(),
        employeeId: employeeId.trim(),
        role,
        active,
        venueIds,
      });
    } catch (saveError) {
      console.error("Unable to save access profile:", saveError);
      setError(
        saveError?.code === "PERMISSION_DENIED"
          ? "Firebase blocked this update. Confirm the developer bootstrap rule is still active."
          : "Unable to save the profile. Check Firebase and try again."
      );
      setSaving(false);
    }
  };

  if (!canRepairProfile) {
    return (
      <main className="brand-login-page">
        <section className="brand-login-card brand-profile-card">
          <div className="brand-login-header">
            <div className="brand-login-icon"><ShieldAlert size={22} /></div>
            <div>
              <h1>Access Profile Needs Review</h1>
              <p>Dining Services · Meʻa Hoʻokipa</p>
            </div>
          </div>

          <div className="brand-profile-review">
            <div className="brand-login-notice">
              <ShieldCheck size={17} />
              Your account exists, but its role or venue assignment is incomplete. An authorized administrator must update it.
            </div>
            <div className="brand-profile-review-details">
              <strong>{existing.displayName || authSession.user?.email || "Employee"}</strong>
              <span>{authSession.user?.email || ""}</span>
            </div>
            <button type="button" onClick={signOutEmployee} className="brand-login-submit">
              <LogOut size={17} /> Sign out
            </button>
          </div>

          <div className="brand-login-logo brand-login-logo-centered">
            <img src={brandLogo} alt="Meʻa Hoʻokipa and Polynesian Cultural Center" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="brand-login-page">
      <section className="brand-login-card brand-profile-card">
        <div className="brand-login-header">
          <div className="brand-login-icon"><UserCog size={22} /></div>
          <div>
            <h1>Complete Developer Access</h1>
            <p>Dining Services · Meʻa Hoʻokipa</p>
          </div>
        </div>

        <form onSubmit={submit} className="brand-profile-form">
          <div className="brand-login-notice">
            <ShieldCheck size={17} />
            This secure repair screen is available only to the authorized developer account.
          </div>

          <div className="brand-profile-grid">
            <label>
              <span>Display name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </label>

            <label>
              <span>UKG employee ID <small>(optional)</small></span>
              <input
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                placeholder="Leave blank if unavailable"
              />
            </label>

            <label>
              <span>Position</span>
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                {ROLES.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="brand-profile-checkbox">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              <span>Account is active</span>
            </label>
          </div>

          <fieldset className="brand-profile-venues">
            <legend><Building2 size={16} /> Assigned venues</legend>
            <div>
              {VENUES.map((venue) => (
                <label key={venue.id} className={venueIds[venue.id] ? "selected" : ""}>
                  <input
                    type="checkbox"
                    checked={Boolean(venueIds[venue.id])}
                    onChange={(event) =>
                      setVenueIds((previous) => ({ ...previous, [venue.id]: event.target.checked }))
                    }
                  />
                  <span>{venue.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <div className="brand-login-error">{error}</div>}

          <div className="brand-profile-actions">
            <button type="submit" disabled={saving || selectedVenueCount === 0} className="brand-login-submit">
              <Check size={17} /> {saving ? "Saving profile…" : "Save and open seating"}
            </button>
            <button type="button" onClick={signOutEmployee} className="brand-profile-signout">
              Sign out
            </button>
          </div>
        </form>

        <div className="brand-login-logo brand-login-logo-centered">
          <img src={brandLogo} alt="Meʻa Hoʻokipa and Polynesian Cultural Center" />
        </div>
      </section>
    </main>
  );
}
