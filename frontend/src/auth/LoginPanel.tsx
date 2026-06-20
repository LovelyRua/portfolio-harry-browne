import React, { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils';
import { createApiClient } from '../api/client';

type ApiClient = ReturnType<typeof createApiClient>;

export function LoginPanel(props: {
  mode: 'login' | 'register';
  onModeChange: (m: 'login' | 'register') => void;
  onSuccessToken: (token: string, email: string, password: string) => void;
  onClose: () => void;
  api: ApiClient;
  theme: 'modern' | 'wabi-sabi';
  isOpen: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorMsg(null);

    try {
      if (props.mode === 'register') {
        await props.api.auth.register({ email, password });
        props.onModeChange('login');
        setPassword('');
        setErrorMsg('Account created. Sign in to sync this portfolio.');
      } else {
        const response = await props.api.auth.login({ email, password });
        props.onSuccessToken(response.accessToken, email, password);
        setPassword('');
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
      <section
        className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Optional sync</p>
            <h2 id="auth-dialog-title" className="mt-1 text-xl font-semibold">
              {props.mode === 'login' ? 'Sign in' : 'Create account'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Your login password also unlocks cloud backups in this browser, so there is no second password to enter.
            </p>
          </div>
          <button className="icon-button" onClick={props.onClose} aria-label="Close" type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errorMsg && !errorMsg.startsWith('Account'))}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={props.mode === 'login' ? 'current-password' : 'new-password'}
              minLength={10}
              aria-invalid={Boolean(errorMsg && !errorMsg.startsWith('Account'))}
              required
            />
            {props.mode === 'register' && (
              <small className="field-hint">Use 10+ characters with uppercase, lowercase, and a number.</small>
            )}
          </label>
          {errorMsg && (
            <div role="status" className={cn('rounded-lg px-3 py-2 text-sm', errorMsg.startsWith('Account') ? 'bg-[var(--good-soft)] text-[var(--good)]' : 'bg-[var(--warn-soft)] text-[var(--warn)]')}>
              {errorMsg}
            </div>
          )}

          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? 'Working...' : props.mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-strong)]"
          onClick={() => {
            props.onModeChange(props.mode === 'login' ? 'register' : 'login');
            setErrorMsg(null);
            setPassword('');
          }}
        >
          {props.mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </section>
    </div>
  );
}
