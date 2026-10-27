import { screen, within } from '@testing-library/react';
import facets from '@/features/services/test/facets-response.json';
import profile from '@/features/services/test/profile-response.json';
import search from '@/features/services/test/search-response.json';
import { authValue, fakeSession, renderRoutes } from '@/test/auth';
import { routes } from './routes';

vi.mock('@/features/services/api/catalog', async () => {
  const { FacetsSchema, SearchPageSchema, ServiceProfileSchema } =
    await import('@/features/services/api/schemas');
  return {
    PAGE_SIZE: 24,
    searchCatalog: vi.fn().mockResolvedValue(SearchPageSchema.parse(search)),
    getCatalogFacets: vi.fn().mockResolvedValue(FacetsSchema.parse(facets)),
    getServiceProfile: vi.fn().mockResolvedValue(ServiceProfileSchema.parse(profile)),
    markConceptExposed: vi.fn().mockResolvedValue(undefined),
  };
});

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
    ['/services/lambda', 'AWS Lambda'],
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
