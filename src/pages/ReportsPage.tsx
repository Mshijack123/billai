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
import { toPng } from 'html-to-image';
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
      // Use a slightly longer timeout to ensure everything is rendered
      await new Promise(resolve => setTimeout(resolve, 800));

      // Use html-to-image instead of html2canvas for better modern CSS support
      const imgData = await toPng(element, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#0C1020',
        style: {
          padding: '40px',
          backgroundColor: '#0C1020',
          color: '#ffffff'
        }
      });
      
      if (!imgData) {
        throw new Error('Image generation failed');
      }

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
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between lg:hidden">
          <h1 className="text-2xl font-bold">Reports</h1>
          <div className="flex gap-2">
            <button 
              onClick={handlePDFExport}
              disabled={isExportingPDF}
              className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
            </button>
            <button 
              onClick={handleCSVExport}
              className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center"
            >
              <FileText className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
            <div className="relative flex-shrink-0">
              <Calendar className="w-4 h-4 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="input-dark pl-12 pr-10 appearance-none cursor-pointer text-sm"
              >
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="input-dark appearance-none cursor-pointer text-sm flex-shrink-0"
            >
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            <div className="h-8 w-px bg-white/5 mx-1 flex-shrink-0" />

            <select 
              value={gstTypeFilter}
              onChange={(e) => setGstTypeFilter(e.target.value as any)}
              className="input-dark text-xs font-bold appearance-none cursor-pointer flex-shrink-0"
            >
              <option value="ALL">All GST Types</option>
              <option value="CGST_SGST">Intrastate</option>
              <option value="IGST">Interstate</option>
            </select>

            <select 
              value={customerTypeFilter}
              onChange={(e) => setCustomerTypeFilter(e.target.value as any)}
              className="input-dark text-xs font-bold appearance-none cursor-pointer flex-shrink-0"
            >
              <option value="ALL">All Customers</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>

            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="input-dark text-xs font-bold appearance-none cursor-pointer flex-shrink-0"
            >
              <option value="ALL">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          
          <div className="hidden lg:flex gap-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="glass p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/5">
          <p className="text-[8px] sm:text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1 sm:mb-2">Taxable Value</p>
          <p className="text-xl sm:text-3xl font-display font-bold mb-1 sm:mb-2">₹{stats.taxableValue.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-gray-600">Is mahine ka taxable turnover</p>
        </div>
        <div className="glass p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/5">
          <p className="text-[8px] sm:text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1 sm:mb-2">GST Collected</p>
          <p className="text-xl sm:text-3xl font-display font-bold mb-1 sm:mb-2">₹{stats.totalGst.toLocaleString()}</p>
          <div className="flex gap-3 sm:gap-4 text-[8px] sm:text-[10px] font-bold">
            <span className="text-orange-500">CGST ₹{stats.cgst.toLocaleString()}</span>
            <span className="text-green-500">SGST ₹{stats.sgst.toLocaleString()}</span>
          </div>
        </div>
        <div className="glass p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/5 sm:col-span-2 lg:col-span-1">
          <p className="text-[8px] sm:text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1 sm:mb-2">IGST Collected</p>
          <p className="text-xl sm:text-3xl font-display font-bold mb-1 sm:mb-2 text-purple-500">₹{stats.igst.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-gray-600">Interstate sales</p>
        </div>
      </div>

      {/* Breakup Table */}
      <div className="glass rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/5 overflow-hidden">
        <div className="p-5 sm:p-8 border-b border-white/5">
          <h3 className="text-lg sm:text-xl font-bold">GST Rate-wise Breakup</h3>
          <p className="text-[10px] sm:text-xs text-gray-500">Rate wise summary</p>
        </div>
        
        {/* Mobile View for Table */}
        <div className="block sm:hidden divide-y divide-white/5">
          {rateBreakup.map((row) => (
            <div key={row.rate} className="p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-orange-500">{row.rate}% GST Rate</span>
                <span className="text-sm font-mono font-bold">₹{row.total.toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-[10px]">
                <div className="space-y-1">
                  <p className="text-gray-500 uppercase tracking-wider">Taxable</p>
                  <p className="font-mono">₹{row.taxable.toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500 uppercase tracking-wider">CGST/SGST</p>
                  <p className="font-mono text-orange-500">₹{row.cgst.toLocaleString()} / ₹{row.sgst.toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
          <div className="p-5 bg-white/5 flex justify-between items-center">
            <span className="text-xs font-bold text-orange-500 uppercase tracking-widest">Grand Total</span>
            <span className="text-base font-mono font-bold text-orange-500">₹{stats.totalGst.toLocaleString()}</span>
          </div>
        </div>

        <div className="hidden sm:block overflow-x-auto">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 glass p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/5">
          <h3 className="text-lg sm:text-xl font-bold mb-6 lg:mb-8">Monthly GST Trend</h3>
          <div className="h-56 sm:h-80">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        <div className="glass p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/5 flex flex-col justify-between">
          <div>
            <h3 className="text-lg sm:text-xl font-bold mb-2">GSTR-1 Summary</h3>
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex gap-3 text-blue-500 text-[10px] sm:text-xs mb-6">
              <Info className="w-5 h-5 flex-shrink-0" />
              <p>Ye data aapke GSTR-1 filing ke liye ready hai. Tax consultant ko share karo.</p>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs sm:text-sm text-gray-500">B2B Supplies</span>
                <span className="font-bold text-sm sm:text-base">₹{b2bTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs sm:text-sm text-gray-500">B2C Supplies</span>
                <span className="font-bold text-sm sm:text-base">₹{b2cTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs sm:text-sm text-gray-500">Total Invoices</span>
                <span className="font-bold text-sm sm:text-base">{filteredInvoices.length}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={handleCAExport}
            className="btn-orange w-full flex items-center justify-center gap-2 mt-8 py-4 text-sm active:scale-95 transition-transform"
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
