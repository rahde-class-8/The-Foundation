import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';

function toState(session: Session | null): AuthState {
  return session
    ? { status: 'authenticated', session }
    : { status: 'unauthenticated', session: null };
}

export function AuthProvider({
  client,
  children,
}: {
  client: SupabaseClient;
  children: ReactNode;
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null });

  useEffect(() => {
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) setState(toState(data.session));
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setState(toState(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: async (email, password) => {
        const { error } = await client.auth.signInWithPassword({ email, password });
        return { error: error ? error.message : null };
      },
      signOut: async () => {
        await client.auth.signOut();
      },
    }),
    [client, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
