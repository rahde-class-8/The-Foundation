import type { Session } from '@supabase/supabase-js';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { AuthContext, type AuthContextValue } from '@/lib/auth/auth-context';

export const fakeSession = { access_token: 'token', user: { id: 'owner' } } as unknown as Session;

export function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'unauthenticated',
    session: null,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as AuthContextValue;
}

export function renderRoutes(routes: RouteObject[], path: string, auth: AuthContextValue) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return router;
}
