import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import { DashboardLayout } from './components/DashboardLayout';

// Lazy load pages
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const InvoicesPage = React.lazy(() => import('./pages/InvoicesPage'));
const CustomersPage = React.lazy(() => import('./pages/CustomersPage'));
const ItemsPage = React.lazy(() => import('./pages/ItemsPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useFirebase();
  
  if (loading) return <div className="min-h-screen bg-[#060810] flex items-center justify-center text-orange-500">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  
  return <DashboardLayout>{children}</DashboardLayout>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useFirebase();
  
  if (loading) return <div className="min-h-screen bg-[#060810] flex items-center justify-center text-orange-500">Loading...</div>;
  if (user) return <Navigate to="/dashboard" />;
  
  return <>{children}</>;
};

export default function App() {
  return (
    <FirebaseProvider>
      <Router>
        <React.Suspense fallback={<div className="min-h-screen bg-[#060810] flex items-center justify-center text-orange-500">Loading...</div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
            <Route path="/items" element={<ProtectedRoute><ItemsPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </React.Suspense>
      </Router>
    </FirebaseProvider>
  );
}
