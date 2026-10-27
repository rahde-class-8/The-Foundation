import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/lib/auth/auth-context';

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Checking your session…
      </p>
    );
  }

  if (auth.status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
