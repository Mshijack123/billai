import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, 
  Clock, 
  Receipt, 
  FileText, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight,
  MoreVertical,
  Download,
  Eye,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Share2
} from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { usePricing } from '../components/PricingContext';
import { db, collection, query, where, onSnapshot, getDocs, handleFirestoreError, OperationType } from '../firebase';
import { Invoice, DashboardStats } from '../types';
import { AIInvoiceModal } from '../components/AIInvoiceModal';
import { ManualInvoiceModal } from '../components/ManualInvoiceModal';
import { InvoiceDetailModal } from '../components/InvoiceDetailModal';
import { exportToCSV } from '../lib/csv-export';
import { motion, AnimatePresence } from 'motion/react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useTheme } from '../components/ThemeContext';
import { useInvoiceLimit } from '../hooks/useInvoiceLimit';

const StatCard = ({ title, value, label, trend, icon: Icon, color }: any) => (
  <motion.div 
    whileHover={{ y: -5, borderColor: 'rgba(255, 92, 26, 0.2)' }}
    className="glass p-3 sm:p-6 rounded-[1.5rem] sm:rounded-[2.5rem] border border-[var(--border-color)] transition-all relative overflow-hidden group"
  >
    <div className={cn("absolute -right-4 -top-4 w-16 h-16 sm:w-24 sm:h-24 blur-2xl sm:blur-3xl opacity-10 transition-opacity group-hover:opacity-20", color)} />
    
    <div className="flex justify-between items-start mb-2 sm:mb-6">
      <div className={cn("w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl flex items-center justify-center shadow-lg", color)}>
        <Icon className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
      </div>
      <div className={cn(
        "flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-bold", 
        trend > 0 ? "bg-green-500/10 text-green-500" : "bg-amber-500/10 text-amber-500"
      )}>
        {trend > 0 ? <ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <ArrowDownRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
        {Math.abs(trend)}%
      </div>
    </div>
    
    <div className="space-y-0.5 sm:space-y-1">
      <p className="text-[8px] sm:text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest truncate">{title}</p>
      <p className="text-lg sm:text-3xl font-display font-bold tracking-tight truncate">{value}</p>
    </div>
    
    <div className="mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-[var(--border-color)] flex items-center justify-between">
      <p className="text-[8px] sm:text-[10px] text-[var(--text-secondary)] font-medium truncate">{label}</p>
      <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
    </div>
  </motion.div>
);

const Dashboard = () => {
  const { profile } = useFirebase();
  const { openPricing } = usePricing();
  const { theme } = useTheme();
  const { invoiceCount, limit, canCreateInvoice, remaining } = useInvoiceLimit();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    pendingPayments: 0,
    gstPayable: 0,
    totalInvoices: 0
  });
  const [chartData, setChartData] = useState<any>({
    labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'],
    datasets: [
      {
        fill: true,
        label: 'Revenue',
        data: [0, 0, 0, 0, 0, 0],
        borderColor: '#FF5C1A',
        backgroundColor: 'rgba(255, 92, 26, 0.1)',
        tension: 0.4,
      },
    ],
  });

  const isProfileIncomplete = !profile?.businessName || !profile?.gstin || !profile?.address;

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'invoices'), where('businessId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setInvoices(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      
      // Calculate stats
      const revenue = docs.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
      const pending = docs.reduce((sum, inv) => sum + (inv.balanceAmount ?? (inv.status !== 'paid' ? inv.total : 0)), 0);
      const gst = docs.reduce((sum, inv) => sum + inv.cgst + inv.sgst + inv.igst, 0);
      
      setStats({
        totalRevenue: revenue,
        pendingPayments: pending,
        gstPayable: gst,
        totalInvoices: docs.length
      });

      // Calculate chart data (Last 12 Months)
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const now = new Date();
      const last12Months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        last12Months.push({
          label: months[d.getMonth()],
          year: d.getFullYear(),
          month: d.getMonth(),
          total: 0
        });
      }

      docs.forEach(inv => {
        const d = new Date(inv.date);
        const monthIndex = last12Months.findIndex(m => m.month === d.getMonth() && m.year === d.getFullYear());
        if (monthIndex !== -1) {
          last12Months[monthIndex].total += (inv.paidAmount || 0);
        }
      });

      setChartData({
        labels: last12Months.map(m => m.label),
        datasets: [
          {
            fill: true,
            label: 'Revenue',
            data: last12Months.map(m => m.total),
            borderColor: '#FF5C1A',
            backgroundColor: (context: any) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 400);
              gradient.addColorStop(0, 'rgba(255, 92, 26, 0.2)');
              gradient.addColorStop(1, 'rgba(255, 92, 26, 0)');
              return gradient;
            },
            tension: 0.4,
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: '#FF5C1A',
            pointBorderColor: '#0C1020',
            pointBorderWidth: 2,
            pointHoverRadius: 6,
          },
        ],
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    return () => unsubscribe();
  }, [profile]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#0C1020' : '#ffffff',
        titleColor: theme === 'dark' ? '#fff' : '#0f172a',
        bodyColor: theme === 'dark' ? '#9ca3af' : '#64748b',
        padding: 12,
        cornerRadius: 12,
        displayColors: false,
        borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        borderWidth: 1,
      },
    },
    scales: {
      x: { 
        grid: { display: false }, 
        ticks: { color: theme === 'dark' ? '#4b5563' : '#94a3b8' } 
      },
      y: { 
        grid: { color: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, 
        ticks: { color: theme === 'dark' ? '#4b5563' : '#94a3b8' } 
      },
    },
  };

  const handleWhatsAppShare = (inv: Invoice) => {
    if (!profile) return;
    const message = `*Tax Invoice: ${inv.invoiceNumber}*\n\n` +
      `*Business:* ${profile.businessName}\n` +
      `*Customer:* ${inv.customerName}\n` +
      `*Total Amount:* ₹${inv.total.toLocaleString()}\n` +
      `*Status:* ${inv.status.toUpperCase()}\n` +
      `*Due Date:* ${new Date(inv.dueDate).toLocaleDateString()}\n\n` +
      `Thank you for your business!\n` +
      `_Generated by BillAI_`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-8">
      {/* Profile Incomplete Warning */}
      <AnimatePresence>
        {isProfileIncomplete && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-amber-500">Business Profile Incomplete!</h4>
                <p className="text-sm text-[var(--text-secondary)]">Invoices par sahi details dikhane ke liye apna profile complete karein.</p>
              </div>
            </div>
            <Link 
              to="/settings" 
              className="btn-orange bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 py-2 px-6 flex items-center gap-2 whitespace-nowrap"
            >
              Profile Complete Karein <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Invoice Limit Warning */}
      {invoiceCount >= limit * 0.8 && profile?.plan === 'free' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "p-4 rounded-2xl flex items-center justify-between gap-4",
            invoiceCount >= limit ? "bg-red-500/10 border border-red-500/20" : "bg-orange-500/10 border border-orange-500/20"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              invoiceCount >= limit ? "bg-red-500/20" : "bg-orange-500/20"
            )}>
              <AlertTriangle className={cn("w-5 h-5", invoiceCount >= limit ? "text-red-500" : "text-orange-500")} />
            </div>
            <div>
              <p className={cn("text-sm font-bold", invoiceCount >= limit ? "text-red-500" : "text-orange-500")}>
                {invoiceCount >= limit ? "Invoice Limit Reached!" : "Limit Khatam Hone Wali Hai!"}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Aapne {invoiceCount}/{limit} invoices use kar liye hain. {remaining} baaki hain.
              </p>
            </div>
          </div>
          <button onClick={openPricing} className="text-xs font-bold text-orange-500 hover:underline">Upgrade Karein →</button>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <StatCard 
          title="Revenue" 
          value={`₹${stats.totalRevenue.toLocaleString()}`} 
          label="Total kamaai"
          trend={12}
          icon={TrendingUp}
          color="bg-orange-500"
        />
        <StatCard 
          title="Pending" 
          value={`₹${stats.pendingPayments.toLocaleString()}`} 
          label="Abhi baaki"
          trend={-5}
          icon={Clock}
          color="bg-amber-500"
        />
        <StatCard 
          title="GST" 
          value={`₹${stats.gstPayable.toLocaleString()}`} 
          label="Payable"
          trend={8}
          icon={Receipt}
          color="bg-blue-500"
        />
        <StatCard 
          title="Invoices" 
          value={stats.totalInvoices} 
          label="Total count"
          trend={15}
          icon={FileText}
          color="bg-teal-500"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 glass p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-[var(--border-color)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-[100px] -mr-32 -mt-32" />
          
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
              <div>
                <h3 className="text-lg sm:text-xl font-bold">Revenue Trend</h3>
                <p className="text-[10px] sm:text-xs text-[var(--text-secondary)]">Monthly business performance overview</p>
              </div>
              <div className="flex items-center gap-2 bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-color)] w-full sm:w-auto">
                <button className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-orange-500 text-white text-[10px] font-bold uppercase tracking-widest transition-all">Monthly</button>
                <button className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg hover:bg-[var(--bg-primary)]/5 text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest transition-all">Yearly</button>
              </div>
            </div>
            <div className="h-64 sm:h-80 w-full">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4 sm:space-y-6">
          <div className="glass p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-[var(--border-color)] flex flex-col gap-4 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            
            <h3 className="text-base sm:text-xl font-bold mb-1 sm:mb-2 relative z-10">Quick Actions</h3>
            
            <button 
              onClick={() => canCreateInvoice ? setIsAIModalOpen(true) : openPricing()}
              className={cn(
                "w-full p-4 sm:p-6 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl sm:rounded-3xl text-left group/btn transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-orange-500/20 relative overflow-hidden z-10",
                !canCreateInvoice && "opacity-50 grayscale cursor-not-allowed"
              )}
            >
              <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full blur-2xl -mr-12 -mt-12 sm:-mr-16 sm:-mt-16 group-hover/btn:scale-150 transition-transform duration-700" />
              
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-md rounded-xl sm:rounded-2xl flex items-center justify-center shadow-inner">
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/50 group-hover/btn:text-white group-hover/btn:translate-x-1 transition-all" />
                </div>
                <p className="text-lg sm:text-xl font-bold text-white mb-0.5 sm:mb-1">AI Invoice</p>
                <p className="text-[10px] sm:text-xs text-white/70">Hindi mein type karke banayein</p>
              </div>
            </button>

            <div className="grid grid-cols-2 gap-3 relative z-10">
              <button 
                onClick={() => canCreateInvoice ? setIsManualModalOpen(true) : openPricing()}
                className={cn(
                  "p-3 sm:p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl sm:rounded-2xl text-left transition-all hover:bg-[var(--bg-primary)]/5 group/item",
                  !canCreateInvoice && "opacity-50 grayscale cursor-not-allowed"
                )}
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[var(--bg-primary)]/5 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-3 group-hover/item:scale-110 transition-transform">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--text-secondary)] group-hover/item:text-orange-500 transition-colors" />
                </div>
                <p className="text-[10px] sm:text-xs font-bold">Manual</p>
                <p className="text-[8px] sm:text-[9px] text-[var(--text-secondary)]">Standard way</p>
              </button>

              <Link 
                to="/customers?add=true"
                className="p-3 sm:p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl sm:rounded-2xl text-left hover:bg-[var(--bg-primary)]/5 group/item relative z-10"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[var(--bg-primary)]/5 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-3 group-hover/item:scale-110 transition-transform">
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--text-secondary)] group-hover/item:text-orange-500 transition-colors" />
                </div>
                <p className="text-[10px] sm:text-xs font-bold">Customer</p>
                <p className="text-[8px] sm:text-[9px] text-[var(--text-secondary)]">Add new client</p>
              </Link>
            </div>
          </div>

          {/* Pro Tip Card */}
          <div className="glass p-6 rounded-[2.5rem] border border-orange-500/20 bg-orange-500/5 relative overflow-hidden">
            <div className="flex gap-4 items-start relative z-10">
              <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex-shrink-0 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-orange-500 mb-1">Pro Tip!</p>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Aap voice commands se bhi invoice bana sakte hain. Bas mic icon par click karein.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="glass rounded-[2.5rem] border border-[var(--border-color)] overflow-hidden">
        <div className="p-8 flex justify-between items-center border-b border-[var(--border-color)]">
          <div>
            <h3 className="text-xl font-bold">Recent Invoices</h3>
            <p className="text-xs text-[var(--text-secondary)]">Latest transactions</p>
          </div>
          <Link to="/invoices" className="text-xs font-bold text-orange-500 hover:underline">Sab dekho →</Link>
        </div>
        
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest border-b border-[var(--border-color)]">
                <th className="px-8 py-4 font-bold">Invoice #</th>
                <th className="px-8 py-4 font-bold">Customer</th>
                <th className="px-8 py-4 font-bold">Amount</th>
                <th className="px-8 py-4 font-bold">Status</th>
                <th className="px-8 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {invoices.slice(0, 5).map((inv) => (
                <tr key={inv.id} className="hover:bg-[var(--bg-primary)]/5 transition-colors group">
                  <td className="px-8 py-4 font-mono text-sm">{inv.invoiceNumber}</td>
                  <td className="px-8 py-4">
                    <p className="text-sm font-bold">{inv.customerName}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">{new Date(inv.date).toLocaleDateString()}</p>
                  </td>
                  <td className="px-8 py-4">
                    <p className="text-sm font-bold">₹{inv.total.toLocaleString()}</p>
                    {inv.status === 'partial' && (
                      <p className="text-[10px] text-orange-500 font-bold">Bal: ₹{(inv.balanceAmount ?? 0).toLocaleString()}</p>
                    )}
                  </td>
                  <td className="px-8 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                      inv.status === 'paid' ? "bg-green-500/10 text-green-500" : 
                      inv.status === 'pending' ? "bg-amber-500/10 text-amber-500" : 
                      "bg-blue-500/10 text-blue-500"
                    )}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setSelectedInvoice(inv)}
                        className="p-2 hover:bg-[var(--bg-primary)]/10 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleWhatsAppShare(inv)}
                        className="p-2 hover:bg-green-500/10 rounded-lg text-[var(--text-secondary)] hover:text-green-500 transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setSelectedInvoice(inv)}
                        className="p-2 hover:bg-[var(--bg-primary)]/10 rounded-lg transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-[var(--bg-primary)]/10 rounded-lg transition-colors"><MoreVertical className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-[var(--border-color)]">
          {invoices.slice(0, 5).map((inv) => (
            <div key={inv.id} className="p-5 space-y-4 active:bg-[var(--bg-primary)]/5 transition-colors">
              <div className="flex justify-between items-start">
                <div onClick={() => setSelectedInvoice(inv)} className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] font-mono text-[var(--text-secondary)]">{inv.invoiceNumber}</p>
                    <div className="w-1 h-1 rounded-full bg-[var(--border-color)]" />
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold">{new Date(inv.date).toLocaleDateString()}</p>
                  </div>
                  <h4 className="font-bold text-base text-[var(--text-primary)] leading-tight">{inv.customerName}</h4>
                </div>
                <span className={cn(
                  "px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider",
                  inv.status === 'paid' ? "bg-green-500/10 text-green-500" : 
                  inv.status === 'pending' ? "bg-amber-500/10 text-amber-500" : 
                  "bg-blue-500/10 text-blue-500"
                )}>
                  {inv.status}
                </span>
              </div>
              
              <div className="flex justify-between items-center pt-1">
                <div>
                  <p className="text-[9px] text-[var(--text-secondary)] uppercase tracking-widest font-bold mb-0.5">Amount</p>
                  <p className="text-lg font-bold font-mono text-orange-500">₹{inv.total.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleWhatsAppShare(inv)}
                    className="w-10 h-10 flex items-center justify-center bg-green-500/10 text-green-500 rounded-xl active:scale-90 transition-transform"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setSelectedInvoice(inv)}
                    className="w-10 h-10 flex items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-secondary)] rounded-xl active:scale-90 transition-transform"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {invoices.length === 0 && (
          <div className="px-8 py-20 text-center text-[var(--text-secondary)]">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Abhi tak koi invoice nahi hai.</p>
            <button onClick={() => setIsAIModalOpen(true)} className="text-orange-500 font-bold mt-2 hover:underline">Pehla invoice AI se banao ✨</button>
          </div>
        )}
      </div>

      <AIInvoiceModal 
        isOpen={isAIModalOpen} 
        onClose={() => setIsAIModalOpen(false)} 
        onSuccess={() => {}}
        onUpgrade={openPricing}
      />

      <ManualInvoiceModal 
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSuccess={() => {}}
        onUpgrade={openPricing}
      />

      <InvoiceDetailModal 
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        invoice={selectedInvoice}
        profile={profile}
      />
    </div>
  );
};

export default Dashboard;
