import { createContext, useContext, useEffect, useState } from 'react';
import { registerUnauthorizedHandler } from '../services/api';

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

  // Déloguement global déclenché par apiFetch dès qu'un appel API renvoie 401
  // (token expiré ou invalide), peu importe quel composant a fait l'appel.
  // Les pages protégées redirigent déjà vers /login dès que `user` devient null
  // (`if (!user) return <Navigate to="/login" />`), donc pas besoin de naviguer
  // explicitement ici.
  useEffect(() => {
    registerUnauthorizedHandler(logout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateUser(patch) {
    setUser(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('auth_user', JSON.stringify(next));
      return next;
    });
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
