import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Composant utilitaire pour lire le contexte dans les tests
function AuthConsumer() {
  const { user, token, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.username : 'null'}</span>
      <span data-testid="token">{token ?? 'null'}</span>
      <button onClick={() => login({ username: 'alice', email: 'alice@test.com' }, 'tok-123')}>
        login
      </button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderAuthConsumer() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('AuthContext', () => {
  test('état initial vide quand localStorage est vide', () => {
    renderAuthConsumer();
    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(screen.getByTestId('token')).toHaveTextContent('null');
  });

  test('login() met à jour user et token dans le state', async () => {
    renderAuthConsumer();
    await act(async () => {
      screen.getByRole('button', { name: 'login' }).click();
    });
    expect(screen.getByTestId('user')).toHaveTextContent('alice');
    expect(screen.getByTestId('token')).toHaveTextContent('tok-123');
  });

  test('login() sauvegarde user et token dans localStorage', async () => {
    renderAuthConsumer();
    await act(async () => {
      screen.getByRole('button', { name: 'login' }).click();
    });
    expect(localStorage.getItem('auth_token')).toBe('tok-123');
    expect(JSON.parse(localStorage.getItem('auth_user'))).toMatchObject({ username: 'alice' });
  });

  test('logout() remet le state à null', async () => {
    renderAuthConsumer();
    await act(async () => {
      screen.getByRole('button', { name: 'login' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'logout' }).click();
    });
    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(screen.getByTestId('token')).toHaveTextContent('null');
  });

  test('logout() supprime user et token du localStorage', async () => {
    renderAuthConsumer();
    await act(async () => {
      screen.getByRole('button', { name: 'login' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'logout' }).click();
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  test('état initial chargé depuis localStorage', () => {
    localStorage.setItem('auth_token', 'existing-token');
    localStorage.setItem('auth_user', JSON.stringify({ username: 'bob', email: 'bob@test.com' }));
    renderAuthConsumer();
    expect(screen.getByTestId('user')).toHaveTextContent('bob');
    expect(screen.getByTestId('token')).toHaveTextContent('existing-token');
  });

  test('localStorage corrompu ne plante pas le contexte', () => {
    localStorage.setItem('auth_user', 'pas du json valide{{{');
    expect(() => renderAuthConsumer()).not.toThrow();
    expect(screen.getByTestId('user')).toHaveTextContent('null');
  });
});
