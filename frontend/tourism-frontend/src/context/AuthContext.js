import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));

  function login(userData, accessToken) {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem('auth_user', JSON.stringify(userData));
    localStorage.setItem('auth_token', accessToken);
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
