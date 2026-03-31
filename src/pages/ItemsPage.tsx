import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Package, 
  Tag, 
  Hash, 
  IndianRupee, 
  MoreVertical,
  Edit3,
  Trash2,
  X,
  FileText
} from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { usePricing } from '../components/PricingContext';
import { useInvoiceLimit } from '../hooks/useInvoiceLimit';
import { db, collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, handleFirestoreError, OperationType, serverTimestamp } from '../firebase';
import { Product } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ManualInvoiceModal } from '../components/ManualInvoiceModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ItemsPage = () => {
  const { profile } = useFirebase();
  const { openPricing } = usePricing();
  const { canCreateInvoice } = useInvoiceLimit();
  const [items, setItems] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedProductForInvoice, setSelectedProductForInvoice] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<Product | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hsn: '',
    rate: '' as any,
    gstRate: 18,
    unit: 'pcs'
  });

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'products'), where('businessId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      
      const getTime = (val: any) => {
        if (!val) return Date.now();
        if (typeof val === 'string') return new Date(val).getTime();
        if (val && typeof val === 'object' && 'toMillis' in val) return val.toMillis();
        return new Date(val).getTime();
      };

      setItems(docs.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    return () => unsubscribe();
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsSaving(true);
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'products', editingItem.id), {
          ...formData,
          rate: Number(formData.rate) || 0,
          gstRate: Number(formData.gstRate)
        });
      } else {
        await addDoc(collection(db, 'products'), {
          ...formData,
          businessId: profile.uid,
          rate: Number(formData.rate) || 0,
          gstRate: Number(formData.gstRate),
          createdAt: serverTimestamp()
        });
      }
      setShowSuccess(true);
      closeModal();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Kya aap is item ko delete karna chahte hain?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (err) {
      console.error(err);
    }
  };

  const openModal = (item?: Product) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        description: item.description || '',
        hsn: item.hsn || '',
        rate: item.rate.toString(),
        gstRate: item.gstRate,
        unit: item.unit
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        description: '',
        hsn: '',
        rate: '',
        gstRate: 18,
        unit: 'pcs'
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.hsn?.includes(searchTerm)
  );

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between lg:hidden">
          <h1 className="text-2xl font-bold">Items</h1>
          <button 
            onClick={() => openModal()}
            className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <AnimatePresence>
            {showSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2"
              >
                <IndianRupee className="w-5 h-5" /> Item save ho gaya!
              </motion.div>
            )}
          </AnimatePresence>
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Item dhundo (Naam ya HSN)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-dark w-full pl-12 py-3"
            />
          </div>
          <button 
            onClick={() => openModal()}
            className="hidden lg:flex btn-orange items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" /> Naya Item Jodon
          </button>
        </div>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredItems.map((item) => (
          <motion.div 
            key={item.id}
            whileHover={{ y: -5 }}
            className="glass p-6 rounded-[2rem] border border-white/5 transition-all group relative"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                <Package className="w-6 h-6 text-orange-500" />
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => openModal(item)}
                  className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(item.id)}
                  className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <h3 className="text-lg font-bold mb-1 truncate">{item.name}</h3>
            <p className="text-xs text-gray-500 mb-4 line-clamp-2 min-h-[2rem]">{item.description || 'No description'}</p>

            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                  <Hash className="w-3 h-3" /> HSN
                </div>
                <span className="text-xs font-mono">{item.hsn || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                  <Tag className="w-3 h-3" /> GST Rate
                </div>
                <span className="text-xs font-bold text-orange-500">{item.gstRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                  <IndianRupee className="w-3 h-3" /> Rate
                </div>
                <span className="text-lg font-bold font-mono">₹{item.rate.toLocaleString()} <span className="text-[10px] text-gray-500 font-normal">/{item.unit}</span></span>
              </div>
              <button 
                onClick={() => {
                  if (!canCreateInvoice) {
                    openPricing();
                    return;
                  }
                  setSelectedProductForInvoice(item);
                  setIsInvoiceModalOpen(true);
                }}
                className="w-full mt-2 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-orange-500 hover:border-orange-500 hover:text-white transition-all flex items-center justify-center gap-2 group"
              >
                <FileText className="w-3 h-3 group-hover:scale-110 transition-transform" /> Invoice Banao
              </button>
            </div>
          </motion.div>
        ))}
        {filteredItems.length === 0 && (
          <div className="col-span-full py-20 text-center text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Koi item nahi mila.</p>
          </div>
        )}
      </div>

      {/* Manual Invoice Modal */}
      <ManualInvoiceModal 
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          setIsInvoiceModalOpen(false);
          setSelectedProductForInvoice(null);
        }}
        onSuccess={() => {
          setShowSuccess(true);
        }}
        initialProduct={selectedProductForInvoice || undefined}
      />

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#0C1020] border border-white/10 rounded-[2rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">{editingItem ? 'Item Edit Karo' : 'Naya Item Jodon'}</h2>
                <button onClick={closeModal} className="p-2 hover:bg-white/5 rounded-lg">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Item Naam *</label>
                  <input 
                    required
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="E.g. Leather Shoes" 
                    className="input-dark w-full" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Description</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Item ke baare mein kuch likho..." 
                    className="input-dark w-full h-20 resize-none" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">HSN Code</label>
                    <input 
                      type="text" 
                      value={formData.hsn}
                      onChange={(e) => setFormData({...formData, hsn: e.target.value})}
                      placeholder="6403" 
                      className="input-dark w-full" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Unit</label>
                    <select 
                      value={formData.unit}
                      onChange={(e) => setFormData({...formData, unit: e.target.value})}
                      className="input-dark w-full appearance-none"
                    >
                      <option value="pcs">Pieces (pcs)</option>
                      <option value="kg">Kilogram (kg)</option>
                      <option value="mtr">Meter (mtr)</option>
                      <option value="box">Box</option>
                      <option value="set">Set</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Rate (₹) *</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      value={formData.rate}
                      onChange={(e) => setFormData({...formData, rate: e.target.value})}
                      onFocus={(e) => e.target.select()}
                      placeholder="0.00" 
                      className="input-dark w-full" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">GST Rate (%) *</label>
                    <select 
                      required
                      value={formData.gstRate}
                      onChange={(e) => setFormData({...formData, gstRate: Number(e.target.value)})}
                      className="input-dark w-full appearance-none"
                    >
                      <option value={0}>0% (Exempt)</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn-orange w-full mt-4">
                  {editingItem ? 'Update Karo' : 'Item Save Karo'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ItemsPage;
