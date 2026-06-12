import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import { GoogleOAuthProvider } from '@react-oauth/google';

import Login from './Login';
import { AuthProvider } from '../context/AuthContext';

jest.mock('axios');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
}));

function renderLogin() {
  return render(
    <GoogleOAuthProvider clientId="test-client-id">
      <AuthProvider>
        <Login />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

function fillAndSubmit(email = 'alice@test.com', password = 'pass1234') {
  userEvent.type(screen.getByLabelText('Email'), email);
  userEvent.type(screen.getByLabelText('Mot de passe'), password);
  userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('Login — rendu', () => {
  test('affiche le titre "Connexion"', () => {
    renderLogin();
    expect(screen.getByText('Connexion')).toBeInTheDocument();
  });

  test('affiche les champs email et mot de passe', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
  });

  test('affiche le bouton "Se connecter"', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });

  test('affiche un lien vers la page inscription', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: "S'inscrire" })).toBeInTheDocument();
  });
});

describe('Login — succès', () => {
  test('appelle POST /auth/login avec email et mot de passe', async () => {
    axios.post.mockResolvedValue({
      data: { access_token: 'tok-abc', user: { id: 1, username: 'alice', email: 'alice@test.com', xp: 0, level: 1 } },
    });
    renderLogin();
    fillAndSubmit();

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:8000/auth/login',
        { email: 'alice@test.com', password: 'pass1234' }
      );
    });
  });

  test('redirige vers "/" après login réussi', async () => {
    axios.post.mockResolvedValue({
      data: { access_token: 'tok-abc', user: { id: 1, username: 'alice', email: 'alice@test.com', xp: 0, level: 1 } },
    });
    renderLogin();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('enregistre le token dans localStorage après login réussi', async () => {
    axios.post.mockResolvedValue({
      data: { access_token: 'tok-abc', user: { id: 1, username: 'alice', email: 'alice@test.com', xp: 0, level: 1 } },
    });
    renderLogin();
    fillAndSubmit();

    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('tok-abc');
    });
  });
});

describe('Login — erreurs', () => {
  test("affiche le message d'erreur de l'API en cas d'échec", async () => {
    axios.post.mockRejectedValue({
      response: { data: { detail: 'Email ou mot de passe incorrect' } },
    });
    renderLogin();
    fillAndSubmit('alice@test.com', 'mauvaispass');

    await waitFor(() => {
      expect(screen.getByText('Email ou mot de passe incorrect')).toBeInTheDocument();
    });
  });

  test("affiche un message générique si l'API ne renvoie pas de détail", async () => {
    axios.post.mockRejectedValue({});
    renderLogin();
    fillAndSubmit('alice@test.com', 'pass');

    await waitFor(() => {
      expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
    });
  });

  test("ne redirige pas en cas d'erreur", async () => {
    axios.post.mockRejectedValue({ response: { data: { detail: 'Erreur' } } });
    renderLogin();
    fillAndSubmit('x@test.com', 'wrong');

    await waitFor(() => {
      expect(screen.getByText('Erreur')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Login — état de chargement', () => {
  test('désactive le bouton pendant le chargement', async () => {
    axios.post.mockReturnValue(new Promise(() => {}));
    renderLogin();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Connexion…' })).toBeDisabled();
    });
  });
});
