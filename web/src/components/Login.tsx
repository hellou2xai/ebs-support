import { useState } from "react";
import { login } from "../api";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await login(u, p);
    setBusy(false);
    if (r.ok) { localStorage.setItem("alice-auth", "1"); onLogin(); }
    else setErr(r.error || "Invalid credentials");
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo">◆</span>
          <div>
            <div className="brand-title">Alice AMS Assist</div>
            <div className="brand-sub">Vertiv · Oracle EBS Application Management</div>
          </div>
        </div>
        <h3>Sign in</h3>
        <label className="login-field">
          <span>Username</span>
          <input value={u} onChange={e => setU(e.target.value)} placeholder="admin" autoFocus />
        </label>
        <label className="login-field">
          <span>Password</span>
          <input type="password" value={p} onChange={e => setP(e.target.value)} placeholder="admin" />
        </label>
        {err && <div className="login-err">{err}</div>}
        <button className="btn primary login-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="login-hint">Demo credentials: <code>admin</code> / <code>admin</code></div>
      </form>
    </div>
  );
}
