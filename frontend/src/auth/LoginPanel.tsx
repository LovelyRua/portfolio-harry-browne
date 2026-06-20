import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../utils';
import { ApiError, createApiClient } from '../api/client';

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
  const { t } = useTranslation();
  const [step, setStep] = useState<'credentials' | 'verify'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);

  useEffect(() => {
    if (!props.isOpen) {
      setStep('credentials');
      setCode('');
      setMessage(null);
    }
  }, [props.isOpen]);

  function errorText(error: unknown) {
    if (error instanceof ApiError && error.code) {
      const key = `error_${error.code}`;
      const translated = t(key);
      if (translated !== key) return translated;
    }
    return error instanceof Error ? error.message : t('request_failed');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (step === 'verify') {
        await props.api.auth.verifyEmail({ email, code });
        props.onModeChange('login');
        setStep('credentials');
        setCode('');
        setPassword('');
        setMessage({ text: t('email_verified'), good: true });
      } else if (props.mode === 'register') {
        await props.api.auth.register({ email, password });
        setStep('verify');
        setMessage({ text: t('verification_sent', { email }), good: true });
      } else {
        const response = await props.api.auth.login({ email, password });
        props.onSuccessToken(response.accessToken, email, password);
        setPassword('');
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') setStep('verify');
      setMessage({ text: errorText(error), good: false });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      await props.api.auth.resendVerification({ email });
      setMessage({ text: t('code_resent'), good: true });
    } catch (error) {
      setMessage({ text: errorText(error), good: false });
    } finally {
      setBusy(false);
    }
  }

  if (!props.isOpen) return null;
  const title = step === 'verify' ? t('verify_email') : props.mode === 'login' ? t('sign_in') : t('create_account');

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{t('optional_sync')}</p>
            <h2 id="auth-dialog-title" className="mt-1 text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {step === 'verify' ? t('verification_sent', { email }) : t('auth_description')}
            </p>
          </div>
          <button className="icon-button" onClick={props.onClose} aria-label={t('close')} type="button"><X className="h-4 w-4" /></button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {step === 'credentials' ? (
            <>
              <label className="field">
                <span>{t('email')}</span>
                <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <label className="field">
                <span>{t('password')}</span>
                <input className="input" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={props.mode === 'login' ? 'current-password' : 'new-password'} minLength={10} required />
                {props.mode === 'register' && <small className="field-hint">{t('password_hint')}</small>}
              </label>
            </>
          ) : (
            <label className="field">
              <span>{t('verification_code')}</span>
              <input className="input text-center text-xl tracking-[0.35em]" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required autoFocus />
            </label>
          )}

          {message && <div role="status" className={cn('rounded-lg px-3 py-2 text-sm', message.good ? 'bg-[var(--good-soft)] text-[var(--good)]' : 'bg-[var(--warn-soft)] text-[var(--warn)]')}>{message.text}</div>}
          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? t('working') : step === 'verify' ? t('verify') : props.mode === 'login' ? t('sign_in') : t('create_account')}
          </button>
        </form>

        {step === 'verify' ? (
          <button type="button" className="mt-4 w-full text-sm font-semibold text-[var(--accent)]" onClick={() => void resend()} disabled={busy}>{t('resend_code')}</button>
        ) : (
          <button type="button" className="mt-4 w-full text-sm font-semibold text-[var(--accent)]" onClick={() => {
            props.onModeChange(props.mode === 'login' ? 'register' : 'login');
            setMessage(null);
            setPassword('');
          }}>{props.mode === 'login' ? t('need_account') : t('have_account')}</button>
        )}
      </section>
    </div>
  );
}
