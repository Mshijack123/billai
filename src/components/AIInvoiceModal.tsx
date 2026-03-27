import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Loader2, Check, AlertCircle, Edit2, Save, User, Package, Mic, MicOff } from 'lucide-react';
import { parseHindiPrompt, ParsedInvoice } from '../lib/gemini';
import { calculateGST, calculateGSTType, INDIAN_STATES } from '../lib/gst-calculator';
import { useFirebase } from './FirebaseProvider';
import { useInvoiceLimit } from '../hooks/useInvoiceLimit';
import { db, collection, addDoc, serverTimestamp, query, where, getDocs } from '../firebase';
import { Invoice, InvoiceItem, Customer, Product } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AIInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AIInvoiceModal: React.FC<AIInvoiceModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { profile } = useFirebase();
  const { canCreateInvoice } = useInvoiceLimit();
  const [step, setStep] = useState<'input' | 'processing' | 'preview'>('input');
  const [prompt, setPrompt] = useState('');
  const [parsedData, setParsedData] = useState<ParsedInvoice | null>(null);
  const [customerState, setCustomerState] = useState('Rajasthan');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [existingCustomers, setExistingCustomers] = useState<Customer[]>([]);
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    if (isOpen && profile) {
      fetchData();
    }
  }, [isOpen, profile]);

  const fetchData = async () => {
    if (!profile) return;
    try {
      const cSnap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', profile.uid)));
      setExistingCustomers(cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      
      const pSnap = await getDocs(query(collection(db, 'products'), where('businessId', '==', profile.uid)));
      setExistingProducts(pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const handleProcess = async () => {
    if (!prompt.trim()) return;
    setStep('processing');
    setError(null);
    try {
      const result = await parseHindiPrompt(prompt);
      setParsedData(result);
      
      // Try to match customer
      const match = existingCustomers.find(c => 
        c.name.toLowerCase().includes(result.customer_name.toLowerCase()) ||
        result.customer_name.toLowerCase().includes(c.name.toLowerCase())
      );
      if (match) {
        setMatchedCustomer(match);
        setCustomerState(match.state);
      } else {
        setMatchedCustomer(null);
      }

      setStep('preview');
    } catch (err) {
      console.error(err);
      setError('AI could not understand the prompt. Please try again with more details.');
      setStep('input');
    }
  };

  const handleConfirm = async () => {
    if (!parsedData || !profile) return;
    if (!canCreateInvoice) {
      setError('Aapki monthly invoice limit (20) khatam ho gayi hai. Please upgrade karein.');
      return;
    }
    setIsSaving(true);
    try {
      let customerId = matchedCustomer?.id || 'temp-id';
      let customerName = matchedCustomer?.name || parsedData.customer_name;

      // If no matched customer, we might want to create one automatically
      if (!matchedCustomer) {
        const newCustomerRef = await addDoc(collection(db, 'customers'), {
          businessId: profile.uid,
          name: parsedData.customer_name,
          phone: '', // AI might not have parsed this
          state: customerState,
          createdAt: new Date().toISOString()
        });
        customerId = newCustomerRef.id;
      }
      
      const subtotal = parsedData.items.reduce((sum, item) => sum + (item.qty * item.rate), 0);
      const gstType = calculateGSTType(profile.state || 'Rajasthan', customerState);
      
      const invoiceItems: InvoiceItem[] = parsedData.items.map(item => {
        const itemSubtotal = item.qty * item.rate;
        const gst = calculateGST(itemSubtotal, item.gst_rate, gstType);
        return {
          description: item.description,
          qty: item.qty,
          rate: item.rate,
          taxableAmount: itemSubtotal,
          gstRate: item.gst_rate,
          gstAmount: gstType === 'CGST_SGST' ? gst.cgst + gst.sgst : gst.igst,
          total: gst.total
        };
      });

      const totalGst = invoiceItems.reduce((sum, item) => sum + item.gstAmount, 0);
      const total = subtotal + totalGst;

      // Calculate due date based on payment terms
      const getDueDate = (terms: string) => {
        const date = new Date();
        if (terms === '7 days') date.setDate(date.getDate() + 7);
        else if (terms === '15 days') date.setDate(date.getDate() + 15);
        else if (terms === '30 days') date.setDate(date.getDate() + 30);
        return date.toISOString().split('T')[0];
      };

      const prefix = profile.invoiceSettings?.prefix || 'INV';
      const randomNum = Math.floor(1000 + Math.random() * 9000);

      const newInvoice: Omit<Invoice, 'id'> = {
        invoiceNumber: `${prefix}-${randomNum}`,
        businessId: profile.uid,
        customerId,
        customerName,
        customerGstin: matchedCustomer?.gstin || '',
        customerState: customerState,
        customerAddress: matchedCustomer?.address || '',
        date: new Date().toISOString().split('T')[0],
        dueDate: getDueDate(profile.invoiceSettings?.paymentTerms || 'Immediate'),
        items: invoiceItems,
        subtotal,
        cgst: gstType === 'CGST_SGST' ? totalGst / 2 : 0,
        sgst: gstType === 'CGST_SGST' ? totalGst / 2 : 0,
        igst: gstType === 'IGST' ? totalGst : 0,
        total,
        status: parsedData.payment_status,
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
      setError('Failed to save invoice. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Aapka browser voice recognition support nahi karta. Please Chrome use karein.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'hi-IN'; // Default to Hindi
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt(prev => prev + (prev ? ' ' : '') + transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
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
        className="relative w-full max-w-2xl bg-[#0C1020] border border-orange-500/30 rounded-[2rem] shadow-2xl shadow-orange-500/10 overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">AI Invoice Generator</h2>
              <p className="text-xs text-gray-500">Hindi ya Hinglish mein likho</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {step === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Prompt Likho</label>
                    <button 
                      onClick={toggleListening}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                        isListening 
                          ? "bg-red-500 text-white animate-pulse" 
                          : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="w-3 h-3" /> Sun raha hoon...
                        </>
                      ) : (
                        <>
                          <Mic className="w-3 h-3" /> Bol kar likho
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Example: 'Rohit ko 3 shoes ₹2000 each GST 18% unpaid'..."
                    className="w-full h-40 bg-[#141C2E] border border-white/5 rounded-2xl p-4 focus:outline-none focus:border-orange-500/50 transition-all resize-none text-lg"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {['हिंदी', 'Hinglish', 'English'].map(lang => (
                    <span key={lang} className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-gray-500 uppercase tracking-widest">{lang}</span>
                  ))}
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-500 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button 
                  onClick={handleProcess}
                  disabled={!prompt.trim()}
                  className="btn-orange w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  AI se Process karo ✨
                </button>
              </motion.div>
            )}

            {step === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-20 flex flex-col items-center justify-center text-center"
              >
                <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-6" />
                <h3 className="text-xl font-bold mb-2">Samajh raha hoon...</h3>
                <p className="text-gray-500 text-sm">AI aapka prompt parse kar raha hai</p>
              </motion.div>
            )}

            {step === 'preview' && parsedData && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl flex items-center gap-3 text-green-500 text-sm mb-4">
                  <Check className="w-5 h-5 flex-shrink-0" />
                  AI ne samjha — Check karo:
                </div>

                <div className="glass p-6 rounded-2xl space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between gap-6">
                    <div className="flex-1 space-y-4">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Customer</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xl font-bold">{parsedData.customer_name}</p>
                          {matchedCustomer ? (
                            <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-md flex items-center gap-1">
                              <Check className="w-3 h-3" /> Matched
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded-md">
                              New Customer
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Select Existing (Optional)</p>
                        <select 
                          value={matchedCustomer?.id || ''}
                          onChange={(e) => {
                            const selected = existingCustomers.find(c => c.id === e.target.value);
                            if (selected) {
                              setMatchedCustomer(selected);
                              setCustomerState(selected.state);
                            } else {
                              setMatchedCustomer(null);
                            }
                          }}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none w-full"
                        >
                          <option value="">-- Naya Customer Banao --</option>
                          {existingCustomers.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Customer State</p>
                        <select 
                          value={customerState}
                          onChange={(e) => setCustomerState(e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none w-full"
                        >
                          {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Status</p>
                        <div className="flex gap-2">
                          {['paid', 'pending', 'partial'].map(status => (
                            <button
                              key={status}
                              onClick={() => setParsedData({...parsedData, payment_status: status as any})}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all",
                                parsedData.payment_status === status 
                                  ? "bg-orange-500 border-orange-500 text-white" 
                                  : "border-white/10 text-gray-500 hover:bg-white/5"
                              )}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Items</p>
                    {parsedData.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{item.description}</span>
                          <span className="text-xs text-gray-500">{item.qty} × ₹{item.rate} (GST {item.gst_rate}%)</span>
                        </div>
                        <span className="font-mono font-bold">₹{item.qty * item.rate}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-white/5 space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Subtotal</span>
                      <span className="font-mono">₹{parsedData.items.reduce((sum, item) => sum + (item.qty * item.rate), 0)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total Amount</span>
                      <span className="text-orange-500 font-mono">
                        ₹{parsedData.items.reduce((sum, item) => sum + (item.qty * item.rate * (1 + item.gst_rate / 100)), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setStep('input')}
                    className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                  <button 
                    onClick={handleConfirm}
                    disabled={isSaving}
                    className="flex-[2] btn-orange flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Confirm & Save
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
