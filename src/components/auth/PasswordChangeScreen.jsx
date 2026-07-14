import { useMemo, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { changeOwnPassword, signOutEmployee } from "../../services/auth/authService";
import brandLogo from "../../assets/mea-hookipa-pcc-logo.png";

function passwordChecks(value) {
  return {
    length: value.length >= 12,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  };
}

export default function PasswordChangeScreen({ profile, required = false, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const checks = useMemo(() => passwordChecks(newPassword), [newPassword]);
  const strong = Object.values(checks).every(Boolean);
  const matches = newPassword && newPassword === confirmPassword;

  const submit = async (event) => {
    event.preventDefault();
    if (!strong || !matches || !currentPassword) return;
    setSaving(true);
    setError("");
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (!required) setTimeout(() => onClose?.(), 900);
    } catch (changeError) {
      const code = changeError?.code || "";
      setError(
        code.includes("invalid-credential") || code.includes("wrong-password")
          ? "Your current password is incorrect."
          : code.includes("weak-password")
            ? "Choose a stronger password."
            : code.includes("requires-recent-login")
              ? "Please sign out, sign in again, and retry."
              : code === "pcc/profile-update-failed"
                ? changeError.message
                : code.includes("permission-denied")
                  ? "Firebase blocked the profile update. Publish the v13.2 database rules, then retry using your new password."
                  : "Unable to change the password. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={required ? "brand-login-page" : "security-modal-page"}>
      <section className={required ? "brand-login-card security-password-card" : "security-modal-card security-password-card"}>
        <div className="brand-login-header">
          <div className="brand-login-icon"><KeyRound size={22} /></div>
          <div>
            <h1>{required ? "Create Your Private Password" : "Change Password"}</h1>
            <p>{profile?.displayName || "PCC Seating account"}</p>
          </div>
        </div>

        <form onSubmit={submit} className="brand-login-form security-password-form">
          <div className="brand-login-notice">
            <ShieldCheck size={17} />
            {required
              ? "Change the temporary password before opening the seating system."
              : "Enter your current password, then choose a new private password."}
          </div>

          {[{ label: "Current password", value: currentPassword, setter: setCurrentPassword, auto: "current-password" },
            { label: "New password", value: newPassword, setter: setNewPassword, auto: "new-password" },
            { label: "Confirm new password", value: confirmPassword, setter: setConfirmPassword, auto: "new-password" }].map((field) => (
            <label key={field.label}>
              <span>{field.label}</span>
              <div className="brand-password-field">
                <KeyRound size={16} />
                <input type={showPasswords ? "text" : "password"} autoComplete={field.auto} value={field.value} onChange={(event) => field.setter(event.target.value)} required />
                <button type="button" onClick={() => setShowPasswords((value) => !value)} aria-label={showPasswords ? "Hide passwords" : "Show passwords"}>
                  {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
          ))}

          <div className="password-requirements">
            <Requirement ok={checks.length}>12 or more characters</Requirement>
            <Requirement ok={checks.upper}>Uppercase letter</Requirement>
            <Requirement ok={checks.lower}>Lowercase letter</Requirement>
            <Requirement ok={checks.number}>Number</Requirement>
            <Requirement ok={checks.symbol}>Symbol</Requirement>
            <Requirement ok={matches}>Passwords match</Requirement>
          </div>

          {error && <div className="brand-login-error">{error}</div>}
          {success && <div className="security-success"><Check size={16} /> Password updated successfully.</div>}

          <button type="submit" disabled={saving || !strong || !matches || !currentPassword} className="brand-login-submit">
            <KeyRound size={17} /> {saving ? "Updating password…" : "Save new password"}
          </button>

          {required ? (
            <button type="button" onClick={signOutEmployee} className="security-secondary-button"><LogOut size={16} /> Sign out</button>
          ) : (
            <button type="button" onClick={onClose} className="security-secondary-button">Cancel</button>
          )}
        </form>

        {required && <div className="brand-login-logo brand-login-logo-centered"><img src={brandLogo} alt="Meʻa Hoʻokipa and Polynesian Cultural Center" /></div>}
      </section>
    </main>
  );
}

function Requirement({ ok, children }) {
  return <span className={ok ? "ok" : ""}><Check size={13} /> {children}</span>;
}
