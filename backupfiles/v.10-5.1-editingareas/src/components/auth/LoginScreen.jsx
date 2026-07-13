import { useState } from "react";
import { Building2, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { signInEmployee } from "../../services/auth/authService";

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

  const profileProblem =
    sessionStatus === "missing-profile"
      ? "This account has no PCC access profile yet. Ask an administrator to assign a role and venue."
      : sessionStatus === "inactive"
        ? "This account is inactive. Contact a Dining Services administrator."
        : "";

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-5">
      <section className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-slate-900 text-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-500 flex items-center justify-center">
              <Building2 size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold">PCC Seating Management</h1>
              <p className="text-sm text-slate-300">Authorized Dining Services access</p>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <ShieldCheck size={17} className="text-indigo-600 shrink-0" />
            Your account determines which venue and tools you can access.
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Employee email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="employee@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <div className="relative mt-1">
              <LockKeyhole size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
            </div>
          </label>

          {(errorMessage || profileProblem) && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {errorMessage || profileProblem}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-2.5 flex items-center justify-center gap-2"
          >
            <LogIn size={17} /> {submitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-xs text-center text-slate-400">
            Accounts are created and assigned by an authorized administrator.
          </p>
        </form>
      </section>
    </main>
  );
}
