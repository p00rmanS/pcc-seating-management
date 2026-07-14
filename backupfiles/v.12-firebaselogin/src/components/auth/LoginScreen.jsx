import { useState } from "react";
import { Building2, Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { signInEmployee } from "../../services/auth/authService";
// Replace this image file later with your approved transparent PCC + Meʻa Hoʻokipa brand artwork.
import brandLogo from "../../assets/mea-hookipa-pcc-logo.png";

function getFriendlyAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential")) return "Incorrect email or password.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a moment and try again.";
  if (code.includes("network-request-failed")) return "Network unavailable. Check your connection.";
  return "Unable to sign in. Please try again.";
}

export default function LoginScreen({ sessionStatus }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      await signInEmployee(email, password);
    } catch (error) {
      setErrorMessage(getFriendlyAuthError(error));
      setSubmitting(false);
    }
  };

  const profileProblem = sessionStatus === "missing-profile"
    ? "This account has no PCC access profile yet. Ask an administrator to assign a role and venue."
    : sessionStatus === "inactive"
      ? "This account is inactive. Contact a Dining Services administrator."
      : "";

  return (
    <main className="brand-login-page">
      <section className="brand-login-card">
        <div className="brand-login-header">
          <div className="brand-login-icon"><Building2 size={22} /></div>
          <div><h1>PCC Seating Management</h1><p>Dining Services · Meʻa Hoʻokipa</p></div>
        </div>

        <form onSubmit={submit} className="brand-login-form">
          <div className="brand-login-notice"><ShieldCheck size={17} />Your account determines which venue and tools you can access.</div>
          <label><span>Employee email</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="employee@example.com" required /></label>
          <label>
            <span>Password</span>
            <div className="brand-password-field">
              <LockKeyhole size={16} />
              <input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
          </label>

          {(errorMessage || profileProblem) && <div className="brand-login-error">{errorMessage || profileProblem}</div>}
          <button type="submit" disabled={submitting} className="brand-login-submit"><LogIn size={17} /> {submitting ? "Signing in…" : "Sign in"}</button>
          <p className="brand-login-caption">Accounts are created and assigned by an authorized administrator.</p>
        </form>

        {/* BRAND LOGO LOCATION: replace src/assets/mea-hookipa-pcc-logo.png with the final approved logo file. */}
        <div className="brand-login-logo brand-login-logo-centered"><img src={brandLogo} alt="Meʻa Hoʻokipa and Polynesian Cultural Center" /></div>
      </section>
    </main>
  );
}
