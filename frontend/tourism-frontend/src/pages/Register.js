import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';
import '../css/Auth.css';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/register`, form);
      login(data.user, data.access_token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setError('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/google`, {
        token: credentialResponse.credential,
      });
      login(data.user, data.access_token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur de connexion Google');
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Inscription</h1>
        <p className="auth-subtitle">Rejoins la Carte Touristique</p>

        <div className="auth-google">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Connexion Google annulée')}
            width="100%"
            text="signup_with"
            shape="rectangular"
            logo_alignment="left"
          />
        </div>

        <div className="auth-divider"><span>ou</span></div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="votre@email.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="username">Nom d'utilisateur</label>
            <input
              id="username"
              name="username"
              type="text"
              value={form.username}
              onChange={handleChange}
              placeholder="explorateur42"
              required
              autoComplete="username"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>

        <p className="auth-footer">
          Déjà un compte ?{' '}
          <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
