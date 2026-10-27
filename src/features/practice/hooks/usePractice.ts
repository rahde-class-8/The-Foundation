import { useQuery } from '@tanstack/react-query';
import { getSettings } from '@/features/settings';
import { getCandidates, getScopes, getSessionState } from '../api/practice';

export const practiceKeys = {
  scopes: ['practice', 'scopes'] as const,
  session: (id: string) => ['practice', 'session', id] as const,
  candidates: (id: string) => ['practice', 'candidates', id] as const,
};

export const useScopes = () => useQuery({ queryKey: practiceKeys.scopes, queryFn: getScopes });
export const useSessionState = (id: string) =>
  useQuery({ queryKey: practiceKeys.session(id), queryFn: () => getSessionState(id) });
export const useCandidates = (id: string) =>
  useQuery({ queryKey: practiceKeys.candidates(id), queryFn: () => getCandidates(id) });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: getSettings });
