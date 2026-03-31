import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  Package,
  BarChart3, 
  Settings, 
  LogOut,
  PlusCircle,
  Bell,
  Search,
  Menu,
  X,
  Shield,
  Sun,
  Moon,
  Sparkles
} from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { auth, signOut } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { usePricing } from './PricingContext';
import { useTheme } from './ThemeContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SidebarItem = ({ to, icon: Icon, label, active }: { to: string, icon: any, label: string, active: boolean }) => (
  <Link
    to={to}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
      active 
        ? "bg-orange-500 text-white shadow-lg shadow-orange-500/25 scale-[1.02]" 
        : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]/5 hover:text-[var(--text-primary)]"
    )}
  >
    <Icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", active ? "text-white" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]")} />
    <span className="font-bold text-sm tracking-tight">{label}</span>
  </Link>
);

const BottomNavItem = ({ to, icon: Icon, label, active }: { to: string, icon: any, label: string, active: boolean }) => (
  <Link
    to={to}
    className={cn(
      "flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-all duration-300",
      active ? "text-orange-500" : "text-[var(--text-secondary)]"
    )}
  >
    <div className={cn(
      "p-1.5 rounded-xl transition-all duration-300",
      active ? "bg-orange-500/10 scale-110" : "bg-transparent"
    )}>
      <Icon className="w-5 h-5" />
    </div>
    <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
  </Link>
);

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useFirebase();
  const { openPricing } = usePricing();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdmin = profile?.email === "mshijacknew@gmail.com" || profile?.role === 'admin';
  const isSuperAdmin = profile?.email === "mshijacknew@gmail.com";

  const navItems = isSuperAdmin 
    ? [{ to: '/admin', icon: Shield, label: 'Admin Panel' }]
    : [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/invoices', icon: FileText, label: 'Invoices' },
        { to: '/customers', icon: Users, label: 'Customers' },
        { to: '/items', icon: Package, label: 'Items' },
        { to: '/reports', icon: BarChart3, label: 'Reports' },
        { to: '/settings', icon: Settings, label: 'Settings' },
      ];

  if (isAdmin && !isSuperAdmin) {
    navItems.push({ to: '/admin', icon: Shield, label: 'Admin Panel' });
  }

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      window.location.reload();
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex transition-colors duration-300 overflow-x-hidden safe-left safe-right">
      {/* Pull to refresh indicator */}
      <AnimatePresence>
        {isRefreshing && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] bg-orange-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold"
          >
            <Sparkles className="w-4 h-4 animate-spin" />
            Refreshing...
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 safe-top safe-bottom">
        <div className="flex items-center gap-3 mb-10 px-2 group cursor-pointer">
          <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-orange-500/20 group-hover:rotate-12 transition-transform">B</div>
          <span className="text-xl font-bold tracking-tighter">Bill<span className="text-orange-500">AI</span></span>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <SidebarItem 
              key={item.to} 
              {...item} 
              active={location.pathname === item.to} 
            />
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-[var(--border-color)]">
          {profile?.plan === 'free' && !isSuperAdmin && (
            <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/5 p-4 rounded-2xl border border-orange-500/20 mb-6">
              <p className="text-sm font-semibold text-orange-500 mb-1">Upgrade to PRO</p>
              <p className="text-xs text-gray-400 mb-3">Get unlimited invoices & GST reports.</p>
              <button 
                onClick={openPricing}
                className="w-full text-center py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Upgrade Now
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-[var(--bg-secondary)] z-50 p-6 lg:hidden safe-top safe-bottom"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3 group cursor-pointer">
                  <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-orange-500/20 group-hover:rotate-12 transition-transform">B</div>
                  <span className="text-xl font-bold tracking-tighter">Bill<span className="text-orange-500">AI</span></span>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-[var(--bg-primary)]/5 rounded-xl transition-colors">
                  <X className="w-6 h-6 text-[var(--text-secondary)]" />
                </button>
              </div>
              <nav className="space-y-2">
                {navItems.map((item) => (
                  <SidebarItem 
                    key={item.to} 
                    {...item} 
                    active={location.pathname === item.to} 
                  />
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[var(--border-color)] bg-[var(--bg-primary)]/80 backdrop-blur-md sticky top-0 z-30 px-4 lg:px-8 flex items-center justify-between transition-colors duration-300 safe-top">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 hover:bg-[var(--bg-secondary)] rounded-xl transition-colors active:scale-95 tappable" 
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-6 h-6 text-[var(--text-secondary)]" />
            </button>
            <button 
              className="lg:hidden p-2 hover:bg-[var(--bg-secondary)] rounded-xl transition-colors active:scale-95 tappable" 
              onClick={handleRefresh}
            >
              <Sparkles className="w-5 h-5 text-orange-500" />
            </button>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold capitalize tracking-tight">{location.pathname.split('/')[1] || 'Dashboard'}</h1>
              <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest">Welcome back, {profile?.displayName?.split(' ')[0]}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={() => navigate('/invoices')}
              className="hidden lg:flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 active:scale-95 border border-white/10 group"
            >
              <PlusCircle className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              <span>Quick Create</span>
            </button>

            <div className="relative hidden md:block group">
              <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-orange-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search anything..." 
                className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:border-orange-500/50 w-48 lg:w-64 text-[var(--text-primary)] transition-all focus:w-64 lg:focus:w-80 focus:shadow-lg focus:shadow-orange-500/5"
              />
            </div>

            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className="p-2.5 text-[var(--text-secondary)] hover:text-orange-500 transition-all rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-orange-500/30 hover:shadow-lg hover:shadow-orange-500/5 active:scale-95 tappable"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button className="relative p-2.5 text-[var(--text-secondary)] hover:text-orange-500 transition-all rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-orange-500/30 hover:shadow-lg hover:shadow-orange-500/5 active:scale-95 tappable">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-orange-500 rounded-full border-2 border-[var(--bg-secondary)]"></span>
            </button>
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 sm:gap-3 hover:bg-[var(--bg-secondary)] p-1 sm:p-1.5 sm:pr-4 rounded-full border border-transparent hover:border-[var(--border-color)] transition-all active:scale-95 group tappable"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold group-hover:text-orange-500 transition-colors">{profile?.displayName}</p>
                  <p className="text-[9px] text-orange-500 font-bold uppercase tracking-widest">{profile?.plan} Plan</p>
                </div>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center font-bold text-white border-2 border-white/20 shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
                  {profile?.displayName?.charAt(0)}
                </div>
              </button>

              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-56 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden z-50"
                  >
                    <div className="p-4 border-b border-[var(--border-color)]">
                      <p className="text-sm font-bold truncate">{profile?.displayName}</p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">{profile?.email}</p>
                    </div>
                    <div className="p-2">
                      <Link 
                        to="/settings" 
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]/5 rounded-lg transition-all"
                      >
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                      </Link>
                      <button 
                        onClick={() => signOut(auth)}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all w-full text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8 pb-24 lg:pb-8">
          {children}
        </div>

        {/* FAB for Mobile */}
        <div className="lg:hidden fixed bottom-24 right-6 z-40 safe-bottom">
          <button 
            onClick={() => setIsQuickActionOpen(true)}
            className="w-14 h-14 bg-orange-500 text-white rounded-2xl shadow-2xl shadow-orange-500/40 flex items-center justify-center active:scale-90 transition-transform border border-white/20 tappable"
          >
            <PlusCircle className="w-8 h-8" />
          </button>
        </div>

        {/* Quick Action Bottom Sheet */}
        <AnimatePresence>
          {isQuickActionOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsQuickActionOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
              />
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 bg-[var(--bg-secondary)] z-[70] p-6 pb-10 rounded-t-[2.5rem] lg:hidden border-t border-[var(--border-color)] safe-bottom"
              >
                <div className="w-12 h-1.5 bg-[var(--border-color)] rounded-full mx-auto mb-8" />
                <h3 className="text-xl font-bold mb-6 text-center">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <button 
                    onClick={() => {
                      setIsQuickActionOpen(false);
                      navigate('/invoices');
                    }}
                    className="flex flex-col items-center gap-3 p-5 sm:p-6 bg-[var(--bg-primary)]/5 rounded-3xl border border-[var(--border-color)] active:scale-95 transition-transform tappable"
                  >
                    <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-orange-500" />
                    </div>
                    <span className="text-sm font-bold">AI Invoice</span>
                  </button>
                  <button 
                    onClick={() => {
                      setIsQuickActionOpen(false);
                      navigate('/invoices');
                    }}
                    className="flex flex-col items-center gap-3 p-5 sm:p-6 bg-[var(--bg-primary)]/5 rounded-3xl border border-[var(--border-color)] active:scale-95 transition-transform tappable"
                  >
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                      <FileText className="w-6 h-6 text-blue-500" />
                    </div>
                    <span className="text-sm font-bold">Manual</span>
                  </button>
                  <button 
                    onClick={() => {
                      setIsQuickActionOpen(false);
                      navigate('/customers');
                    }}
                    className="flex flex-col items-center gap-3 p-5 sm:p-6 bg-[var(--bg-primary)]/5 rounded-3xl border border-[var(--border-color)] active:scale-95 transition-transform tappable"
                  >
                    <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center">
                      <Users className="w-6 h-6 text-green-500" />
                    </div>
                    <span className="text-sm font-bold">Customer</span>
                  </button>
                  <button 
                    onClick={() => {
                      setIsQuickActionOpen(false);
                      navigate('/items');
                    }}
                    className="flex flex-col items-center gap-3 p-5 sm:p-6 bg-[var(--bg-primary)]/5 rounded-3xl border border-[var(--border-color)] active:scale-95 transition-transform tappable"
                  >
                    <div className="w-12 h-12 bg-teal-500/10 rounded-2xl flex items-center justify-center">
                      <Package className="w-6 h-6 text-teal-500" />
                    </div>
                    <span className="text-sm font-bold">Item</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Bottom Navigation for Mobile */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 safe-bottom">
          <div className="bg-[var(--bg-secondary)]/90 backdrop-blur-xl border border-[var(--border-color)] rounded-2xl shadow-2xl flex items-center justify-around px-2 py-1">
            {navItems.slice(0, 5).map((item) => (
              <BottomNavItem 
                key={item.to} 
                {...item} 
                active={location.pathname === item.to} 
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};
