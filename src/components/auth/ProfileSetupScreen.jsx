import { useMemo, useState } from "react";
import { Building2, Check, ShieldCheck, UserCog } from "lucide-react";
import { saveOwnAccessProfile, signOutEmployee } from "../../services/auth/authService";

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

export default function ProfileSetupScreen({ authSession }) {
  const existing = authSession.profile || {};
  const [displayName, setDisplayName] = useState(existing.displayName || "James Dean");
  const [employeeId, setEmployeeId] = useState(existing.employeeId || "2080342");
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
    if (!displayName.trim() || !employeeId.trim() || selectedVenueCount === 0) return;

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
          ? "Firebase blocked this update. Publish the included development rules, then try again."
          : "Unable to save the profile. Check Firebase and try again."
      );
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAF6EE] flex items-center justify-center p-5">
      <section className="w-full max-w-2xl bg-white border border-amber-100 rounded-2xl shadow-xl overflow-hidden">
        <header className="bg-slate-900 text-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-500 flex items-center justify-center">
              <UserCog size={23} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Complete Developer Access</h1>
              <p className="text-sm text-slate-300">Repair or create your Firebase access profile.</p>
            </div>
          </div>
        </header>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="flex items-start gap-2 text-sm text-slate-600 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
            <ShieldCheck size={18} className="text-indigo-600 shrink-0 mt-0.5" />
            This setup is only for the authenticated development account. It writes the correctly named fields under your own Firebase UID.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-400 outline-none"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">UKG employee ID</span>
              <input
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-400 outline-none"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Position</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-indigo-400 outline-none"
              >
                {ROLES.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 mt-6 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
                className="w-4 h-4"
              />
              Account is active
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Building2 size={16} /> Assigned venues
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
              {VENUES.map((venue) => (
                <label
                  key={venue.id}
                  className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer ${
                    venueIds[venue.id] ? "border-indigo-400 bg-indigo-50" : "border-slate-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(venueIds[venue.id])}
                    onChange={(event) =>
                      setVenueIds((previous) => ({ ...previous, [venue.id]: event.target.checked }))
                    }
                  />
                  <span className="text-sm font-medium text-slate-700">{venue.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={saving || selectedVenueCount === 0}
              className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-2.5 flex items-center justify-center gap-2"
            >
              <Check size={17} /> {saving ? "Saving profile…" : "Save and open seating"}
            </button>
            <button
              type="button"
              onClick={signOutEmployee}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600"
            >
              Sign out
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
