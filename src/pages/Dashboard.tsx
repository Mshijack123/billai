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
  ArrowRight
} from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { db, collection, query, where, onSnapshot, getDocs } from '../firebase';
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

import { useInvoiceLimit } from '../hooks/useInvoiceLimit';

const StatCard = ({ title, value, label, trend, icon: Icon, color }: any) => (
  <motion.div 
    whileHover={{ y: -5, borderColor: 'rgba(255, 92, 26, 0.3)' }}
    className="glass p-6 rounded-[2rem] border border-white/5 transition-all"
  >
    <div className="flex justify-between items-start mb-4">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className={cn("flex items-center gap-1 text-xs font-bold", trend > 0 ? "text-green-500" : "text-amber-500")}>
        {trend > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        {Math.abs(trend)}%
      </div>
    </div>
    <p className="text-3xl font-display font-bold mb-1">{value}</p>
    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{title}</p>
    <p className="text-[10px] text-gray-600 mt-2">{label}</p>
  </motion.div>
);

const Dashboard = () => {
  const { profile } = useFirebase();
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
      const revenue = docs.reduce((sum, inv) => sum + (inv.status === 'paid' ? inv.total : 0), 0);
      const pending = docs.reduce((sum, inv) => sum + (inv.status !== 'paid' ? inv.total : 0), 0);
      const gst = docs.reduce((sum, inv) => sum + inv.cgst + inv.sgst + inv.igst, 0);
      
      setStats({
        totalRevenue: revenue,
        pendingPayments: pending,
        gstPayable: gst,
        totalInvoices: docs.length
      });

      // Calculate chart data
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const now = new Date();
      const last6Months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        last6Months.push({
          label: months[d.getMonth()],
          year: d.getFullYear(),
          month: d.getMonth(),
          total: 0
        });
      }

      docs.forEach(inv => {
        const d = new Date(inv.date);
        const monthIndex = last6Months.findIndex(m => m.month === d.getMonth() && m.year === d.getFullYear());
        if (monthIndex !== -1 && inv.status === 'paid') {
          last6Months[monthIndex].total += inv.total;
        }
      });

      setChartData({
        labels: last6Months.map(m => m.label),
        datasets: [
          {
            fill: true,
            label: 'Revenue',
            data: last6Months.map(m => m.total),
            borderColor: '#FF5C1A',
            backgroundColor: 'rgba(255, 92, 26, 0.1)',
            tension: 0.4,
          },
        ],
      });
    });

    return () => unsubscribe();
  }, [profile]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0C1020',
        titleColor: '#fff',
        bodyColor: '#9ca3af',
        padding: 12,
        cornerRadius: 12,
        displayColors: false,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#4b5563' } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4b5563' } },
    },
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
                <p className="text-sm text-gray-400">Invoices par sahi details dikhane ke liye apna profile complete karein.</p>
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
      {invoiceCount >= limit * 0.8 && (
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
              <p className="text-xs text-gray-400">
                Aapne {invoiceCount}/{limit} invoices use kar liye hain. {remaining} baaki hain.
              </p>
            </div>
          </div>
          <Link to="/settings" className="text-xs font-bold text-orange-500 hover:underline">Upgrade Karein →</Link>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Revenue" 
          value={`₹${stats.totalRevenue.toLocaleString()}`} 
          label="Is mahine ki kamaai"
          trend={12}
          icon={TrendingUp}
          color="bg-orange-500"
        />
        <StatCard 
          title="Pending Payments" 
          value={`₹${stats.pendingPayments.toLocaleString()}`} 
          label="Abhi baaki hai"
          trend={-5}
          icon={Clock}
          color="bg-amber-500"
        />
        <StatCard 
          title="GST Payable" 
          value={`₹${stats.gstPayable.toLocaleString()}`} 
          label="Is quarter mein"
          trend={8}
          icon={Receipt}
          color="bg-blue-500"
        />
        <StatCard 
          title="Total Invoices" 
          value={stats.totalInvoices} 
          label="Is mahine banaye"
          trend={15}
          icon={FileText}
          color="bg-teal-500"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 glass p-8 rounded-[2.5rem] border border-white/5">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-xl font-bold">Revenue Trend</h3>
              <p className="text-xs text-gray-500">Monthly performance overview</p>
            </div>
            <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none">
              <option>Last 6 Months</option>
              <option>Last Year</option>
            </select>
          </div>
          <div className="h-80">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glass p-8 rounded-[2.5rem] border border-white/5 flex flex-col gap-4">
          <h3 className="text-xl font-bold mb-2">Quick karo</h3>
          <button 
            onClick={() => canCreateInvoice ? setIsAIModalOpen(true) : alert('Limit khatam ho gayi hai! Upgrade karein.')}
            className={cn(
              "w-full p-6 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl text-left group transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-orange-500/20",
              !canCreateInvoice && "opacity-50 grayscale cursor-not-allowed"
            )}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <Sparkles className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
            </div>
            <p className="text-lg font-bold text-white mb-1">AI se Invoice Banao</p>
            <p className="text-xs text-white/70">Hindi mein type karo</p>
          </button>

          <button 
            onClick={() => canCreateInvoice ? setIsManualModalOpen(true) : alert('Limit khatam ho gayi hai! Upgrade karein.')}
            className={cn(
              "w-full p-4 border border-white/10 rounded-2xl text-left transition-all flex items-center gap-4",
              canCreateInvoice ? "hover:bg-white/5" : "opacity-50 grayscale cursor-not-allowed"
            )}
          >
            <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold">Manual Invoice</p>
              <p className="text-[10px] text-gray-500">Purana tareeka</p>
            </div>
          </button>

          <Link 
            to="/customers"
            className="w-full p-4 border border-white/10 rounded-2xl text-left hover:bg-white/5 transition-all flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
              <Plus className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold">Customer Jodon</p>
              <p className="text-[10px] text-gray-500">Naya client add karo</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="glass rounded-[2.5rem] border border-white/5 overflow-hidden">
        <div className="p-8 flex justify-between items-center border-b border-white/5">
          <div>
            <h3 className="text-xl font-bold">Recent Invoices</h3>
            <p className="text-xs text-gray-500">Latest transactions</p>
          </div>
          <button className="text-xs font-bold text-orange-500 hover:underline">Sab dekho →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-widest border-b border-white/5">
                <th className="px-8 py-4 font-bold">Invoice #</th>
                <th className="px-8 py-4 font-bold">Customer</th>
                <th className="px-8 py-4 font-bold">Amount</th>
                <th className="px-8 py-4 font-bold">Status</th>
                <th className="px-8 py-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoices.slice(0, 5).map((inv) => (
                <tr key={inv.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-8 py-4 font-mono text-sm">{inv.invoiceNumber}</td>
                  <td className="px-8 py-4">
                    <p className="text-sm font-bold">{inv.customerName}</p>
                    <p className="text-[10px] text-gray-500">{new Date(inv.date).toLocaleDateString()}</p>
                  </td>
                  <td className="px-8 py-4 font-mono font-bold text-sm">₹{inv.total.toLocaleString()}</td>
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
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setSelectedInvoice(inv)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setSelectedInvoice(inv)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          const data = [{
                            'Invoice #': inv.invoiceNumber,
                            'Customer': inv.customerName,
                            'Date': inv.date,
                            'Amount': inv.total,
                            'Status': inv.status,
                            'GST Type': inv.gstType
                          }];
                          exportToCSV(data, `Invoice-${inv.invoiceNumber}`);
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="Download CSV"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-white/10 rounded-lg transition-colors"><MoreVertical className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Abhi tak koi invoice nahi hai.</p>
                    <button onClick={() => setIsAIModalOpen(true)} className="text-orange-500 font-bold mt-2 hover:underline">Pehla invoice AI se banao ✨</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AIInvoiceModal 
        isOpen={isAIModalOpen} 
        onClose={() => setIsAIModalOpen(false)} 
        onSuccess={() => {}}
      />

      <ManualInvoiceModal 
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSuccess={() => {}}
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
