import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Eye, 
  Edit3, 
  MoreVertical, 
  Plus,
  Camera,
  FileText,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  X,
  Share2,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { usePricing } from '../components/PricingContext';
import { useInvoiceLimit } from '../hooks/useInvoiceLimit';
import { db, collection, query, where, onSnapshot, updateDoc, deleteDoc, doc, handleFirestoreError, OperationType } from '../firebase';
import { Invoice } from '../types';
import { AIInvoiceModal } from '../components/AIInvoiceModal';
import { ManualInvoiceModal } from '../components/ManualInvoiceModal';
import { InvoiceDetailModal } from '../components/InvoiceDetailModal';
import { exportToCSV } from '../lib/csv-export';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const InvoicesPage = () => {
  const { profile } = useFirebase();
  const { openPricing } = usePricing();
  const { invoiceCount, limit, canCreateInvoice, remaining } = useInvoiceLimit();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiInitialMode, setAiInitialMode] = useState<'text' | 'image'>('text');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [autoDownload, setAutoDownload] = useState(false);
  const [autoShare, setAutoShare] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'invoices'), where('businessId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      
      const getTime = (val: any) => {
        if (!val) return Date.now();
        if (typeof val === 'string') return new Date(val).getTime();
        if (val && typeof val === 'object' && 'toMillis' in val) return val.toMillis();
        return new Date(val).getTime();
      };

      setInvoices(docs.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    let result = invoices;
    
    if (searchTerm) {
      result = result.filter(inv => 
        inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (statusFilter !== 'all') {
      result = result.filter(inv => inv.status === statusFilter);
    }
    
    setFilteredInvoices(result);
    setCurrentPage(1); // Reset to first page on filter change
  }, [searchTerm, statusFilter, invoices]);

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedInvoices.length === filteredInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(filteredInvoices.map(inv => inv.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedInvoices.includes(id)) {
      setSelectedInvoices(selectedInvoices.filter(i => i !== id));
    } else {
      setSelectedInvoices([...selectedInvoices, id]);
    }
  };

  const handleMarkAsPaid = async (id?: string) => {
    const idsToUpdate = id ? [id] : selectedInvoices;
    if (idsToUpdate.length === 0) return;

    try {
      const promises = idsToUpdate.map(invoiceId => {
        const inv = invoices.find(i => i.id === invoiceId);
        if (!inv) return Promise.resolve();
        
        return updateDoc(doc(db, 'invoices', invoiceId), { 
          status: 'paid',
          paidAmount: inv.total,
          balanceAmount: 0
        });
      });
      await Promise.all(promises);
      setSelectedInvoices([]);
    } catch (err) {
      console.error('Error updating invoice status:', err);
    }
  };

  const handleDeleteInvoice = async (id?: string) => {
    const idsToDelete = id ? [id] : selectedInvoices;
    if (idsToDelete.length === 0) return;

    if (!window.confirm(`Kya aap ${idsToDelete.length > 1 ? 'in selected invoices' : 'is invoice'} ko delete karna chahte hain?`)) return;

    try {
      const promises = idsToDelete.map(invoiceId => deleteDoc(doc(db, 'invoices', invoiceId)));
      await Promise.all(promises);
      setSelectedInvoices([]);
    } catch (err) {
      console.error('Error deleting invoice:', err);
    }
  };

  const handleCSVExport = () => {
    const dataToExport = filteredInvoices.map(inv => ({
      'Invoice Number': inv.invoiceNumber,
      'Customer Name': inv.customerName,
      'Date': inv.date,
      'Due Date': inv.dueDate,
      'Subtotal': inv.subtotal,
      'CGST': inv.cgst,
      'SGST': inv.sgst,
      'IGST': inv.igst,
      'Total': inv.total,
      'Status': inv.status,
      'GST Type': inv.gstType
    }));
    exportToCSV(dataToExport, `Invoices-${new Date().toISOString().split('T')[0]}`);
  };

  const handleWhatsAppShare = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setAutoShare(true);
  };

  const stats = {
    total: invoices.length,
    paid: invoices.filter(i => i.status === 'paid').length,
    paidAmount: invoices.reduce((sum, i) => sum + (i.paidAmount || 0), 0),
    pending: invoices.filter(i => i.status === 'pending').length,
    pendingAmount: invoices.reduce((sum, i) => sum + (i.balanceAmount ?? i.total), 0),
    partial: invoices.filter(i => i.status === 'partial').length,
  };

  const handleCreateManual = () => {
    if (!canCreateInvoice) {
      openPricing();
      return;
    }
    setIsManualModalOpen(true);
  };

  const handleCreateAI = (mode: 'text' | 'image' = 'text') => {
    if (!canCreateInvoice) {
      openPricing();
      return;
    }
    setAiInitialMode(mode);
    setIsAIModalOpen(true);
  };

  return (
    <div className="space-y-8">
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
              <AlertCircle className={cn("w-5 h-5", invoiceCount >= limit ? "text-red-500" : "text-orange-500")} />
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
          <button onClick={openPricing} className="text-xs font-bold text-orange-500 hover:underline">Upgrade Karein →</button>
        </motion.div>
      )}

      {/* Top Bar */}
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Invoice ya customer dhundo..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-dark w-full pl-11 py-3 text-sm"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              <div className="relative flex-shrink-0 min-w-[140px]">
                <Filter className="w-4 h-4 text-[var(--text-secondary)] absolute left-4 top-1/2 -translate-y-1/2" />
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-dark pl-11 pr-10 py-3 appearance-none cursor-pointer text-sm w-full"
                >
                  <option value="all">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                </select>
              </div>
              <button 
                onClick={handleCSVExport}
                className="input-dark flex items-center gap-2 hover:bg-white/10 transition-colors px-5 py-3 flex-shrink-0"
              >
                <Download className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="text-sm font-medium">Export</span>
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar lg:hidden">
          <button 
            onClick={handleCreateManual}
            className="px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-xs font-bold hover:bg-[var(--bg-primary)]/5 transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
          >
            <Plus className="w-4 h-4" /> Manual
          </button>
          <button 
            onClick={() => handleCreateAI('image')}
            className="px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl text-xs font-bold hover:bg-[var(--bg-primary)]/5 transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
          >
            <Camera className="w-4 h-4" /> Scan Bill
          </button>
          <button 
            onClick={() => handleCreateAI('text')}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 whitespace-nowrap active:scale-95"
          >
            <Plus className="w-4 h-4" /> Naya Invoice
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-3 justify-end">
          <button 
            onClick={handleCreateManual}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Manual
          </button>
          <button 
            onClick={() => handleCreateAI('image')}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <Camera className="w-4 h-4" /> Scan Bill
          </button>
          <button 
            onClick={() => handleCreateAI('text')}
            className="btn-orange flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" /> Naya Invoice
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="glass rounded-[2rem] sm:rounded-[3rem] border border-[var(--border-color)] p-6 sm:p-10 flex flex-wrap items-center justify-between gap-8 xl:gap-12">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[var(--bg-primary)]/5 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest">Total</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
        </div>
        <div className="h-10 w-px bg-[var(--border-color)] hidden md:block" />
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest">Paid</p>
            <p className="text-xl font-bold">₹{stats.paidAmount.toLocaleString()}</p>
          </div>
        </div>
        <div className="h-10 w-px bg-[var(--border-color)] hidden md:block" />
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
            <div className="w-2 h-2 bg-amber-500 rounded-full" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest">Balance</p>
            <p className="text-xl font-bold text-amber-500">₹{stats.pendingAmount.toLocaleString()}</p>
          </div>
        </div>
        <div className="h-10 w-px bg-[var(--border-color)] hidden md:block" />
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest">Invoices</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
        </div>
      </div>

      {/* Invoices Table / Card View */}
      <div className="glass rounded-[2rem] lg:rounded-[2.5rem] border border-[var(--border-color)] overflow-hidden relative">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest border-b border-[var(--border-color)]">
                <th className="px-8 py-4">
                  <input 
                    type="checkbox" 
                    checked={selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-[var(--border-color)] bg-[var(--bg-primary)] text-orange-500 focus:ring-orange-500" 
                  />
                </th>
                <th className="px-8 py-4 font-bold">Invoice #</th>
                <th className="px-8 py-4 font-bold">Customer</th>
                <th className="px-8 py-4 font-bold">Date</th>
                <th className="px-8 py-4 font-bold">Items</th>
                <th className="px-8 py-4 font-bold">Amount</th>
                <th className="px-8 py-4 font-bold">GST</th>
                <th className="px-8 py-4 font-bold">Status</th>
                <th className="px-8 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {paginatedInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[var(--bg-secondary)] transition-colors group">
                  <td className="px-8 py-4">
                    <input 
                      type="checkbox" 
                      checked={selectedInvoices.includes(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                      className="w-4 h-4 rounded border-[var(--border-color)] bg-[var(--bg-primary)] text-orange-500 focus:ring-orange-500" 
                    />
                  </td>
                  <td className="px-8 py-4 font-mono text-sm">{inv.invoiceNumber}</td>
                  <td className="px-8 py-4">
                    <p className="text-sm font-bold">{inv.customerName}</p>
                  </td>
                  <td className="px-8 py-4 text-xs text-[var(--text-secondary)]">{new Date(inv.date).toLocaleDateString()}</td>
                  <td className="px-8 py-4 text-xs text-[var(--text-secondary)]">{inv.items.length} items</td>
                  <td className="px-8 py-4">
                    <p className="text-sm font-bold">₹{inv.total.toLocaleString()}</p>
                    {inv.status === 'partial' && (
                      <p className="text-[10px] text-orange-500 font-bold">Bal: ₹{(inv.balanceAmount ?? 0).toLocaleString()}</p>
                    )}
                  </td>
                  <td className="px-8 py-4 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">{inv.gstType}</td>
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
                        className="p-2 hover:bg-[var(--bg-primary)] rounded-lg transition-colors" 
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleWhatsAppShare(inv)}
                        className="p-2 hover:bg-green-500/10 rounded-lg text-[var(--text-secondary)] hover:text-green-500 transition-colors" 
                        title="WhatsApp Share"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setAutoDownload(true);
                        }}
                        className="p-2 hover:bg-[var(--bg-primary)] rounded-lg transition-colors" 
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {inv.status !== 'paid' && (
                        <button 
                          onClick={() => handleMarkAsPaid(inv.id)}
                          className="p-2 hover:bg-green-500/10 rounded-lg text-[var(--text-secondary)] hover:text-green-500 transition-colors" 
                          title="Mark as Paid"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDeleteInvoice(inv.id)}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-[var(--bg-primary)] rounded-lg transition-colors"><MoreVertical className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-[var(--border-color)]">
          {paginatedInvoices.map((inv) => (
            <div key={inv.id} className="p-5 space-y-4 active:bg-[var(--bg-secondary)] transition-colors">
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
                  {inv.status !== 'paid' && (
                    <button 
                      onClick={() => handleMarkAsPaid(inv.id)}
                      className="w-10 h-10 flex items-center justify-center bg-green-500/10 text-green-500 rounded-xl active:scale-90 transition-transform"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => handleDeleteInvoice(inv.id)}
                    className="w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-500 rounded-xl active:scale-90 transition-transform"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredInvoices.length === 0 && (
          <div className="px-8 py-20 text-center text-[var(--text-secondary)]">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Koi invoice nahi mila.</p>
          </div>
        )}

        {/* Pagination */}
        <div className="p-6 sm:p-8 flex items-center justify-between border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/50">
          <p className="text-[10px] sm:text-xs text-[var(--text-secondary)] font-medium">
            Showing <span className="text-[var(--text-primary)]">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-[var(--text-primary)]">{Math.min(currentPage * itemsPerPage, filteredInvoices.length)}</span> of <span className="text-[var(--text-primary)]">{filteredInvoices.length}</span>
          </p>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl border border-[var(--border-color)] hover:bg-[var(--bg-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                // Show first, last, and pages around current
                if (
                  pageNum === 1 || 
                  pageNum === totalPages || 
                  (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-xl text-[10px] font-bold transition-all",
                        currentPage === pageNum 
                          ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" 
                          : "hover:bg-[var(--bg-primary)]/10 text-[var(--text-secondary)]"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                }
                // Show ellipsis
                if (
                  (pageNum === 2 && currentPage > 3) || 
                  (pageNum === totalPages - 1 && currentPage < totalPages - 2)
                ) {
                  return <span key={pageNum} className="text-[var(--text-secondary)] text-[10px]">...</span>;
                }
                return null;
              })}
            </div>

            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 rounded-xl border border-[var(--border-color)] hover:bg-[var(--bg-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        <AnimatePresence>
          {selectedInvoices.length > 0 && (
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 glass p-4 rounded-2xl shadow-2xl shadow-black z-50 flex items-center gap-6 border-orange-500/30"
            >
              <span className="text-sm font-bold text-orange-500">{selectedInvoices.length} selected</span>
              <div className="h-6 w-px bg-[var(--border-color)]" />
              <div className="flex items-center gap-2">
                <button className="px-4 py-2 bg-[var(--bg-primary)]/5 hover:bg-[var(--bg-primary)]/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                  <Download className="w-4 h-4" /> Download PDFs
                </button>
                <button 
                  onClick={() => handleMarkAsPaid()}
                  className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-500 rounded-xl text-xs font-bold transition-all"
                >
                  Mark as Paid
                </button>
                <button 
                  onClick={() => handleDeleteInvoice()}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-xl text-xs font-bold transition-all"
                >
                  Delete
                </button>
              </div>
              <button onClick={() => setSelectedInvoices([])} className="p-2 hover:bg-[var(--bg-primary)]/10 rounded-lg">
                <X className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AIInvoiceModal 
        isOpen={isAIModalOpen} 
        onClose={() => setIsAIModalOpen(false)} 
        onSuccess={() => {}}
        onUpgrade={openPricing}
        initialMode={aiInitialMode}
      />

      <ManualInvoiceModal 
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSuccess={() => {}}
        onUpgrade={openPricing}
      />

      <InvoiceDetailModal 
        isOpen={!!selectedInvoice}
        onClose={() => {
          setSelectedInvoice(null);
          setAutoDownload(false);
          setAutoShare(false);
        }}
        invoice={selectedInvoice}
        profile={profile}
        autoDownload={autoDownload}
        autoShare={autoShare}
        onDownloadComplete={() => setAutoDownload(false)}
        onShareComplete={() => setAutoShare(false)}
        onDelete={(id) => {
          setInvoices(prev => prev.filter(inv => inv.id !== id));
          setSelectedInvoice(null);
        }}
      />
    </div>
  );
};

export default InvoicesPage;
