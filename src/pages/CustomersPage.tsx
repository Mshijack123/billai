import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  MoreVertical,
  ArrowUpRight,
  Trash2,
  X,
  Store,
  Users
} from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { usePricing } from '../components/PricingContext';
import { useInvoiceLimit } from '../hooks/useInvoiceLimit';
import { db, collection, query, where, onSnapshot, addDoc, updateDoc, serverTimestamp, deleteDoc, doc, handleFirestoreError, OperationType } from '../firebase';
import { Customer, Invoice } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { INDIAN_STATES } from '../lib/gst-calculator';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getInitials = (name: string) => {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const CustomerCard = ({ 
  customer, 
  outstanding,
  onClick, 
  onDelete 
}: { 
  customer: Customer, 
  outstanding: number,
  onClick: () => void, 
  onDelete: (id: string, e: React.MouseEvent) => void 
}) => {
  const initials = getInitials(customer.name);
  const colors = ['bg-orange-500', 'bg-purple-500', 'bg-blue-500', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500'];
  const color = colors[customer.name.length % colors.length];

  return (
    <motion.div 
      whileHover={{ y: -5, borderColor: 'rgba(255, 92, 26, 0.3)' }}
      className="glass p-5 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 transition-all group"
    >
      <div className="flex justify-between items-start mb-4 sm:mb-6">
        <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center font-bold text-white text-base sm:text-lg", color)}>
          {initials}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => onDelete(customer.id, e)}
            className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-white/5 rounded-lg">
            <MoreVertical className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      <h3 className="text-lg sm:text-xl font-bold mb-1 truncate">{customer.name}</h3>
      <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 mb-4 sm:mb-6">
        <Phone className="w-3 h-3" /> {customer.phone}
      </div>

      <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
        <div className="flex justify-between items-center text-[10px] sm:text-xs">
          <span className="text-gray-500">State</span>
          <span className="font-medium">{customer.state}</span>
        </div>
        <div className="flex justify-between items-center text-[10px] sm:text-xs">
          <span className="text-gray-500">Outstanding</span>
          <span className={cn("font-mono font-bold", outstanding > 0 ? "text-amber-500" : "text-green-500")}>
            ₹{outstanding.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={onClick}
          className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
        >
          View History
        </button>
        <button className="p-2.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 rounded-xl transition-all active:scale-95">
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
};

const CustomersPage = () => {
  const { profile } = useFirebase();
  const { openPricing } = usePricing();
  const { canCreateInvoice } = useInvoiceLimit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setIsAddModalOpen(true);
      // Clean up search params
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('add');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    businessName: '',
    gstin: '',
    state: 'Rajasthan',
    address: ''
  });

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Kya aap is customer ko delete karna chahte hain?')) return;
    try {
      await deleteDoc(doc(db, 'customers', id));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'customers'), where('businessId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'invoices'), where('businessId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setAllInvoices(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerInvoices([]);
      return;
    }

    const q = query(
      collection(db, 'invoices'), 
      where('businessId', '==', profile.uid),
      where('customerId', '==', selectedCustomer.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      setCustomerInvoices(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    });

    return () => unsubscribe();
  }, [selectedCustomer]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsSaving(true);
    try {
      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id), {
          ...formData,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'customers'), {
          ...formData,
          businessId: profile.uid,
          createdAt: new Date().toISOString()
        });
      }
      setIsAddModalOpen(false);
      setEditingCustomer(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        businessName: '',
        gstin: '',
        state: 'Rajasthan',
        address: ''
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      businessName: customer.businessName || '',
      gstin: customer.gstin || '',
      state: customer.state,
      address: customer.address || ''
    });
    setIsAddModalOpen(true);
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    c.businessName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const totalOutstanding = allInvoices.reduce((sum, inv) => {
    const balance = inv.balanceAmount !== undefined ? inv.balanceAmount : (inv.status === 'paid' ? 0 : inv.total);
    return sum + balance;
  }, 0);
  const totalRevenue = allInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const avgOrderValue = allInvoices.length > 0 ? totalRevenue / allInvoices.length : 0;
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeThisMonth = new Set(
    allInvoices
      .filter(inv => new Date(inv.date) >= startOfMonth)
      .map(inv => inv.customerId)
  ).size;

  const getCustomerOutstanding = (customerId: string) => {
    return allInvoices
      .filter(inv => inv.customerId === customerId)
      .reduce((sum, inv) => {
        const balance = inv.balanceAmount !== undefined ? inv.balanceAmount : (inv.status === 'paid' ? 0 : inv.total);
        return sum + balance;
      }, 0);
  };

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between lg:hidden">
          <h1 className="text-2xl font-bold">Customers</h1>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="w-12 h-12 bg-orange-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 active:scale-90 transition-transform"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Customer dhundo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-dark w-full pl-11 py-3 text-sm"
            />
          </div>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="hidden lg:flex btn-orange items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" /> Customer Jodon
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total', value: customers.length },
          { label: 'Active', value: activeThisMonth },
          { label: 'Outstanding', value: `₹${totalOutstanding.toLocaleString()}`, color: 'text-amber-500' },
          { label: 'Avg Order', value: `₹${Math.round(avgOrderValue).toLocaleString()}` }
        ].map((stat, i) => (
          <div key={i} className="glass p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/5">
            <p className="text-[8px] sm:text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5 sm:mb-1">{stat.label}</p>
            <p className={cn("text-base sm:text-xl font-bold", stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredCustomers.map((customer) => (
          <CustomerCard 
            key={customer.id} 
            customer={customer} 
            outstanding={getCustomerOutstanding(customer.id)}
            onClick={() => setSelectedCustomer(customer)} 
            onDelete={handleDelete}
          />
        ))}
        {filteredCustomers.length === 0 && (
          <div className="col-span-full py-20 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Koi customer nahi mila.</p>
          </div>
        )}
      </div>

      {/* Slide-over Panel */}
      <AnimatePresence>
        {selectedCustomer && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCustomer(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 bottom-0 w-full lg:max-w-md bg-[#0C1020] z-[70] p-5 sm:p-6 lg:p-8 shadow-2xl border-l border-white/5 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6 sm:mb-8">
                <h2 className="text-xl lg:text-2xl font-bold">Customer Details</h2>
                <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-white/5 rounded-lg active:scale-90 transition-transform">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="flex flex-col items-center text-center mb-6 sm:mb-8">
                <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-[1.5rem] sm:rounded-[2rem] bg-orange-500 flex items-center justify-center font-bold text-white text-2xl lg:text-3xl mb-4 shadow-xl shadow-orange-500/20">
                  {getInitials(selectedCustomer.name)}
                </div>
                <h3 className="text-xl lg:text-2xl font-bold mb-1">{selectedCustomer.name}</h3>
                <p className="text-gray-500 text-sm mb-6">{selectedCustomer.phone}</p>
                
                <div className="flex gap-3 w-full lg:w-auto">
                  <button 
                    onClick={() => openEditModal(selectedCustomer)}
                    className="flex-1 lg:flex-none px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 transition-all active:scale-95"
                  >
                    Edit Details
                  </button>
                  <button 
                    onClick={() => {
                      if (!canCreateInvoice) {
                        openPricing();
                        return;
                      }
                    }}
                    className="flex-1 lg:flex-none px-5 py-3 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20 active:scale-95"
                  >
                    Naya Invoice
                  </button>
                </div>
              </div>

              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass p-4 rounded-2xl border border-white/5">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Total Orders</p>
                    <p className="text-xl font-bold">{customerInvoices.length}</p>
                  </div>
                  <div className="glass p-4 rounded-2xl border border-white/5">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Outstanding</p>
                    <p className="text-xl font-bold text-amber-500">₹{getCustomerOutstanding(selectedCustomer.id).toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Contact Info</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="w-4 h-4 text-orange-500" />
                      <span className="text-gray-400">{selectedCustomer.email || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Store className="w-4 h-4 text-orange-500" />
                      <span className="text-gray-400">{selectedCustomer.businessName || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <MapPin className="w-4 h-4 text-orange-500" />
                      <span className="text-gray-400">{selectedCustomer.address || selectedCustomer.state}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Invoice History</h4>
                  <div className="space-y-3">
                    {customerInvoices.map(inv => (
                      <div key={inv.id} className="glass p-4 rounded-xl border border-white/5 flex justify-between items-center hover:border-orange-500/30 transition-all cursor-pointer group">
                        <div>
                          <p className="text-sm font-bold group-hover:text-orange-500 transition-colors">{inv.invoiceNumber}</p>
                          <p className="text-[10px] text-gray-500">{new Date(inv.date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono font-bold">₹{inv.total.toLocaleString()}</p>
                          <span className={cn(
                            "text-[8px] font-bold uppercase tracking-widest",
                            inv.status === 'paid' ? "text-green-500" : "text-amber-500"
                          )}>
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    ))}
                    {customerInvoices.length === 0 && (
                      <p className="text-center py-10 text-xs text-gray-600">No invoices yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full h-full sm:h-auto sm:max-w-lg bg-[#0C1020] sm:border sm:border-white/10 sm:rounded-[2rem] p-6 sm:p-8 shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center mb-6 sm:mb-8 flex-shrink-0">
                <h2 className="text-xl sm:text-2xl font-bold">{editingCustomer ? 'Customer Update' : 'Naya Customer'}</h2>
                <button 
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingCustomer(null);
                  }} 
                  className="p-2 hover:bg-white/5 rounded-lg active:scale-90 transition-transform"
                >
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} className="space-y-4 flex-1 overflow-y-auto no-scrollbar pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Naam *</label>
                    <input 
                      required
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Ramesh Gupta" 
                      className="input-dark w-full py-3" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Phone *</label>
                    <input 
                      required
                      type="tel" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="9876543210" 
                      className="input-dark w-full py-3" 
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Email</label>
                  <input 
                    type="email" 
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="ramesh@example.com" 
                    className="input-dark w-full py-3" 
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Business Name</label>
                    <input 
                      type="text" 
                      value={formData.businessName}
                      onChange={(e) => setFormData({...formData, businessName: e.target.value})}
                      placeholder="Gupta Shoes" 
                      className="input-dark w-full py-3" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">GSTIN</label>
                    <input 
                      type="text" 
                      value={formData.gstin}
                      onChange={(e) => setFormData({...formData, gstin: e.target.value})}
                      placeholder="08ABCDE1234F1Z5" 
                      className="input-dark w-full py-3" 
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">State *</label>
                  <select 
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value})}
                    className="input-dark w-full appearance-none py-3"
                  >
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-1">Address</label>
                  <textarea 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    placeholder="Full address..." 
                    className="input-dark w-full h-24 resize-none py-3" 
                  />
                </div>

                <button type="submit" disabled={isSaving} className="btn-orange w-full mt-4 py-4 active:scale-95 transition-transform">
                  {isSaving ? 'Saving...' : (editingCustomer ? 'Update Karein' : 'Customer Save karo')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomersPage;
