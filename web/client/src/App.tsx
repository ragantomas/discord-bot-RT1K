import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ConfirmDialog, SkeletonCard, ToastStack } from '@/components/ui/Feedback';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { DashboardProvider } from '@/context/DashboardContext';
import { ToastProvider } from '@/context/ToastContext';
import { AccessDeniedView, LoadingSplash, LoginView } from '@/features/auth/AuthViews';

const OverviewPage = lazy(() =>
  import('@/features/overview/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const PlayersPage = lazy(() =>
  import('@/features/players/PlayersPage').then((m) => ({ default: m.PlayersPage })),
);
const AnnouncementsPage = lazy(() =>
  import('@/features/bot/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })),
);
const ActivityLogPage = lazy(() =>
  import('@/features/bot/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })),
);
const TempVoicePage = lazy(() =>
  import('@/features/bot/TempVoicePage').then((m) => ({ default: m.TempVoicePage })),
);
const PatchBotPage = lazy(() =>
  import('@/features/cs2/PatchBotPage').then((m) => ({ default: m.PatchBotPage })),
);
const JoinRolesPage = lazy(() =>
  import('@/features/bot/JoinRolesPage').then((m) => ({ default: m.JoinRolesPage })),
);
const CsStatusPage = lazy(() =>
  import('@/features/cs2/CsStatusPage').then((m) => ({ default: m.CsStatusPage })),
);
const RankFeedPage = lazy(() =>
  import('@/features/cs2/RankFeedPage').then((m) => ({ default: m.RankFeedPage })),
);
const AdminLogPage = lazy(() =>
  import('@/features/bot/AdminLogPage').then((m) => ({ default: m.AdminLogPage })),
);
const WelcomePage = lazy(() =>
  import('@/features/bot/WelcomePage').then((m) => ({ default: m.WelcomePage })),
);
const TicketsPage = lazy(() =>
  import('@/features/bot/TicketsPage').then((m) => ({ default: m.TicketsPage })),
);
const ModerationPage = lazy(() =>
  import('@/features/moderation/ModerationPage').then((m) => ({ default: m.ModerationPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/bot/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function DashboardRoutes() {
  return (
    <DashboardProvider>
      <DashboardLayout>
        <Suspense fallback={<SkeletonCard rows={6} />}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/members" element={<PlayersPage />} />
            <Route path="/players" element={<Navigate to="/members" replace />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/logs" element={<ActivityLogPage />} />
            <Route path="/tempvoice" element={<TempVoicePage />} />
            <Route path="/patchbot" element={<PatchBotPage />} />
            <Route path="/joinroles" element={<JoinRolesPage />} />
            <Route path="/csstatus" element={<CsStatusPage />} />
            <Route path="/rankfeed" element={<RankFeedPage />} />
            <Route path="/adminlog" element={<AdminLogPage />} />
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/moderation" element={<ModerationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </DashboardLayout>
    </DashboardProvider>
  );
}

function AppGate() {
  const { auth, loading } = useAuth();

  if (loading) return <LoadingSplash />;
  if (!auth?.authenticated) return <LoginView />;
  if (!auth.authorized) return <AccessDeniedView />;

  return <DashboardRoutes />;
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <AppGate />
            <ToastStack />
            <ConfirmDialog />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
