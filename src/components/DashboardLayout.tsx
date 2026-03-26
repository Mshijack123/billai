import React from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  X
} from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { auth, signOut } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SidebarItem = ({ to, icon: Icon, label, active }: { to: string, icon: any, label: string, active: boolean }) => (
  <Link
    to={to}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-orange-500/10 text-orange-500 border-l-4 border-orange-500" 
        : "text-gray-400 hover:bg-white/5 hover:text-white"
    )}
  >
    <Icon className={cn("w-5 h-5", active ? "text-orange-500" : "text-gray-400 group-hover:text-white")} />
    <span className="font-medium">{label}</span>
  </Link>
);

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useFirebase();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/invoices', icon: FileText, label: 'Invoices' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/items', icon: Package, label: 'Items' },
    { to: '/reports', icon: BarChart3, label: 'Reports' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-[#060810] text-white flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-white/5 bg-[#0C1020] p-6">
        <div className="flex items-center gap-2 mb-10 px-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center font-bold text-white">B</div>
          <span className="text-xl font-bold tracking-tight">Bill<span className="text-orange-500">AI</span></span>
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

        <div className="mt-auto pt-6 border-t border-white/5">
          {profile?.plan === 'free' && (
            <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/5 p-4 rounded-2xl border border-orange-500/20 mb-6">
              <p className="text-sm font-semibold text-orange-500 mb-1">Upgrade to PRO</p>
              <p className="text-xs text-gray-400 mb-3">Get unlimited invoices & GST reports.</p>
              <Link to="/settings" className="block text-center py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors">
                Upgrade Now
              </Link>
            </div>
          )}
          
          <button 
            onClick={() => signOut(auth)}
            className="flex items-center gap-3 px-4 py-3 w-full text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
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
              className="fixed top-0 left-0 bottom-0 w-72 bg-[#0C1020] z-50 p-6 lg:hidden"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center font-bold text-white">B</div>
                  <span className="text-xl font-bold tracking-tight">Bill<span className="text-orange-500">AI</span></span>
                </div>
                <button onClick={() => setIsSidebarOpen(false)}>
                  <X className="w-6 h-6 text-gray-400" />
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
        <header className="h-16 border-bottom border-white/5 bg-[#060810]/80 backdrop-blur-md sticky top-0 z-30 px-4 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="lg:hidden" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-6 h-6 text-gray-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold capitalize">{location.pathname.split('/')[1] || 'Dashboard'}</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Welcome back, {profile?.displayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-orange-500/50 w-64"
              />
            </div>
            <button className="relative p-2 text-gray-400 hover:text-white transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full border-2 border-[#060810]"></span>
            </button>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{profile?.displayName}</p>
                <p className="text-[10px] text-orange-500 font-bold uppercase tracking-wider">{profile?.plan} Plan</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center font-bold text-white border-2 border-white/10">
                {profile?.displayName?.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
