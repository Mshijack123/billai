import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Loader2, Check, AlertCircle, Edit2, Save, User, Package, Mic, MicOff, Image as ImageIcon, Camera, Upload, Trash2, ArrowLeft, FileText, Plus, Minus, Info } from 'lucide-react';
import { parseHindiPrompt, parseInvoiceImage, ParsedInvoice } from '../lib/gemini';
import { calculateGST, calculateGSTType, INDIAN_STATES } from '../lib/gst-calculator';
import { getLocalDateString, calculateDueDate } from '../lib/date-utils';
import { useFirebase } from './FirebaseProvider';
import { useInvoiceLimit } from '../hooks/useInvoiceLimit';
import { db, collection, addDoc, serverTimestamp, query, where, getDocs, handleFirestoreError, OperationType } from '../firebase';
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
  onUpgrade?: () => void;
  initialMode?: 'text' | 'image';
}

export const AIInvoiceModal: React.FC<AIInvoiceModalProps> = ({ isOpen, onClose, onSuccess, onUpgrade, initialMode = 'text' }) => {
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
  const [selectedImage, setSelectedImage] = useState<{ data: string, mimeType: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'image'>(initialMode);

  useEffect(() => {
    if (isOpen) {
      setInputMode(initialMode);
      setStep('input');
      setPrompt('');
      setSelectedImage(null);
      setImagePreview(null);
      setError(null);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (isOpen && profile) {
      fetchData();
    }
  }, [isOpen, profile]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setSelectedImage({
        data: base64String,
        mimeType: file.type
      });
      setImagePreview(reader.result as string);
      setPrompt(''); // Clear text prompt if image is selected
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const fetchData = async () => {
    if (!profile) return;
    try {
      const cSnap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', profile.uid)));
      setExistingCustomers(cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      
      const pSnap = await getDocs(query(collection(db, 'products'), where('businessId', '==', profile.uid)));
      setExistingProducts(pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'customers/products');
    }
  };

  const handleProcess = async () => {
    if (!prompt.trim() && !selectedImage) return;
    setStep('processing');
    setError(null);
    try {
      let result: ParsedInvoice;
      
      const productsContext = existingProducts.map(p => ({
        name: p.name,
        rate: p.rate,
        gstRate: p.gstRate
      }));

      if (selectedImage) {
        result = await parseInvoiceImage(selectedImage.data, selectedImage.mimeType, productsContext);
      } else {
        result = await parseHindiPrompt(prompt, productsContext);
      }
      
      // Manual fallback matching for products if AI didn't catch it or for extra safety
      const enrichedItems = result.items.map(item => {
        const match = existingProducts.find(p => 
          p.name.toLowerCase() === item.description.toLowerCase() ||
          item.description.toLowerCase().includes(p.name.toLowerCase())
        );
        
        if (match && (item.rate === 0 || !item.rate)) {
          return {
            ...item,
            rate: match.rate,
            gst_rate: match.gstRate
          };
        }
        return item;
      });

      setParsedData({ ...result, items: enrichedItems });
      
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
      if (onUpgrade) onUpgrade();
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
          phone: parsedData.customer_phone || '',
          address: parsedData.customer_address || '',
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

      const prefix = profile.invoiceSettings?.prefix || 'INV';
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const currentDate = new Date();

      const finalPaidAmount = parsedData.payment_status === 'paid' ? total : (parsedData.payment_status === 'partial' ? (parsedData.paid_amount || 0) : 0);
      const finalBalanceAmount = total - finalPaidAmount;

      const newInvoice: Omit<Invoice, 'id'> = {
        invoiceNumber: `${prefix}-${randomNum}`,
        businessId: profile.uid,
        customerId,
        customerName,
        customerGstin: matchedCustomer?.gstin || '',
        customerState: customerState,
        customerAddress: matchedCustomer?.address || parsedData.customer_address || '',
        customerPhone: matchedCustomer?.phone || parsedData.customer_phone || '',
        // Save business details at the time of creation
        businessName: profile.businessName || profile.displayName || '',
        businessAddress: profile.address || '',
        businessGstin: profile.gstin || '',
        businessPhone: profile.phone || '',
        businessEmail: profile.email || '',
        businessBankDetails: profile.bankDetails || null,
        businessLogoUrl: profile.invoiceSettings?.logoUrl || '',
        businessSignatureUrl: profile.invoiceSettings?.signatureUrl || '',
        date: getLocalDateString(currentDate),
        dueDate: calculateDueDate(currentDate, profile.invoiceSettings?.paymentTerms || 'Immediate'),
        items: invoiceItems,
        subtotal,
        cgst: gstType === 'CGST_SGST' ? totalGst / 2 : 0,
        sgst: gstType === 'CGST_SGST' ? totalGst / 2 : 0,
        igst: gstType === 'IGST' ? totalGst : 0,
        total,
        paidAmount: finalPaidAmount,
        balanceAmount: finalBalanceAmount,
        status: parsedData.payment_status,
        gstType,
        notes: profile.invoiceSettings?.defaultNotes || '',
        confirmedByUser: true,
        payments: parsedData.payment_status !== 'pending' ? [{
          id: Math.random().toString(36).substr(2, 9),
          amount: finalPaidAmount,
          date: currentDate.toISOString(),
          method: 'Cash',
          note: 'Initial payment'
        }] : [],
        createdAt: currentDate.toISOString()
      };

      await addDoc(collection(db, 'invoices'), {
        ...newInvoice,
        createdAt: serverTimestamp()
      });

      onSuccess();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'invoices');
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
        className="relative w-full max-w-3xl bg-[var(--bg-primary)] border border-orange-500/30 rounded-[2.5rem] shadow-2xl shadow-orange-500/10 overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between bg-gradient-to-r from-orange-500/5 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">AI Invoice Generator</h2>
              <p className="text-xs text-[var(--text-secondary)] font-medium">Scan photo ya voice se invoice banayein</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-xl transition-all group"
          >
            <X className="w-6 h-6 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" />
          </button>
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {step === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Mode Selector */}
                <div className="flex p-1 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-color)]">
                  <button
                    onClick={() => setInputMode('text')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
                      inputMode === 'text' ? "bg-orange-500 text-white shadow-lg" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <Mic className="w-4 h-4" /> Voice / Text
                  </button>
                  <button
                    onClick={() => setInputMode('image')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
                      inputMode === 'image' ? "bg-orange-500 text-white shadow-lg" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <ImageIcon className="w-4 h-4" /> Scan Bill Photo
                  </button>
                </div>

                {inputMode === 'text' ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Aapka Prompt</label>
                      <button 
                        onClick={toggleListening}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm",
                          isListening 
                            ? "bg-red-500 text-white animate-pulse" 
                            : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
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
                    <div className="relative group">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Example: 'Rohit ko 3 shoes ₹2000 each GST 18% unpaid'..."
                        className="w-full h-48 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[2rem] p-6 focus:outline-none focus:border-orange-500/50 transition-all resize-none text-lg leading-relaxed shadow-inner"
                      />
                      <div className="absolute bottom-4 right-6 flex gap-2">
                        {['हिंदी', 'Hinglish', 'English'].map(lang => (
                          <span key={lang} className="px-2 py-1 bg-[var(--bg-primary)] rounded-md text-[8px] font-bold text-[var(--text-secondary)] uppercase tracking-tighter">{lang}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Bill Photo Upload Karein</label>
                      {imagePreview && (
                        <button 
                          onClick={removeImage}
                          className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      )}
                    </div>

                    {imagePreview ? (
                      <div className="relative w-full aspect-[4/3] rounded-[2.5rem] overflow-hidden border border-[var(--border-color)] bg-[var(--bg-secondary)] group shadow-2xl">
                        <img src={imagePreview} alt="Bill Preview" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <label className="cursor-pointer p-4 bg-white/10 backdrop-blur-md rounded-full hover:bg-white/20 transition-all">
                            <Camera className="w-8 h-8 text-white" />
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed border-[var(--border-color)] rounded-[2.5rem] bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] hover:border-orange-500/30 transition-all cursor-pointer group">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Camera className="w-10 h-10 text-orange-500" />
                          </div>
                          <p className="mb-2 text-lg font-bold text-[var(--text-primary)]">Bill ki photo khichein</p>
                          <p className="text-sm text-[var(--text-secondary)]">Ya gallery se select karein (Max 5MB)</p>
                        </div>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
                      </label>
                    )}
                  </div>
                )}

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-500 text-sm"
                  >
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}

                <div className="flex items-center gap-4 pt-4">
                  <button 
                    onClick={handleProcess}
                    disabled={(!prompt.trim() && !selectedImage) || isSaving}
                    className="flex-1 btn-orange h-16 rounded-2xl text-lg font-bold flex items-center justify-center gap-3 shadow-lg shadow-orange-500/20 disabled:opacity-50"
                  >
                    <Sparkles className="w-6 h-6" />
                    AI se Invoice Banao
                  </button>
                </div>
                
                <div className="flex items-center justify-center gap-2 text-gray-600">
                  <Info className="w-4 h-4" />
                  <p className="text-[10px] font-medium uppercase tracking-widest">AI magic se items aur rate khud match ho jayenge</p>
                </div>
              </motion.div>
            )}

            {step === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-32 flex flex-col items-center justify-center text-center"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full animate-pulse" />
                  <Loader2 className="w-20 h-20 text-orange-500 animate-spin relative z-10" />
                </div>
                <h3 className="text-2xl font-bold mt-10 mb-2">Samajh raha hoon...</h3>
                <p className="text-gray-500 max-w-xs mx-auto">Bill AI aapka data extract kar raha hai. Isme kuch seconds lag sakte hain.</p>
              </motion.div>
            )}

            {step === 'preview' && parsedData && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <button 
                    onClick={() => setStep('input')}
                    className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-bold text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" /> Wapas Jao
                  </button>
                  <div className="bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-full flex items-center gap-2 text-green-500 text-xs font-bold uppercase tracking-widest">
                    <Check className="w-4 h-4" /> AI ne Draft taiyar kiya hai
                  </div>
                </div>

                <div className="bg-[var(--bg-secondary)]/50 border border-[var(--border-color)] rounded-[2.5rem] p-8 space-y-8 shadow-inner">
                  {/* Customer Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                          <User className="w-4 h-4 text-blue-500" />
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">Customer Details</p>
                      </div>
                      
                      <div className="space-y-4 pl-10">
                        <div>
                          <input 
                            type="text"
                            value={parsedData.customer_name}
                            onChange={(e) => setParsedData({ ...parsedData, customer_name: e.target.value })}
                            className="text-2xl font-bold tracking-tight bg-transparent border-b border-[var(--border-color)] focus:border-orange-500 outline-none w-full"
                            placeholder="Customer Name"
                          />
                          <div className="flex gap-4 mt-2">
                            <input 
                              type="text"
                              value={parsedData.customer_phone || ''}
                              onChange={(e) => setParsedData({ ...parsedData, customer_phone: e.target.value })}
                              className="text-xs text-[var(--text-secondary)] bg-transparent border-b border-[var(--border-color)] focus:border-orange-500 outline-none flex-1"
                              placeholder="Phone Number"
                            />
                            <input 
                              type="text"
                              value={parsedData.customer_address || ''}
                              onChange={(e) => setParsedData({ ...parsedData, customer_address: e.target.value })}
                              className="text-xs text-[var(--text-secondary)] bg-transparent border-b border-[var(--border-color)] focus:border-orange-500 outline-none flex-[2]"
                              placeholder="Address"
                            />
                          </div>
                          {matchedCustomer ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-md mt-1">
                              <Check className="w-3 h-3" /> Database Match
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded-md mt-1">
                              New Customer
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">Select Existing</p>
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
                            className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm focus:outline-none w-full focus:border-orange-500/30 transition-all"
                          >
                            <option value="">-- Naya Customer Banao --</option>
                            {existingCustomers.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                          <FileText className="w-4 h-4 text-purple-500" />
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">Invoice Settings</p>
                      </div>

                      <div className="space-y-4 pl-10">
                        <div className="space-y-2">
                          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">Customer State</p>
                          <select 
                            value={customerState}
                            onChange={(e) => setCustomerState(e.target.value)}
                            className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-sm font-bold focus:outline-none w-full focus:border-orange-500/30 transition-all"
                          >
                            {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">Payment Status</p>
                          <div className="flex gap-2">
                            {['paid', 'pending', 'partial'].map(status => (
                              <button
                                key={status}
                                onClick={() => {
                                  const total = parsedData.items.reduce((sum, item) => sum + (item.qty * item.rate * (1 + item.gst_rate / 100)), 0);
                                  setParsedData({
                                    ...parsedData, 
                                    payment_status: status as any,
                                    paid_amount: status === 'paid' ? total : (status === 'pending' ? 0 : parsedData.paid_amount)
                                  });
                                }}
                                className={cn(
                                  "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all",
                                  parsedData.payment_status === status 
                                    ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20" 
                                    : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
                                )}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                        <Package className="w-4 h-4 text-orange-500" />
                      </div>
                      <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">Items List</p>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-[var(--border-color)]">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[var(--bg-secondary)]">
                            <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest text-center">Qty</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest text-right">Rate</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                          {parsedData.items.map((item, i) => {
                            const isMatched = existingProducts.some(p => 
                              p.name.toLowerCase() === item.description.toLowerCase() ||
                              item.description.toLowerCase().includes(p.name.toLowerCase())
                            );
                            return (
                              <tr key={i} className="hover:bg-[var(--bg-primary)] transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[var(--text-primary)]">{item.description}</span>
                                    {isMatched && (
                                      <span className="text-[8px] font-bold text-blue-500 uppercase tracking-tighter mt-0.5">Matched from Inventory</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center font-mono text-[var(--text-secondary)]">{item.qty}</td>
                                <td className="px-6 py-4 text-right font-mono text-[var(--text-secondary)]">₹{item.rate}</td>
                                <td className="px-6 py-4 text-right font-mono font-bold text-[var(--text-primary)]">₹{(item.qty * item.rate).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Summary Section */}
                  <div className="flex flex-col md:flex-row justify-between gap-8 pt-8 border-t border-[var(--border-color)]">
                    <div className="flex-1 max-w-sm">
                      {parsedData.payment_status === 'partial' && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">Paid Amount (₹)</p>
                          <input 
                            type="number"
                            value={parsedData.paid_amount || 0}
                            onChange={(e) => setParsedData({...parsedData, paid_amount: Number(e.target.value)})}
                            className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-4 py-3 text-lg font-bold focus:outline-none w-full focus:border-orange-500/30 transition-all"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 max-w-xs space-y-3">
                      <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                        <span className="font-medium">Subtotal</span>
                        <span className="font-mono">₹{parsedData.items.reduce((sum, item) => sum + (item.qty * item.rate), 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                        <span className="font-medium">GST Total</span>
                        <span className="font-mono">₹{parsedData.items.reduce((sum, item) => sum + (item.qty * item.rate * (item.gst_rate / 100)), 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-[var(--border-color)]">
                        <span className="text-lg font-bold">Grand Total</span>
                        <span className="text-3xl font-black text-orange-500 font-mono tracking-tighter">
                          ₹{parsedData.items.reduce((sum, item) => sum + (item.qty * item.rate * (1 + item.gst_rate / 100)), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={handleConfirm}
                    disabled={isSaving}
                    className="flex-1 btn-orange h-16 rounded-2xl text-lg font-bold flex items-center justify-center gap-3 shadow-lg shadow-orange-500/20"
                  >
                    {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
                    Confirm & Save Invoice
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
