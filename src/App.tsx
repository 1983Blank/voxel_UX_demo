import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Skeleton from '@mui/material/Skeleton';
import Box from '@mui/material/Box';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, CommandPalette } from '@/components';
import { AppLayout, AuthLayout, VibeLayout } from '@/layouts';
import {
  Login,
  AuthCallback,
  Settings,
  Screens,
  Components,
  DesignSystem,
  VibePrototyping,
  VisualBuilder,
  Context,
  Insights,
  Collaborate,
  SharedView,
  Share,
  Home,
  Prototypes,
  Integrations,
} from '@/pages';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';

// Load storage diagnostics for console debugging (window.storageDiagnostics)
import '@/services/storageDiagnostics';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { initialize, isLoading } = useAuthStore();
  const { config } = useThemeStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    // Use theme colors for loading skeleton to match the app's default theme
    const sidebarBg = config.colors.bgDark;
    const skeletonBg = 'rgba(255, 255, 255, 0.08)';
    const contentBg = config.colors.bgPrimary;

    return (
      <ThemeProvider theme={config.muiTheme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', height: '100vh' }}>
          {/* Sidebar skeleton */}
          <Box sx={{ width: 220, bgcolor: sidebarBg, p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
              <Skeleton variant="rounded" width={32} height={32} sx={{ bgcolor: skeletonBg }} />
              <Skeleton variant="text" width={80} height={24} sx={{ bgcolor: skeletonBg }} />
            </Box>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton
                key={i}
                variant="rounded"
                width="100%"
                height={36}
                sx={{ mb: 1, bgcolor: skeletonBg }}
              />
            ))}
          </Box>
          {/* Main content skeleton */}
          <Box sx={{ flex: 1, p: 3, bgcolor: contentBg }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
              <Skeleton variant="text" width={200} height={40} />
              <Skeleton variant="rounded" width={36} height={36} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="rounded" width="25%" height={80} />
              ))}
            </Box>
            <Skeleton variant="rounded" width="100%" height={300} />
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={config.muiTheme}>
        <CssBaseline />
        <SnackbarProvider>
          <BrowserRouter>
            <CommandPalette />
            <Routes>
              {/* Auth routes */}
              <Route
                element={
                  <PublicRoute>
                    <AuthLayout />
                  </PublicRoute>
                }
              >
                <Route path="/login" element={<Login />} />
              </Route>

              {/* Protected routes with AppLayout */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                {/* Home */}
                <Route path="/" element={<Home />} />

                {/* Prototypes list */}
                <Route path="/prototypes" element={<Prototypes />} />

                {/* Repository */}
                <Route path="/repository/screens" element={<Screens />} />
                <Route path="/repository/components" element={<Components />} />
                <Route path="/repository/design-system" element={<DesignSystem />} />

                {/* Product Context */}
                <Route path="/context" element={<Context />} />

                {/* Insights (renamed from Analytics) */}
                <Route path="/insights" element={<Insights />} />
                <Route path="/insights/:projectId" element={<Insights />} />
                <Route path="/insights/:projectId/:variantId" element={<Insights />} />

                {/* Integrations */}
                <Route path="/integrations" element={<Integrations />} />

                {/* Settings (includes User Management for admins) */}
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Vibe Concepting with VibeLayout */}
              <Route
                element={
                  <ProtectedRoute>
                    <VibeLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/prototypes/:screenId" element={<VibePrototyping />} />
                <Route path="/prototypes/:screenId/:sessionId" element={<VibePrototyping />} />
              </Route>

              {/* Visual Builder (full-screen) */}
              <Route
                path="/visual-builder"
                element={
                  <ProtectedRoute>
                    <VisualBuilder />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/visual-builder/:projectId"
                element={
                  <ProtectedRoute>
                    <VisualBuilder />
                  </ProtectedRoute>
                }
              />

              {/* Collaborative view (full-screen) */}
              <Route
                path="/collaborate/:shareLink"
                element={
                  <ProtectedRoute>
                    <Collaborate />
                  </ProtectedRoute>
                }
              />

              {/* Public shared view */}
              <Route path="/view/:shareLink" element={<SharedView />} />

              {/* Public share view (new sharing system) */}
              <Route path="/share/:token" element={<Share />} />

              {/* Auth callback for OAuth */}
              <Route path="/auth/callback" element={<AuthCallback />} />

              {/* Legacy routes redirect */}
              <Route path="/screens" element={<Navigate to="/repository/screens" replace />} />
              <Route path="/components" element={<Navigate to="/repository/components" replace />} />
              <Route path="/analytics" element={<Navigate to="/insights" replace />} />
              <Route path="/admin" element={<Navigate to="/settings" replace />} />

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
