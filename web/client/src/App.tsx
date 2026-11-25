import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ConfirmDialog, ToastStack } from '@/components/ui/Feedback';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { DashboardProvider } from '@/context/DashboardContext';
import { ToastProvider } from '@/context/ToastContext';
import { AccessDeniedView, LoadingSplash, LoginView } from '@/features/auth/AuthViews';
import { ActivityLogPage } from '@/features/bot/ActivityLogPage';
import { AdminLogPage } from '@/features/bot/AdminLogPage';
import { AnnouncementsPage } from '@/features/bot/AnnouncementsPage';
import { JoinRolesPage } from '@/features/bot/JoinRolesPage';
import { SettingsPage } from '@/features/bot/SettingsPage';
import { TempVoicePage } from '@/features/bot/TempVoicePage';
import { TicketsPage } from '@/features/bot/TicketsPage';
import { WelcomePage } from '@/features/bot/WelcomePage';
import { CsStatusPage } from '@/features/cs2/CsStatusPage';
import { PatchBotPage } from '@/features/cs2/PatchBotPage';
import { RankFeedPage } from '@/features/cs2/RankFeedPage';
import { ModerationPage } from '@/features/moderation/ModerationPage';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { PlayersPage } from '@/features/players/PlayersPage';

function DashboardRoutes() {
  return (
    <DashboardProvider>
      <DashboardLayout>
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
