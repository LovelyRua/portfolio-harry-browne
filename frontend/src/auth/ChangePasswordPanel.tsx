import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { cn } from '../utils';

export function ChangePasswordPanel(props: {
  isOpen: boolean;
  onClose: () => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!props.isOpen) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('passwords_mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await props.onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      props.onClose();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code) {
        const key = `error_${cause.code}`;
        const translated = t(key);
        setError(translated === key ? cause.message : translated);
      } else {
        setError(cause instanceof Error ? cause.message : t('request_failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="change-password-title" className="text-xl font-semibold">{t('change_password')}</h2>
          <button className="icon-button" onClick={props.onClose} aria-label={t('close')} type="button"><X className="h-4 w-4" /></button>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <PasswordField label={t('current_password')} value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
          <PasswordField label={t('new_password')} value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
          <PasswordField label={t('confirm_password')} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          <small className="field-hint">{t('password_hint')}</small>
          {error && <div role="alert" className={cn('rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]')}>{error}</div>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={props.onClose}>{t('cancel')}</button>
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? t('working') : t('save')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordField(props: { label: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input className="input" type="password" value={props.value} onChange={(event) => props.onChange(event.target.value)} autoComplete={props.autoComplete} minLength={10} required />
    </label>
  );
}
