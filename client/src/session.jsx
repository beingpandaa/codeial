import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { api, setCsrfToken } from './api';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: () => api('/auth/session'), staleTime: 60000 });
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('codeial-theme') || 'light');
  const user = session.data?.user || null;
  useEffect(() => {
    if (session.data?.csrfToken) setCsrfToken(session.data.csrfToken);
  }, [session.data]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('codeial-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!user) return undefined;
    const socket = io({ withCredentials: true });
    const refresh = () => client.invalidateQueries({ queryKey: ['notifications'] });
    socket.on('notification', refresh);
    socket.on('connect', refresh);
    return () => socket.disconnect();
  }, [user?.id, client]);

  async function authenticate(path, body) {
    const result = await api(path, { method: 'POST', body });
    client.clear();
    if (result?.csrfToken) setCsrfToken(result.csrfToken);
    client.setQueryData(['session'], await api('/auth/session'));
    return result;
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setCsrfToken('');
    client.clear();
    client.setQueryData(['session'], await api('/auth/session'));
  }
  return (
    <SessionContext.Provider
      value={{
        user,
        features: session.data?.features || {},
        loading: session.isLoading,
        error: session.error,
        authenticate,
        logout,
        toast,
        notify: (message) => setToast({ message, key: Date.now() }),
        dismissToast: () => setToast(null),
        theme,
        toggleTheme: () => setTheme((value) => (value === 'light' ? 'dark' : 'light')),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
