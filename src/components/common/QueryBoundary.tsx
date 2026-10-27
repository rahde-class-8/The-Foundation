import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type QueryBoundaryProps<T> = {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingLabel?: string;
};

/** Renders the four standard query states consistently (SYSTEM_ARCHITECTURE §7). */
export function QueryBoundary<T>({
  query,
  children,
  isEmpty,
  empty = <p className="text-sm text-muted-foreground">Nothing here yet.</p>,
  loadingLabel = 'Loading…',
}: QueryBoundaryProps<T>) {
  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {loadingLabel}
      </p>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 p-4"
      >
        <p className="text-sm">Something went wrong while loading this. {query.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isEmpty?.(query.data)) {
    return <>{empty}</>;
  }

  return <>{children(query.data)}</>;
}
