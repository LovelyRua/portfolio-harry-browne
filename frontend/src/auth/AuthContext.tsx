import React, { createContext, useContext, useMemo, useState } from 'react';
import { createApiClient } from '../api/client';

type AuthContextValue = {
  token: string | null;
  accountEmail: string | null;
  cloudPassphrase: string | null;
  setToken: (t: string | null, email?: string | null, passphrase?: string | null) => void;
  api: ReturnType<typeof createApiClient>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'auth_token';
const EMAIL_KEY = 'auth_email';
const CLOUD_KEY = 'cloud_encryption_credential';

export function AuthProvider(props: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });
  const [accountEmail, setAccountEmail] = useState<string | null>(() => {
    return localStorage.getItem(EMAIL_KEY);
  });
  const [cloudPassphrase, setCloudPassphrase] = useState<string | null>(() => {
    return sessionStorage.getItem(CLOUD_KEY);
  });

  const setToken = (t: string | null, email?: string | null, passphrase?: string | null) => {
    setTokenState(t);
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      const nextPassphrase = passphrase ?? null;
      setCloudPassphrase(nextPassphrase);
      if (nextPassphrase) {
        sessionStorage.setItem(CLOUD_KEY, nextPassphrase);
      } else {
        sessionStorage.removeItem(CLOUD_KEY);
      }
      if (email) {
        setAccountEmail(email);
        localStorage.setItem(EMAIL_KEY, email);
      }
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
      setAccountEmail(null);
      setCloudPassphrase(null);
      sessionStorage.removeItem(CLOUD_KEY);
    }
  };

  const api = useMemo(() => {
    return createApiClient(() => token);
  }, [token]);

  const value = useMemo(
    () => ({ token, accountEmail, cloudPassphrase, setToken, api }),
    [token, accountEmail, cloudPassphrase, api],
  );
  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
