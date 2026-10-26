import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppLoading } from '@/components/layout/AppLoading'
import { AppShell } from '@/components/layout/AppShell'
import { RouteError } from '@/components/layout/RouteError'

/** Every page is code-split; 3D code is further split per lab inside LabHost. */
const page = (load: () => Promise<{ default: React.ComponentType }>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
})

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    // Rendered while the first page's lazy route module loads (also silences React Router's missing-HydrateFallback warning).
    HydrateFallback: AppLoading,
    children: [
      { index: true, ...page(() => import('@/pages/HomePage')) },
      { path: 'explore', ...page(() => import('@/pages/ExplorePage')) },
      { path: 'labs', ...page(() => import('@/pages/LabsPage')) },
      { path: 'labs/:labId', ...page(() => import('@/pages/LabPage')) },
      { path: 'learn', ...page(() => import('@/pages/TopicIndexPage')) },
      { path: 'learn/:categorySlug', ...page(() => import('@/pages/CategoryPage')) },
      { path: 'topics/:slug', ...page(() => import('@/pages/TopicPage')) },
      { path: 'map', ...page(() => import('@/pages/SystemMapPage')) },
      { path: 'certificate/:courseId', ...page(() => import('@/pages/CertificatePage')) },
      { path: 'pioneers', ...page(() => import('@/pages/PioneersPage')) },
      { path: 'progress', ...page(() => import('@/pages/ProgressPage')) },
      { path: 'about', ...page(() => import('@/pages/AboutPage')) },
      { path: '*', ...page(() => import('@/pages/NotFoundPage')) },
    ],
  },
]

export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
