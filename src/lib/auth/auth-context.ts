import type { Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export type AuthState =
  | { status: 'loading'; session: null }
  | { status: 'unauthenticated'; session: null }
  | { status: 'authenticated'; session: Session };

export type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return value;
}
