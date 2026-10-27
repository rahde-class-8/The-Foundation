import { NavLink, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/services', label: 'Services' },
  { to: '/practice', label: 'Practice' },
  { to: '/reviews', label: 'Weak Box' },
  { to: '/content', label: 'Content' },
  { to: '/settings', label: 'Settings' },
] as const;

export function AppLayout() {
  const auth = useAuth();

  return (
    <div className="min-h-svh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold">The Foundation</span>
          <nav
            aria-label="Main"
            className="order-last w-full overflow-x-auto sm:order-none sm:w-auto"
          >
            <ul className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        isActive ? 'bg-accent font-medium' : 'text-muted-foreground',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void auth.signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
