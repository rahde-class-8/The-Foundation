import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/AuthProvider';

export function AppProviders({
  supabase,
  queryClient,
  children,
}: {
  supabase: SupabaseClient;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={supabase}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
