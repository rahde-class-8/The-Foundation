import { Navigate, type RouteObject } from 'react-router';
import { AppLayout } from '@/app/layout/AppLayout';
import { LoginPage } from '@/features/auth';
import { NotFoundPage } from './NotFoundPage';
import { RequireAuth } from './RequireAuth';

// Feature screens load on demand so each phase's code stays out of the initial bundle.
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: 'dashboard',
            lazy: async () => ({ Component: (await import('@/features/dashboard')).DashboardPage }),
          },
          {
            path: 'services',
            lazy: async () => ({ Component: (await import('@/features/services')).ServicesPage }),
          },
          {
            path: 'services/:id',
            lazy: async () => ({
              Component: (await import('@/features/services')).ServiceProfilePage,
            }),
          },
          {
            path: 'practice',
            lazy: async () => ({ Component: (await import('@/features/practice')).PracticePage }),
          },
          {
            path: 'reviews',
            lazy: async () => ({ Component: (await import('@/features/reviews')).ReviewsPage }),
          },
          {
            path: 'content',
            lazy: async () => ({ Component: (await import('@/features/content')).ContentPage }),
          },
          {
            path: 'settings',
            lazy: async () => ({ Component: (await import('@/features/settings')).SettingsPage }),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
