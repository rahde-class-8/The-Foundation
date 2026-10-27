import { screen, within } from '@testing-library/react';
import { authValue, fakeSession, renderRoutes } from '@/test/auth';
import { routes } from './routes';

describe('route guard', () => {
  it('redirects an unauthenticated visitor to /login (AUTH-1a)', async () => {
    const router = renderRoutes(routes, '/dashboard', authValue());

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows a status message while the session is loading', async () => {
    renderRoutes(routes, '/dashboard', authValue({ status: 'loading', session: null }));

    expect(await screen.findByRole('status')).toHaveTextContent('Checking your session');
  });

  it('sends an authenticated visitor from / to the dashboard', async () => {
    const router = renderRoutes(
      routes,
      '/',
      authValue({ status: 'authenticated', session: fakeSession }),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it.each([
    ['/services', 'Service library'],
    ['/services/lambda', 'Service mastery profile'],
    ['/practice', 'Practice'],
    ['/reviews', 'Weak Box'],
    ['/content', 'Content'],
    ['/settings', 'Settings'],
    ['/nope', 'Page not found'],
  ])('renders %s', async (path, heading) => {
    renderRoutes(routes, path, authValue({ status: 'authenticated', session: fakeSession }));

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('shows the shared learning-core version in settings (ADR-0002)', async () => {
    renderRoutes(routes, '/settings', authValue({ status: 'authenticated', session: fakeSession }));

    expect(await screen.findByText(/Learning core v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });

  it('marks the current section in the main navigation', async () => {
    renderRoutes(routes, '/reviews', authValue({ status: 'authenticated', session: fakeSession }));

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Weak Box' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getAllByRole('link')).toHaveLength(6);
  });
});
