import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { startSession, type ScopeType } from '../api/practice';
import { ScopePicker } from '../components/ScopePicker';
import { SessionView } from '../components/SessionView';

const DIRECT_SCOPES: ScopeType[] = ['service', 'concept', 'domain', 'due_reviews', 'weak', 'mixed'];

export function PracticePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get('session');
  const startScope = params.get('start') as ScopeType | null;
  const startId = params.get('id');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Links such as "Practice this service" start a session directly (LIB-9).
  useEffect(() => {
    if (sessionId || !startScope || !DIRECT_SCOPES.includes(startScope) || started.current) return;
    started.current = true;
    startSession(startScope, startId ?? undefined)
      .then((session) => navigate(`/practice?session=${session.id}`, { replace: true }))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not start a session.'),
      );
  }, [sessionId, startScope, startId, navigate]);

  return (
    <>
      <PageHeader
        title="Practice"
        description="Answer open-ended questions from memory, then correct what you missed."
      />
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {sessionId ? (
        <SessionView key={sessionId} sessionId={sessionId} />
      ) : startScope && !error ? (
        <p role="status" className="text-sm text-muted-foreground">
          Starting…
        </p>
      ) : (
        <ScopePicker />
      )}
    </>
  );
}
