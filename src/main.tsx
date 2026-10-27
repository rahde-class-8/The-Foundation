import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';
import { createQueryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import '@/styles/index.css';

const router = createBrowserRouter(routes);
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <AppProviders supabase={supabase} queryClient={createQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
