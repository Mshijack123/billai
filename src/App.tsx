import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import { PricingProvider } from './components/PricingContext';
import { ThemeProvider } from './components/ThemeContext';
import { DashboardLayout } from './components/DashboardLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy load pages
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const InvoicesPage = React.lazy(() => import('./pages/InvoicesPage'));
const CustomersPage = React.lazy(() => import('./pages/CustomersPage'));
const ItemsPage = React.lazy(() => import('./pages/ItemsPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const AdminPanel = React.lazy(() => import('./pages/AdminPanel'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useFirebase();
  
  if (loading) return <div className="min-h-screen bg-[#060810] flex items-center justify-center text-orange-500">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  
  // If super admin, redirect to admin panel
  if (user.email === "mshijacknew@gmail.com") return <Navigate to="/admin" />;
  
  return <DashboardLayout>{children}</DashboardLayout>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useFirebase();
  
  if (loading) return <div className="min-h-screen bg-[#060810] flex items-center justify-center text-orange-500">Loading...</div>;
  if (user) {
    if (user.email === "mshijacknew@gmail.com") return <Navigate to="/admin" />;
    return <Navigate to="/dashboard" />;
  }
  
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useFirebase();
  
  if (loading) return <div className="min-h-screen bg-[#060810] flex items-center justify-center text-orange-500">Loading...</div>;
  
  const isAdmin = user?.email === "mshijacknew@gmail.com" || profile?.role === 'admin';
  
  if (!user || !isAdmin) return <Navigate to="/dashboard" />;
  
  return <DashboardLayout>{children}</DashboardLayout>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <FirebaseProvider>
          <PricingProvider>
            <Router>
              <React.Suspense fallback={<div className="min-h-screen bg-[#060810] flex items-center justify-center text-orange-500">Loading...</div>}>
                <Routes>
                  <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
                  <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                  <Route path="/Logon" element={<Navigate to="/login" />} />
                  
                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
                  <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
                  <Route path="/items" element={<ProtectedRoute><ItemsPage /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                  
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </React.Suspense>
            </Router>
          </PricingProvider>
        </FirebaseProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
