import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { authValue, renderRoutes } from '@/test/auth';
import { LoginPage } from './LoginPage';

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/dashboard', element: <h1>Dashboard</h1> },
  { path: '/reviews', element: <h1>Weak Box</h1> },
];

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('Email'), 'owner@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('signs in with the entered credentials and continues to the dashboard', async () => {
    const auth = authValue();
    renderRoutes(routes, '/login', auth);

    await fillAndSubmit();

    expect(auth.signIn).toHaveBeenCalledWith('owner@example.com', 'correct horse battery');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('returns to the page that required sign-in', async () => {
    const auth = authValue();
    const router = renderRoutes(routes, '/login', auth);
    await router.navigate('/login', { state: { from: { pathname: '/reviews' } } });

    await fillAndSubmit();

    expect(await screen.findByRole('heading', { name: 'Weak Box' })).toBeInTheDocument();
  });

  it('shows the error and stays on the page when sign-in fails', async () => {
    const auth = authValue({
      signIn: vi.fn().mockResolvedValue({ error: 'Invalid login credentials' }),
    });
    renderRoutes(routes, '/login', auth);

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});
