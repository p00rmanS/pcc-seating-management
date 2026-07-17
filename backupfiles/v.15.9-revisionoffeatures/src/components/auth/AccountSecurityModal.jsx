import { CalendarClock, KeyRound, LogOut, RefreshCcw, ShieldCheck, X } from "lucide-react";
import PasswordChangeScreen from "./PasswordChangeScreen";
import { getRememberedUntil, signOutEmployee, switchUser } from "../../services/auth/authService";

export default function AccountSecurityModal({ profile, onClose, showPasswordForm, onShowPasswordForm }) {
  const rememberedUntil = getRememberedUntil();

  if (showPasswordForm) {
    return (
      <div className="security-modal-backdrop" role="dialog" aria-modal="true">
        <PasswordChangeScreen profile={profile} onClose={() => onShowPasswordForm(false)} />
      </div>
    );
  }

  return (
    <div className="security-modal-backdrop" role="dialog" aria-modal="true" aria-label="Account and security">
      <section className="security-modal-card account-security-card">
        <div className="account-security-heading">
          <div><ShieldCheck size={22} /><span><strong>Account & Security</strong><small>{profile.displayName}</small></span></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <dl className="account-security-details">
          <div><dt>Role</dt><dd>{profile.positionLabel || profile.role}</dd></div>
          <div><dt>Email</dt><dd>{profile.email}</dd></div>
          <div><dt>Session</dt><dd>{rememberedUntil ? `Trusted until ${new Date(rememberedUntil).toLocaleDateString()}` : "Browser session only"}</dd></div>
        </dl>

        <div className="account-security-actions">
          <button type="button" onClick={() => onShowPasswordForm(true)}><KeyRound size={17} /><span><strong>Change password</strong><small>Update your private account password</small></span></button>
          <button type="button" onClick={switchUser}><RefreshCcw size={17} /><span><strong>Switch user</strong><small>Return to login for another employee</small></span></button>
          <button type="button" onClick={signOutEmployee}><LogOut size={17} /><span><strong>Sign out</strong><small>End this session on the device</small></span></button>
        </div>

        <div className="account-security-note"><CalendarClock size={16} /> Never select “remember this device” on a shared or public computer.</div>
      </section>
    </div>
  );
}
