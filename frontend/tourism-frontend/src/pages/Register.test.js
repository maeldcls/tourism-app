import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import Register from './Register';
import { AuthProvider } from '../context/AuthContext';

jest.mock('axios');

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
}));

function renderRegister() {
  return render(
    <AuthProvider>
      <Register />
    </AuthProvider>
  );
}

function fillAndSubmit(email = 'bob@test.com', username = 'bob', password = 'securepass') {
  userEvent.type(screen.getByLabelText('Email'), email);
  userEvent.type(screen.getByLabelText("Nom d'utilisateur"), username);
  userEvent.type(screen.getByLabelText('Mot de passe'), password);
  userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('Register — rendu', () => {
  test('affiche le titre "Inscription"', () => {
    renderRegister();
    expect(screen.getByText('Inscription')).toBeInTheDocument();
  });

  test('affiche les trois champs du formulaire', () => {
    renderRegister();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText("Nom d'utilisateur")).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
  });

  test('affiche le bouton "Créer mon compte"', () => {
    renderRegister();
    expect(screen.getByRole('button', { name: 'Créer mon compte' })).toBeInTheDocument();
  });

  test('affiche un lien vers la page de connexion', () => {
    renderRegister();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument();
  });
});

describe('Register — succès', () => {
  test('appelle POST /auth/register avec email, username et password', async () => {
    axios.post.mockResolvedValue({
      data: {
        access_token: 'tok-xyz',
        user: { id: 2, username: 'bob', email: 'bob@test.com', xp: 0, level: 1 },
      },
    });
    renderRegister();
    fillAndSubmit();

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:8000/auth/register',
        { email: 'bob@test.com', username: 'bob', password: 'securepass' }
      );
    });
  });

  test('redirige vers "/" après inscription réussie', async () => {
    axios.post.mockResolvedValue({
      data: {
        access_token: 'tok-xyz',
        user: { id: 2, username: 'bob', email: 'bob@test.com', xp: 0, level: 1 },
      },
    });
    renderRegister();
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('enregistre le token dans localStorage après inscription réussie', async () => {
    axios.post.mockResolvedValue({
      data: {
        access_token: 'tok-xyz',
        user: { id: 2, username: 'bob', email: 'bob@test.com', xp: 0, level: 1 },
      },
    });
    renderRegister();
    fillAndSubmit();

    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('tok-xyz');
    });
  });
});

describe('Register — erreurs API', () => {
  test("affiche l'erreur \"Email déjà utilisé\"", async () => {
    axios.post.mockRejectedValue({
      response: { data: { detail: 'Email déjà utilisé' } },
    });
    renderRegister();
    fillAndSubmit('dup@test.com', 'newuser');

    await waitFor(() => {
      expect(screen.getByText('Email déjà utilisé')).toBeInTheDocument();
    });
  });

  test("affiche l'erreur \"Username déjà utilisé\"", async () => {
    axios.post.mockRejectedValue({
      response: { data: { detail: 'Username déjà utilisé' } },
    });
    renderRegister();
    fillAndSubmit('new@test.com', 'takenuser');

    await waitFor(() => {
      expect(screen.getByText('Username déjà utilisé')).toBeInTheDocument();
    });
  });

  test("affiche un message générique si l'API ne renvoie pas de détail", async () => {
    axios.post.mockRejectedValue({});
    renderRegister();
    fillAndSubmit('x@test.com', 'user', 'pass');

    await waitFor(() => {
      expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
    });
  });

  test("ne redirige pas en cas d'erreur", async () => {
    axios.post.mockRejectedValue({ response: { data: { detail: 'Erreur' } } });
    renderRegister();
    fillAndSubmit('x@test.com', 'user', 'pass');

    await waitFor(() => {
      expect(screen.getByText('Erreur')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Register — état de chargement', () => {
  test('désactive le bouton et affiche "Création…" pendant le chargement', async () => {
    axios.post.mockReturnValue(new Promise(() => {}));
    renderRegister();
    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Création…' })).toBeDisabled();
    });
  });
});
