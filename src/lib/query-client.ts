import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      // Learning-state writes are server-authoritative; never retry mutations blindly.
      mutations: { retry: 0 },
    },
  });
}
