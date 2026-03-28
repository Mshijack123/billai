import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Save, Loader2, User, Search, Package } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { useInvoiceLimit } from '../hooks/useInvoiceLimit';
import { db, collection, addDoc, serverTimestamp, query, where, getDocs } from '../firebase';
import { Invoice, InvoiceItem, Customer, Product } from '../types';
import { calculateGST, calculateGSTType, INDIAN_STATES } from '../lib/gst-calculator';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ManualInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialProduct?: Product;
}

export const ManualInvoiceModal: React.FC<ManualInvoiceModalProps> = ({ isOpen, onClose, onSuccess, initialProduct }) => {
  const { profile } = useFirebase();
  const { canCreateInvoice } = useInvoiceLimit();
  const [isSaving, setIsSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerState, setCustomerState] = useState('Rajasthan');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Calculate due date based on payment terms
  const getDueDate = (terms: string) => {
    const date = new Date();
    if (terms === '7 days') date.setDate(date.getDate() + 7);
    else if (terms === '15 days') date.setDate(date.getDate() + 15);
    else if (terms === '30 days') date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  };

  const [dueDate, setDueDate] = useState(getDueDate(profile?.invoiceSettings?.paymentTerms || 'Immediate'));
  const [status, setStatus] = useState<'paid' | 'pending' | 'partial'>('pending');
  const [items, setItems] = useState<InvoiceItem[]>([]);

  useEffect(() => {
    if (isOpen && profile) {
      fetchData();
      setDueDate(getDueDate(profile.invoiceSettings?.paymentTerms || 'Immediate'));
      
      if (initialProduct) {
        const taxableAmount = initialProduct.rate;
        const gstType = calculateGSTType(profile.state || 'Rajasthan', customerState);
        const gst = calculateGST(taxableAmount, initialProduct.gstRate, gstType);
        
        setItems([{
          description: initialProduct.name,
          qty: 1,
          rate: initialProduct.rate,
          taxableAmount: taxableAmount,
          gstRate: initialProduct.gstRate,
          gstAmount: gstType === 'CGST_SGST' ? gst.cgst + gst.sgst : gst.igst,
          total: gst.total,
          hsn: initialProduct.hsn
        }]);
      } else {
        setItems([{ description: '', qty: 1, rate: 0, taxableAmount: 0, gstRate: profile.invoiceSettings?.defaultGstRate || 18, gstAmount: 0, total: 0 }]);
      }
    }
  }, [isOpen, profile, initialProduct]);

  useEffect(() => {
    if (!profile) return;
    const newItems = items.map(item => {
      const gstType = calculateGSTType(profile.state || 'Rajasthan', customerState);
      const gst = calculateGST(item.taxableAmount, item.gstRate, gstType);
      return {
        ...item,
        gstAmount: gstType === 'CGST_SGST' ? gst.cgst + gst.sgst : gst.igst,
        total: gst.total
      };
    });
    setItems(newItems);
  }, [customerState]);

  const fetchData = async () => {
    if (!profile) return;
    const cSnap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', profile.uid)));
    setCustomers(cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    
    const pSnap = await getDocs(query(collection(db, 'products'), where('businessId', '==', profile.uid)));
    setProducts(pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
  };

  const handleAddItem = () => {
    setItems([...items, { description: '', qty: 1, rate: 0, taxableAmount: 0, gstRate: profile?.invoiceSettings?.defaultGstRate || 18, gstAmount: 0, total: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };
    
    // Recalculate item totals
    const qty = field === 'qty' ? Number(value) : item.qty;
    const rate = field === 'rate' ? Number(value) : item.rate;
    const gstRate = field === 'gstRate' ? Number(value) : item.gstRate;
    
    const taxableAmount = qty * rate;
    const gstType = calculateGSTType(profile?.state || 'Rajasthan', customerState);
    const gst = calculateGST(taxableAmount, gstRate, gstType);
    
    item.qty = qty;
    item.rate = rate;
    item.gstRate = gstRate;
    item.taxableAmount = taxableAmount;
    item.gstAmount = gstType === 'CGST_SGST' ? gst.cgst + gst.sgst : gst.igst;
    item.total = gst.total;
    
    newItems[index] = item;
    setItems(newItems);
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const newItems = [...items];
    const qty = newItems[index].qty;
    const rate = product.rate;
    const gstRate = product.gstRate;
    
    const taxableAmount = qty * rate;
    const gstType = calculateGSTType(profile?.state || 'Rajasthan', customerState);
    const gst = calculateGST(taxableAmount, gstRate, gstType);
    
    newItems[index] = {
      ...newItems[index],
      description: product.name,
      hsn: product.hsn,
      rate: rate,
      gstRate: gstRate,
      taxableAmount: taxableAmount,
      gstAmount: gstType === 'CGST_SGST' ? gst.cgst + gst.sgst : gst.igst,
      total: gst.total
    };
    
    setItems(newItems);
  };

  const totals = items.reduce((acc, item) => ({
    subtotal: acc.subtotal + item.taxableAmount,
    gst: acc.gst + item.gstAmount,
    total: acc.total + item.total
  }), { subtotal: 0, gst: 0, total: 0 });

  const handleSave = async () => {
    if (!profile || !selectedCustomerId) {
      alert('Please select a customer');
      return;
    }

    if (!canCreateInvoice) {
      alert('Aapki monthly invoice limit (20) khatam ho gayi hai. Please upgrade karein.');
      return;
    }

    setIsSaving(true);
    try {
      const customer = customers.find(c => c.id === selectedCustomerId);
      const gstType = calculateGSTType(profile.state || 'Rajasthan', customerState);
      
      const prefix = profile.invoiceSettings?.prefix || 'INV';
      const randomNum = Math.floor(1000 + Math.random() * 9000);

      const newInvoice: Omit<Invoice, 'id'> = {
        invoiceNumber: `${prefix}-${randomNum}`,
        businessId: profile.uid,
        customerId: selectedCustomerId,
        customerName: customer?.name || 'Unknown',
        customerGstin: customer?.gstin || '',
        customerState: customerState,
        customerAddress: customer?.address || '',
        date: invoiceDate,
        dueDate: dueDate,
        items,
        subtotal: totals.subtotal,
        cgst: gstType === 'CGST_SGST' ? totals.gst / 2 : 0,
        sgst: gstType === 'CGST_SGST' ? totals.gst / 2 : 0,
        igst: gstType === 'IGST' ? totals.gst : 0,
        total: totals.total,
        status,
        gstType,
        notes: profile.invoiceSettings?.defaultNotes || '',
        confirmedByUser: true,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'invoices'), {
        ...newInvoice,
        createdAt: serverTimestamp()
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to save invoice');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-4xl bg-[#0C1020] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <h2 className="text-2xl font-bold">Manual Invoice Banao</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 space-y-8">
          {/* Top Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Customer Select Karo *</label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <select 
                  value={selectedCustomerId}
                  onChange={(e) => {
                    const c = customers.find(cust => cust.id === e.target.value);
                    setSelectedCustomerId(e.target.value);
                    if (c) setCustomerState(c.state);
                  }}
                  className="input-dark w-full pl-10 appearance-none"
                >
                  <option value="">-- Customer Chuno --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Invoice Date</label>
              <input 
                type="date" 
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="input-dark w-full" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Due Date</label>
              <input 
                type="date" 
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-dark w-full" 
              />
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Invoice Items</h3>
              <button 
                onClick={handleAddItem}
                className="text-xs font-bold text-orange-500 hover:text-orange-400 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Item Add Karo
              </button>
            </div>
            
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="glass p-4 rounded-2xl border border-white/5 grid grid-cols-12 gap-3 sm:gap-4 items-end">
                  <div className="col-span-12 lg:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Description / Product</label>
                    <div className="flex gap-2">
                      <select 
                        onChange={(e) => handleProductSelect(index, e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs focus:outline-none w-20"
                      >
                        <option value="">Pick</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input 
                        type="text" 
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        placeholder="Item name..." 
                        className="bg-transparent border-b border-white/10 focus:border-orange-500 outline-none text-sm flex-1 py-1"
                      />
                    </div>
                  </div>
                  <div className="col-span-4 lg:col-span-1 space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Qty</label>
                    <input 
                      type="number" 
                      value={item.qty}
                      onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                      className="bg-transparent border-b border-white/10 focus:border-orange-500 outline-none text-sm w-full py-1"
                    />
                  </div>
                  <div className="col-span-8 lg:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Rate (₹)</label>
                    <input 
                      type="number" 
                      value={item.rate}
                      onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                      className="bg-transparent border-b border-white/10 focus:border-orange-500 outline-none text-sm w-full py-1"
                    />
                  </div>
                  <div className="col-span-6 lg:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">GST %</label>
                    <select 
                      value={item.gstRate}
                      onChange={(e) => handleItemChange(index, 'gstRate', e.target.value)}
                      className="bg-transparent border-b border-white/10 focus:border-orange-500 outline-none text-sm w-full py-1"
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                  <div className="col-span-6 lg:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Total</label>
                    <p className="text-sm font-bold font-mono py-1">₹{item.total.toLocaleString()}</p>
                  </div>
                  <div className="col-span-12 lg:col-span-1 flex justify-end">
                    <button 
                      onClick={() => handleRemoveItem(index)}
                      className="p-2 hover:bg-red-500/10 text-gray-500 hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-white/5">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Payment Status</label>
                <div className="flex gap-2">
                  {['paid', 'pending', 'partial'].map(s => (
                    <button
                      key={s}
                      onClick={() => setStatus(s as any)}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all",
                        status === s ? "bg-orange-500 border-orange-500 text-white" : "border-white/10 text-gray-500 hover:bg-white/5"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="glass p-6 rounded-3xl border border-white/5 space-y-3">
              <div className="flex justify-between text-sm text-gray-400">
                <span>Subtotal</span>
                <span className="font-mono">₹{totals.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>Total GST</span>
                <span className="font-mono">₹{totals.gst.toLocaleString()}</span>
              </div>
              {calculateGSTType(profile?.state || 'Rajasthan', customerState) === 'CGST_SGST' ? (
                <div className="flex gap-4 text-[10px] font-bold text-gray-500 justify-end">
                  <span>CGST: ₹{(totals.gst / 2).toLocaleString()}</span>
                  <span>SGST: ₹{(totals.gst / 2).toLocaleString()}</span>
                </div>
              ) : (
                <div className="flex gap-4 text-[10px] font-bold text-gray-500 justify-end">
                  <span>IGST: ₹{totals.gst.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold pt-3 border-t border-white/5">
                <span>Total Amount</span>
                <span className="text-orange-500 font-mono">₹{totals.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 flex gap-4 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 font-bold transition-all">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving || !selectedCustomerId}
            className="flex-[2] btn-orange flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Invoice Save Karo
          </button>
        </div>
      </motion.div>
    </div>
  );
};
