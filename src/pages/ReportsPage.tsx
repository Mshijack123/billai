import React, { useState, useEffect } from 'react';
import { 
  Download, 
  FileText, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  Info
} from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType } from '../firebase';
import { Invoice } from '../types';
import { exportToCSV } from '../lib/csv-export';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { motion } from 'motion/react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ReportsPage = () => {
  const { profile } = useFirebase();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [gstTypeFilter, setGstTypeFilter] = useState<'ALL' | 'CGST_SGST' | 'IGST'>('ALL');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'paid' | 'pending' | 'partial'>('ALL');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [chartData, setChartData] = useState<any>({
    labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'],
    datasets: [
      {
        label: 'CGST',
        data: [0, 0, 0, 0, 0, 0],
        backgroundColor: '#FF5C1A',
        borderRadius: 8,
      },
      {
        label: 'SGST',
        data: [0, 0, 0, 0, 0, 0],
        backgroundColor: '#00E5A0',
        borderRadius: 8,
      },
      {
        label: 'IGST',
        data: [0, 0, 0, 0, 0, 0],
        backgroundColor: '#8B5CF6',
        borderRadius: 8,
      },
    ],
  });

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'invoices'), where('businessId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setInvoices(docs);

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
          cgst: 0,
          sgst: 0,
          igst: 0
        });
      }

      docs.forEach(inv => {
        const d = new Date(inv.date);
        const monthIndex = last6Months.findIndex(m => m.month === d.getMonth() && m.year === d.getFullYear());
        if (monthIndex !== -1) {
          last6Months[monthIndex].cgst += inv.cgst;
          last6Months[monthIndex].sgst += inv.sgst;
          last6Months[monthIndex].igst += inv.igst;
        }
      });

      setChartData({
        labels: last6Months.map(m => m.label),
        datasets: [
          {
            label: 'CGST',
            data: last6Months.map(m => m.cgst),
            backgroundColor: '#FF5C1A',
            borderRadius: 8,
          },
          {
            label: 'SGST',
            data: last6Months.map(m => m.sgst),
            backgroundColor: '#00E5A0',
            borderRadius: 8,
          },
          {
            label: 'IGST',
            data: last6Months.map(m => m.igst),
            backgroundColor: '#8B5CF6',
            borderRadius: 8,
          },
        ],
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    return () => unsubscribe();
  }, [profile]);

  const filteredInvoices = invoices.filter(inv => {
    const d = new Date(inv.date);
    const monthMatch = d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    const gstTypeMatch = gstTypeFilter === 'ALL' || inv.gstType === gstTypeFilter;
    const customerTypeMatch = customerTypeFilter === 'ALL' || 
      (customerTypeFilter === 'B2B' ? !!inv.customerGstin : !inv.customerGstin);
    const statusMatch = statusFilter === 'ALL' || inv.status === statusFilter;
    
    return monthMatch && gstTypeMatch && customerTypeMatch && statusMatch;
  });

  const stats = {
    taxableValue: filteredInvoices.reduce((sum, inv) => sum + inv.subtotal, 0),
    cgst: filteredInvoices.reduce((sum, inv) => sum + inv.cgst, 0),
    sgst: filteredInvoices.reduce((sum, inv) => sum + inv.sgst, 0),
    igst: filteredInvoices.reduce((sum, inv) => sum + inv.igst, 0),
    totalGst: filteredInvoices.reduce((sum, inv) => sum + inv.cgst + inv.sgst + inv.igst, 0),
  };

  const rateBreakup = [5, 12, 18, 28].map(rate => {
    const rateInvoices = filteredInvoices.filter(inv => inv.items.some(item => item.gstRate === rate));
    const taxable = rateInvoices.reduce((sum, inv) => {
      return sum + inv.items.filter(item => item.gstRate === rate).reduce((s, i) => s + i.taxableAmount, 0);
    }, 0);
    const cgst = rateInvoices.reduce((sum, inv) => sum + (inv.gstType === 'CGST_SGST' ? inv.items.filter(item => item.gstRate === rate).reduce((s, i) => s + i.gstAmount, 0) / 2 : 0), 0);
    const sgst = rateInvoices.reduce((sum, inv) => sum + (inv.gstType === 'CGST_SGST' ? inv.items.filter(item => item.gstRate === rate).reduce((s, i) => s + i.gstAmount, 0) / 2 : 0), 0);
    const igst = rateInvoices.reduce((sum, inv) => sum + (inv.gstType === 'IGST' ? inv.items.filter(item => item.gstRate === rate).reduce((s, i) => s + i.gstAmount, 0) : 0), 0);
    
    return { rate, taxable, cgst, sgst, igst, total: cgst + sgst + igst };
  });

  const handleCSVExport = () => {
    const dataToExport = rateBreakup.map(row => ({
      'GST Rate': `${row.rate}%`,
      'Taxable Value': row.taxable,
      'CGST': row.cgst,
      'SGST': row.sgst,
      'IGST': row.igst,
      'Total GST': row.total
    }));
    exportToCSV(dataToExport, `GST-Report-${selectedMonth + 1}-${selectedYear}`);
  };

  const handleCAExport = () => {
    const dataToExport = filteredInvoices.map(inv => ({
      'Invoice No': inv.invoiceNumber,
      'Date': inv.date,
      'Customer': inv.customerName,
      'GSTIN': inv.customerGstin || 'Unregistered',
      'State': inv.customerState,
      'Taxable Value': inv.subtotal,
      'CGST': inv.cgst,
      'SGST': inv.sgst,
      'IGST': inv.igst,
      'Total Value': inv.total,
      'GST Type': inv.gstType
    }));
    exportToCSV(dataToExport, `CA-Report-${selectedMonth + 1}-${selectedYear}`);
  };

  const handlePDFExport = async () => {
    const element = document.getElementById('report-content');
    if (!element) return;

    setIsExportingPDF(true);
    try {
      // Pre-fetch and sanitize styles to remove oklch which html2canvas doesn't support
      const styleElements = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      const sanitizedStyles = await Promise.all(styleElements.map(async (el) => {
        try {
          const href = (el as HTMLLinkElement).href;
          // Only fetch same-origin stylesheets to avoid CORS issues
          if (href.startsWith(window.location.origin) || href.startsWith('/')) {
            const resp = await fetch(href);
            if (resp.ok) {
              const text = await resp.text();
              // Replace oklch with a safe fallback color
              return text.replace(/oklch\([^)]+\)/g, '#71717a');
            }
          }
        } catch (e) {
          console.warn('Failed to pre-fetch stylesheet:', e);
        }
        return null;
      }));

      // Small delay to ensure charts are fully rendered
      await new Promise(resolve => setTimeout(resolve, 800));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#0C1020',
        onclone: (clonedDoc) => {
          // Remove all original link stylesheets in the clone to prevent parsing errors
          const links = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
          links.forEach(l => l.remove());

          // Inject sanitized styles
          sanitizedStyles.forEach(css => {
            if (css) {
              const s = clonedDoc.createElement('style');
              s.innerHTML = css;
              clonedDoc.head.appendChild(s);
            }
          });

          // Sanitize existing style tags
          const styleTags = clonedDoc.getElementsByTagName('style');
          for (let i = 0; i < styleTags.length; i++) {
            try {
              styleTags[i].innerHTML = styleTags[i].innerHTML.replace(/oklch\([^)]+\)/g, '#71717a');
            } catch (e) {
              console.warn('Failed to sanitize style tag:', e);
            }
          }

          // Also sanitize inline styles
          const allElements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i] as HTMLElement;
            if (el.style && el.style.cssText) {
              el.style.cssText = el.style.cssText.replace(/oklch\([^)]+\)/g, '#71717a');
            }
          }

          const clonedElement = clonedDoc.getElementById('report-content');
          if (clonedElement) {
            clonedElement.style.padding = '40px';
            clonedElement.style.backgroundColor = '#0C1020';
            clonedElement.style.color = '#ffffff';
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`GST-Report-${selectedMonth + 1}-${selectedYear}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: 'top' as const,
        labels: { color: '#9ca3af', font: { size: 10, weight: 'bold' as any }, usePointStyle: true, padding: 20 }
      },
      tooltip: {
        backgroundColor: '#0C1020',
        titleColor: '#fff',
        bodyColor: '#9ca3af',
        padding: 12,
        cornerRadius: 12,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#4b5563' } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4b5563' } },
    },
  };

  const b2bInvoices = filteredInvoices.filter(inv => !!inv.customerGstin);
  const b2cInvoices = filteredInvoices.filter(inv => !inv.customerGstin);
  const b2bTotal = b2bInvoices.reduce((sum, inv) => sum + inv.total, 0);
  const b2cTotal = b2cInvoices.reduce((sum, inv) => sum + inv.total, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <Calendar className="w-4 h-4 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="input-dark pl-12 pr-10 appearance-none cursor-pointer"
            >
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
          </div>
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="input-dark appearance-none cursor-pointer"
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <div className="h-8 w-px bg-white/5 mx-2 hidden sm:block" />

          <select 
            value={gstTypeFilter}
            onChange={(e) => setGstTypeFilter(e.target.value as any)}
            className="input-dark text-xs font-bold appearance-none cursor-pointer"
          >
            <option value="ALL">All GST Types</option>
            <option value="CGST_SGST">Intrastate (CGST/SGST)</option>
            <option value="IGST">Interstate (IGST)</option>
          </select>

          <select 
            value={customerTypeFilter}
            onChange={(e) => setCustomerTypeFilter(e.target.value as any)}
            className="input-dark text-xs font-bold appearance-none cursor-pointer"
          >
            <option value="ALL">All Customers</option>
            <option value="B2B">B2B (GSTIN)</option>
            <option value="B2C">B2C (No GSTIN)</option>
          </select>

          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="input-dark text-xs font-bold appearance-none cursor-pointer"
          >
            <option value="ALL">All Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handlePDFExport}
            disabled={isExportingPDF}
            className="px-6 py-3 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/5 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> {isExportingPDF ? 'Exporting...' : 'PDF Export'}
          </button>
          <button 
            onClick={handleCSVExport}
            className="px-6 py-3 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/5 transition-all flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> CSV Export
          </button>
        </div>
      </div>

      <div id="report-content" className="space-y-8">
        <style>{`
          #report-content .glass { background-color: rgba(255, 255, 255, 0.05) !important; border-color: rgba(255, 255, 255, 0.1) !important; }
          #report-content .text-orange-500 { color: #f97316 !important; }
          #report-content .bg-orange-500 { background-color: #f97316 !important; }
          #report-content .text-green-500 { color: #22c55e !important; }
          #report-content .text-purple-500 { color: #a855f7 !important; }
          #report-content .text-gray-500 { color: #6b7280 !important; }
          #report-content .text-gray-600 { color: #4b5563 !important; }
          #report-content .text-gray-400 { color: #9ca3af !important; }
          #report-content .bg-white\\/5 { background-color: rgba(255, 255, 255, 0.05) !important; }
          #report-content .divide-white\\/5 > * + * { border-color: rgba(255, 255, 255, 0.05) !important; }
          #report-content .border-white\\/5 { border-color: rgba(255, 255, 255, 0.05) !important; }
          #report-content .bg-blue-500\\/10 { background-color: rgba(59, 130, 246, 0.1) !important; }
          #report-content .border-blue-500\\/20 { border-color: rgba(59, 130, 246, 0.2) !important; }
          #report-content .text-blue-500 { color: #3b82f6 !important; }
        `}</style>
        {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-8 rounded-[2rem] border border-white/5">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Total Taxable Value</p>
          <p className="text-3xl font-display font-bold mb-2">₹{stats.taxableValue.toLocaleString()}</p>
          <p className="text-xs text-gray-600">Is mahine ka taxable turnover</p>
        </div>
        <div className="glass p-8 rounded-[2rem] border border-white/5">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Total GST Collected</p>
          <p className="text-3xl font-display font-bold mb-2">₹{stats.totalGst.toLocaleString()}</p>
          <div className="flex gap-4 text-[10px] font-bold">
            <span className="text-orange-500">CGST ₹{stats.cgst.toLocaleString()}</span>
            <span className="text-green-500">SGST ₹{stats.sgst.toLocaleString()}</span>
          </div>
        </div>
        <div className="glass p-8 rounded-[2rem] border border-white/5">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">IGST Collected</p>
          <p className="text-3xl font-display font-bold mb-2 text-purple-500">₹{stats.igst.toLocaleString()}</p>
          <p className="text-xs text-gray-600">Interstate sales</p>
        </div>
      </div>

      {/* Breakup Table */}
      <div className="glass rounded-[2.5rem] border border-white/5 overflow-hidden">
        <div className="p-8 border-b border-white/5">
          <h3 className="text-xl font-bold">GST Rate-wise Breakup</h3>
          <p className="text-xs text-gray-500">January 2025 summary</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-widest border-b border-white/5">
                <th className="px-8 py-4 font-bold">GST Rate</th>
                <th className="px-8 py-4 font-bold">Taxable Value</th>
                <th className="px-8 py-4 font-bold">CGST</th>
                <th className="px-8 py-4 font-bold">SGST</th>
                <th className="px-8 py-4 font-bold">IGST</th>
                <th className="px-8 py-4 font-bold">Total GST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rateBreakup.map((row) => (
                <tr key={row.rate} className="hover:bg-white/5 transition-colors">
                  <td className="px-8 py-4 font-bold">{row.rate}%</td>
                  <td className="px-8 py-4 font-mono text-sm">₹{row.taxable.toLocaleString()}</td>
                  <td className="px-8 py-4 font-mono text-sm text-orange-500">₹{row.cgst.toLocaleString()}</td>
                  <td className="px-8 py-4 font-mono text-sm text-green-500">₹{row.sgst.toLocaleString()}</td>
                  <td className="px-8 py-4 font-mono text-sm text-purple-500">₹{row.igst.toLocaleString()}</td>
                  <td className="px-8 py-4 font-mono font-bold text-sm">₹{row.total.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-white/5">
                <td className="px-8 py-4 font-bold text-orange-500">TOTAL</td>
                <td className="px-8 py-4 font-mono font-bold text-sm text-orange-500">₹{stats.taxableValue.toLocaleString()}</td>
                <td className="px-8 py-4 font-mono font-bold text-sm text-orange-500">₹{stats.cgst.toLocaleString()}</td>
                <td className="px-8 py-4 font-mono font-bold text-sm text-orange-500">₹{stats.sgst.toLocaleString()}</td>
                <td className="px-8 py-4 font-mono font-bold text-sm text-orange-500">₹{stats.igst.toLocaleString()}</td>
                <td className="px-8 py-4 font-mono font-bold text-sm text-orange-500">₹{stats.totalGst.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass p-8 rounded-[2.5rem] border border-white/5">
          <h3 className="text-xl font-bold mb-8">Monthly GST Trend</h3>
          <div className="h-80">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        <div className="glass p-8 rounded-[2.5rem] border border-white/5 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-bold mb-2">GSTR-1 Summary</h3>
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex gap-3 text-blue-500 text-xs mb-6">
              <Info className="w-5 h-5 flex-shrink-0" />
              <p>Ye data aapke GSTR-1 filing ke liye ready hai. Tax consultant ko share karo.</p>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">B2B Supplies</span>
                <span className="font-bold">₹{b2bTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">B2C Supplies</span>
                <span className="font-bold">₹{b2cTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total Invoices</span>
                <span className="font-bold">{filteredInvoices.length}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={handleCAExport}
            className="btn-orange w-full flex items-center justify-center gap-2 mt-8"
          >
            <Download className="w-5 h-5" /> Export for CA
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ReportsPage;
