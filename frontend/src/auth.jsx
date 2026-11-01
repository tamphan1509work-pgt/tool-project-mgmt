import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

/**
 * Trạng thái đăng nhập: 'loading' | 'setup' (chưa có tài khoản nào) | 'anon' (chưa đăng nhập) | 'ok'
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  const check = useCallback(async () => {
    if (getToken()) {
      try {
        setState({ status: 'ok', user: await api.me() });
        return;
      } catch {
        setToken(null);
      }
    }
    try {
      const { needsSetup } = await api.authStatus();
      setState({ status: needsSetup ? 'setup' : 'anon', user: null });
    } catch {
      setState({ status: 'anon', user: null });
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // Phiên hết hạn / bị thu hồi ở bất kỳ request nào -> về màn hình đăng nhập
  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setState((s) => (s.status === 'ok' ? { status: 'anon', user: null, expired: true } : s));
    };
    window.addEventListener('pm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pm:unauthorized', onUnauthorized);
  }, []);

  const signIn = (result) => {
    setToken(result.token);
    setState({ status: 'ok', user: result.user });
  };

  const value = {
    ...state,
    login: async (email, password, remember) => signIn(await api.login({ email, password, remember })),
    setup: async (data) => signIn(await api.setup(data)),
    logout: async () => {
      try {
        await api.logout();
      } catch {
        // phiên đã hết hạn: vẫn xoá ở trình duyệt
      }
      setToken(null);
      setState({ status: 'anon', user: null });
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
