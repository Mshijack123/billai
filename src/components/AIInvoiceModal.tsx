import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Sparkles, 
  Loader2, 
  Check, 
  AlertCircle, 
  Save, 
  User, 
  Package, 
  Mic, 
  MicOff, 
  Image as ImageIcon, 
  Camera, 
  Trash2, 
  ArrowLeft, 
  FileText, 
  Plus, 
  Calendar,
  IndianRupee,
  Building2,
  Phone,
  MapPin,
  HelpCircle
} from 'lucide-react';
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

interface EditableItem {
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstRate: number;
}

interface AIInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (invoice?: Invoice) => void;
  onUpgrade?: () => void;
  initialMode?: 'text' | 'image';
}

export const AIInvoiceModal: React.FC<AIInvoiceModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  onUpgrade, 
  initialMode = 'text' 
}) => {
  const { profile } = useFirebase();
  const { canCreateInvoice } = useInvoiceLimit();
  const [step, setStep] = useState<'input' | 'processing' | 'preview'>('input');
  const [prompt, setPrompt] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'image'>(initialMode);
  const [isListening, setIsListening] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form & Preview State
  const [existingCustomers, setExistingCustomers] = useState<Customer[]>([]);
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  const [customerName, setCustomerName] = useState('Cash Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerState, setCustomerState] = useState('Rajasthan');

  const [invoiceDate, setInvoiceDate] = useState(getLocalDateString());
  const [dueDate, setDueDate] = useState(calculateDueDate(new Date(), profile?.invoiceSettings?.paymentTerms || 'Immediate'));
  const [invoiceNumberPreview, setInvoiceNumberPreview] = useState('');
  
  const [items, setItems] = useState<EditableItem[]>([
    { description: '', hsn: '', qty: 1, rate: 0, gstRate: 18 }
  ]);
  
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending' | 'partial'>('pending');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Suggestions for rapid test & ease of use
  const samplePrompts = [
    "Rahul ko 2 shoes ₹1500 each 18% GST pending",
    "Suresh Sharma 9876543210 5 shirts ₹800 paid cash",
    "Manoj Enterprises 10 cement bag ₹380 rate 28% GST baki",
    "Amit Verma 3 ceiling fan ₹1200 18% GST aadha advance diya ₹1800"
  ];

  useEffect(() => {
    if (isOpen) {
      setInputMode(initialMode);
      setStep('input');
      setPrompt('');
      setSelectedImage(null);
      setImagePreview(null);
      setError(null);
      setSelectedCustomerId('');
      
      const prefix = profile?.invoiceSettings?.prefix || 'INV';
      const rand = Math.floor(1000 + Math.random() * 9000);
      setInvoiceNumberPreview(`${prefix}-${rand}`);
      
      const now = new Date();
      setInvoiceDate(getLocalDateString(now));
      setDueDate(calculateDueDate(now, profile?.invoiceSettings?.paymentTerms || 'Immediate'));
      setNotes(profile?.invoiceSettings?.defaultNotes || '');
    }
  }, [isOpen, initialMode, profile]);

  useEffect(() => {
    if (isOpen && profile) {
      fetchCatalog();
    }
  }, [isOpen, profile]);

  const fetchCatalog = async () => {
    if (!profile) return;
    try {
      const cSnap = await getDocs(query(collection(db, 'customers'), where('businessId', '==', profile.uid)));
      setExistingCustomers(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
      
      const pSnap = await getDocs(query(collection(db, 'products'), where('businessId', '==', profile.uid)));
      setExistingProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'customers/products');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError('Photo size 8MB se kam honi chahiye.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setSelectedImage({
        data: base64String,
        mimeType: file.type || 'image/jpeg'
      });
      setImagePreview(reader.result as string);
      setPrompt('');
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Aapka browser voice recognition support nahi karta. Please Google Chrome use karein.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'hi-IN';
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

  // Process prompt or image with AI
  const handleProcess = async () => {
    if (!prompt.trim() && !selectedImage) {
      setError('Kripya bol kar, type kar ke prompt likhein ya bill ki photo upload karein.');
      return;
    }

    setStep('processing');
    setError(null);

    try {
      const productsContext = existingProducts.map(p => ({
        name: p.name,
        rate: p.rate,
        gstRate: p.gstRate,
        hsn: p.hsn
      }));

      let result: ParsedInvoice;
      if (selectedImage) {
        result = await parseInvoiceImage(selectedImage.data, selectedImage.mimeType, productsContext);
      } else {
        result = await parseHindiPrompt(prompt, productsContext);
      }

      // Populate parsed data into state
      setCustomerName(result.customer_name || 'Cash Customer');
      setCustomerPhone(result.customer_phone || '');
      setCustomerAddress(result.customer_address || '');
      setCustomerGstin(result.customer_gstin || '');
      if (result.customer_state) {
        setCustomerState(result.customer_state);
      } else if (profile?.state) {
        setCustomerState(profile.state);
      }

      // Check if matches an existing customer
      const matched = existingCustomers.find(c => 
        c.name.toLowerCase() === (result.customer_name || '').toLowerCase() ||
        (result.customer_phone && c.phone === result.customer_phone)
      );

      if (matched) {
        setSelectedCustomerId(matched.id);
        setCustomerState(matched.state || profile?.state || 'Rajasthan');
        if (matched.phone) setCustomerPhone(matched.phone);
        if (matched.address) setCustomerAddress(matched.address);
        if (matched.gstin) setCustomerGstin(matched.gstin);
      } else {
        setSelectedCustomerId('');
      }

      // Populate Items
      if (result.items && result.items.length > 0) {
        const mappedItems: EditableItem[] = result.items.map(it => {
          // Check if matches existing product in catalog
          const prodMatch = existingProducts.find(p => 
            p.name.toLowerCase() === it.description.toLowerCase() ||
            it.description.toLowerCase().includes(p.name.toLowerCase())
          );

          return {
            description: it.description || 'Item',
            hsn: it.hsn || prodMatch?.hsn || '',
            qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
            rate: Number(it.rate) > 0 ? Number(it.rate) : (prodMatch?.rate || 100),
            gstRate: it.gst_rate !== undefined ? Number(it.gst_rate) : (prodMatch?.gstRate ?? profile?.invoiceSettings?.defaultGstRate ?? 18)
          };
        });
        setItems(mappedItems);
      } else {
        setItems([{ description: 'General Goods', hsn: '', qty: 1, rate: 100, gstRate: 18 }]);
      }

      // Populate Payment status
      setPaymentStatus(result.payment_status || 'pending');
      if (result.payment_status === 'partial') {
        setPaidAmount(result.paid_amount || 0);
      }

      if (result.notes) {
        setNotes(result.notes);
      }

      setStep('preview');
    } catch (err: any) {
      console.error("AI Parsing Error:", err);
      setError(err.message || 'AI bill parse karne mein asafal raha. Kripya punah prayas karein.');
      setStep('input');
    }
  };

  // Existing customer selected
  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    if (!id) return;

    const customer = existingCustomers.find(c => c.id === id);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone || '');
      setCustomerAddress(customer.address || '');
      setCustomerState(customer.state || profile?.state || 'Rajasthan');
      setCustomerGstin(customer.gstin || '');
    }
  };

  // Item manipulation
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      { description: '', hsn: '', qty: 1, rate: 0, gstRate: profile?.invoiceSettings?.defaultGstRate ?? 18 }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setItems([{ description: '', hsn: '', qty: 1, rate: 0, gstRate: 18 }]);
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof EditableItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };

  const handleSelectProductForItem = (index: number, productId: string) => {
    const prod = existingProducts.find(p => p.id === productId);
    if (!prod) return;

    setItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        description: prod.name,
        hsn: prod.hsn || '',
        rate: prod.rate,
        gstRate: prod.gstRate
      };
      return updated;
    });
  };

  // Calculation logic
  const businessState = profile?.state || 'Rajasthan';
  const gstType = calculateGSTType(businessState, customerState);

  const calculatedItems = items.map(item => {
    const qty = Number(item.qty) || 0;
    const rate = Number(item.rate) || 0;
    const taxableAmount = qty * rate;
    const gstBreakup = calculateGST(taxableAmount, item.gstRate, gstType);
    const gstAmount = gstType === 'CGST_SGST' 
      ? gstBreakup.cgst + gstBreakup.sgst 
      : gstBreakup.igst;
    const total = taxableAmount + gstAmount;

    return {
      description: item.description,
      hsn: item.hsn,
      qty,
      rate,
      taxableAmount,
      gstRate: item.gstRate,
      gstAmount,
      total
    };
  });

  const subtotal = calculatedItems.reduce((acc, it) => acc + it.taxableAmount, 0);
  const totalGst = calculatedItems.reduce((acc, it) => acc + it.gstAmount, 0);
  const grandTotal = subtotal + totalGst;

  const cgstAmount = gstType === 'CGST_SGST' ? totalGst / 2 : 0;
  const sgstAmount = gstType === 'CGST_SGST' ? totalGst / 2 : 0;
  const igstAmount = gstType === 'IGST' ? totalGst : 0;

  const effectivePaidAmount = paymentStatus === 'paid' 
    ? grandTotal 
    : (paymentStatus === 'partial' ? Math.min(paidAmount, grandTotal) : 0);
  const balanceAmount = Math.max(0, grandTotal - effectivePaidAmount);

  // Save full invoice to Firestore
  const handleConfirmAndSave = async () => {
    if (!profile) return;

    if (!canCreateInvoice) {
      setError('Aapki monthly invoice limit khatam ho gayi hai. Kripya upgrade karein.');
      if (onUpgrade) onUpgrade();
      return;
    }

    if (!customerName.trim()) {
      setError('Customer ka naam likhna zaroori hai.');
      return;
    }

    const validItems = calculatedItems.filter(it => it.description.trim().length > 0 && it.qty > 0);
    if (validItems.length === 0) {
      setError('Kam se kam ek valid item (naam aur quantity ke sath) jodein.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let finalCustomerId = selectedCustomerId;

      // Create new customer if not selected from database
      if (!finalCustomerId) {
        const newCustomerRef = await addDoc(collection(db, 'customers'), {
          businessId: profile.uid,
          name: customerName.trim(),
          phone: customerPhone.trim(),
          address: customerAddress.trim(),
          gstin: customerGstin.trim(),
          state: customerState,
          createdAt: new Date().toISOString()
        });
        finalCustomerId = newCustomerRef.id;
      }

      const currentDate = new Date();

      const newInvoiceData: Omit<Invoice, 'id'> = {
        invoiceNumber: invoiceNumberPreview,
        businessId: profile.uid,
        customerId: finalCustomerId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerState: customerState,
        customerGstin: customerGstin.trim(),
        // Business details stamped for permanent accuracy
        businessName: profile.businessName || profile.displayName || 'Business',
        shopName: profile.shopName || '',
        businessAddress: profile.address || '',
        businessGstin: profile.gstin || '',
        businessPhone: profile.phone || '',
        businessEmail: profile.email || '',
        businessBankDetails: profile.bankDetails || undefined,
        businessLogoUrl: profile.invoiceSettings?.logoUrl || '',
        businessSignatureUrl: profile.invoiceSettings?.signatureUrl || '',
        date: invoiceDate,
        dueDate: dueDate,
        items: validItems,
        subtotal: Number(subtotal.toFixed(2)),
        cgst: Number(cgstAmount.toFixed(2)),
        sgst: Number(sgstAmount.toFixed(2)),
        igst: Number(igstAmount.toFixed(2)),
        total: Number(grandTotal.toFixed(2)),
        paidAmount: Number(effectivePaidAmount.toFixed(2)),
        balanceAmount: Number(balanceAmount.toFixed(2)),
        status: paymentStatus,
        gstType,
        notes: notes || profile.invoiceSettings?.defaultNotes || '',
        confirmedByUser: true,
        payments: effectivePaidAmount > 0 ? [{
          id: Math.random().toString(36).substring(2, 9),
          amount: Number(effectivePaidAmount.toFixed(2)),
          date: currentDate.toISOString(),
          method: 'Cash',
          note: paymentStatus === 'paid' ? 'Full payment' : 'Advance / Partial payment'
        }] : [],
        createdAt: currentDate.toISOString()
      };

      const docRef = await addDoc(collection(db, 'invoices'), {
        ...newInvoiceData,
        createdAt: serverTimestamp()
      });

      const createdInvoice: Invoice = {
        id: docRef.id,
        ...newInvoiceData
      };

      onSuccess(createdInvoice);
      onClose();
    } catch (err: any) {
      console.error("Save invoice error:", err);
      handleFirestoreError(err, OperationType.WRITE, 'invoices');
      setError('Invoice save karne mein takleef aayi: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4 md:p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-4xl bg-[var(--bg-primary)] border border-orange-500/30 rounded-2xl sm:rounded-[2rem] shadow-2xl shadow-orange-500/10 overflow-hidden flex flex-col max-h-[92vh] z-10 my-auto"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-[var(--border-color)] flex items-center justify-between bg-gradient-to-r from-orange-500/10 via-transparent to-transparent flex-shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-500/20 text-orange-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  {step === 'preview' ? 'Invoice Preview & Review' : 'AI Invoice Generator'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-500 text-white uppercase tracking-wider">
                  GST Ready
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] font-medium">
                {step === 'preview' 
                  ? 'Data check karein aur jarurat ho toh edit karein' 
                  : 'Voice, Hindi/English text prompt ya bill ki photo se naya bill banayein'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-xl transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Band Karein"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 md:p-8 overflow-y-auto flex-1 no-scrollbar space-y-6">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs sm:text-sm font-semibold flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {/* STEP 1: INPUT MODE */}
            {step === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Mode Selector Tabs */}
                <div className="flex p-1 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-color)]">
                  <button
                    onClick={() => setInputMode('text')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all",
                      inputMode === 'text' 
                        ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" 
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <Mic className="w-4 h-4" /> Voice / Text Prompt
                  </button>
                  <button
                    onClick={() => setInputMode('image')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all",
                      inputMode === 'image' 
                        ? "bg-orange-500 text-white shadow-md shadow-orange-500/20" 
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <ImageIcon className="w-4 h-4" /> Bill Photo Scan
                  </button>
                </div>

                {inputMode === 'text' ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        Aapka Bill Prompt (Hindi / Hinglish / English)
                      </label>
                      <button 
                        onClick={toggleListening}
                        className={cn(
                          "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all",
                          isListening 
                            ? "bg-red-500 text-white animate-pulse shadow-md shadow-red-500/20" 
                            : "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border border-orange-500/20"
                        )}
                      >
                        {isListening ? (
                          <>
                            <MicOff className="w-3.5 h-3.5" /> Sun raha hoon...
                          </>
                        ) : (
                          <>
                            <Mic className="w-3.5 h-3.5" /> Bol kar likhein
                          </>
                        )}
                      </button>
                    </div>

                    <div className="relative">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Udaharan: 'Rohit Sharma ko 2 formal shirt ₹900 each aur 1 jeans ₹1400 18% GST pending bill banayein'..."
                        className="w-full h-36 sm:h-44 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 focus:outline-none focus:border-orange-500/50 transition-all resize-none text-sm sm:text-base leading-relaxed text-[var(--text-primary)]"
                      />
                    </div>

                    {/* Quick Suggestions */}
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                        Teji se try karne ke liye click karein:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {samplePrompts.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPrompt(s)}
                            className="text-left text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-orange-500/40 text-[var(--text-secondary)] hover:text-orange-500 px-3 py-1.5 rounded-xl transition-all"
                          >
                            "{s}"
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        Purane Bill ya Parcha ki Photo
                      </label>
                      {imagePreview && (
                        <button 
                          onClick={removeImage}
                          className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hatao
                        </button>
                      )}
                    </div>

                    {imagePreview ? (
                      <div className="relative w-full h-64 sm:h-80 rounded-2xl overflow-hidden border border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-center group">
                        <img src={imagePreview} alt="Bill Preview" className="max-h-full max-w-full object-contain" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <label className="cursor-pointer px-4 py-2 bg-white/20 backdrop-blur-md rounded-xl text-white font-bold text-xs hover:bg-white/30 transition-all flex items-center gap-2">
                            <Camera className="w-4 h-4" /> Doosri Photo Dalein
                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--bg-secondary)] hover:border-orange-500/40 hover:bg-[var(--bg-primary)]/40 transition-all cursor-pointer group">
                        <div className="flex flex-col items-center justify-center p-6 text-center">
                          <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform text-orange-500">
                            <Camera className="w-8 h-8" />
                          </div>
                          <p className="text-sm sm:text-base font-bold text-[var(--text-primary)] mb-1">
                            Bill ya Parcha ki Photo Dalein
                          </p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Click karke photo upload karein (JPEG, PNG up to 8MB)
                          </p>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </label>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={inputMode === 'text' ? !prompt.trim() : !selectedImage}
                  className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-5 h-5" />
                  AI Se Invoice Generate Karein
                </button>
              </motion.div>
            )}

            {/* STEP 2: PROCESSING STATE */}
            {step === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="py-16 sm:py-24 text-center space-y-4"
              >
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto">
                  <div className="absolute inset-0 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
                  <div className="absolute inset-2 bg-orange-500/10 rounded-full flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-orange-500 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">
                    AI Invoice Taiyar Kar Raha Hai...
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                    Items, rate, GST calculation aur customer details analyze ho rahe hain.
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 3: PREVIEW & FULL EDITING */}
            {step === 'preview' && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Top Meta Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-color)]">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Invoice No.</span>
                    <p className="font-mono font-bold text-sm text-[var(--text-primary)]">{invoiceNumberPreview}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Invoice Date</span>
                    <input 
                      type="date" 
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none w-full cursor-pointer"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Due Date</span>
                    <input 
                      type="date" 
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none w-full cursor-pointer"
                    />
                  </div>
                </div>

                {/* Customer Details Box */}
                <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[var(--border-color)] pb-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-orange-500" />
                      <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        Customer Ki Jankari
                      </h4>
                    </div>
                    {/* Existing Customer Dropdown */}
                    {existingCustomers.length > 0 && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <select
                          value={selectedCustomerId}
                          onChange={(e) => handleSelectCustomer(e.target.value)}
                          className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] font-medium outline-none focus:border-orange-500/50 w-full sm:w-auto"
                        >
                          <option value="">-- Purane Customer Se Chunein --</option>
                          {existingCustomers.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.phone ? `(${c.phone})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Customer Name *</label>
                      <input 
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Customer ka naam"
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Phone Number</label>
                      <input 
                        type="text"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Mobile no. (Optional)"
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">State (GST Tax Type)</label>
                      <select
                        value={customerState}
                        onChange={(e) => setCustomerState(e.target.value)}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] outline-none focus:border-orange-500"
                      >
                        {INDIAN_STATES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Address / City</label>
                      <input 
                        type="text"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="Address ya Shahar ka naam"
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">GSTIN (Optional)</label>
                      <input 
                        type="text"
                        value={customerGstin}
                        onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                        placeholder="GST No."
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs sm:text-sm text-[var(--text-primary)] uppercase outline-none focus:border-orange-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Items Table Editor */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-orange-500" />
                      <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        Items & Calculation ({items.length})
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {existingProducts.length > 0 && (
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              const prod = existingProducts.find(p => p.id === e.target.value);
                              if (prod) {
                                setItems(prev => [
                                  ...prev,
                                  { description: prod.name, hsn: prod.hsn || '', qty: 1, rate: prod.rate, gstRate: prod.gstRate }
                                ]);
                              }
                              e.target.value = '';
                            }
                          }}
                          className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] outline-none"
                        >
                          <option value="">+ Catalog Se Item Jodein</option>
                          {existingProducts.map(p => (
                            <option key={p.id} value={p.id}>{p.name} (₹{p.rate})</option>
                          ))}
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Naya Item
                      </button>
                    </div>
                  </div>

                  {/* Desktop / Tablet Items Table */}
                  <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <table className="w-full text-left border-collapse min-w-[620px]">
                      <thead>
                        <tr className="border-b border-[var(--border-color)] bg-[var(--bg-primary)]/50 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                          <th className="p-3 pl-4">Item Name / Description</th>
                          <th className="p-3 w-20">HSN</th>
                          <th className="p-3 w-20 text-center">Qty</th>
                          <th className="p-3 w-28 text-right">Rate (₹)</th>
                          <th className="p-3 w-24 text-center">GST %</th>
                          <th className="p-3 w-28 text-right">Total (₹)</th>
                          <th className="p-3 w-12 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)]">
                        {items.map((item, idx) => {
                          const calc = calculatedItems[idx] || { taxableAmount: 0, total: 0 };
                          return (
                            <tr key={idx} className="hover:bg-[var(--bg-primary)]/40 transition-colors">
                              <td className="p-2 pl-4">
                                <input 
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                                  placeholder="Item ka naam..."
                                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-orange-500"
                                />
                              </td>
                              <td className="p-2">
                                <input 
                                  type="text"
                                  value={item.hsn}
                                  onChange={(e) => handleItemChange(idx, 'hsn', e.target.value)}
                                  placeholder="HSN"
                                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] outline-none focus:border-orange-500"
                                />
                              </td>
                              <td className="p-2">
                                <input 
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) => handleItemChange(idx, 'qty', Math.max(1, Number(e.target.value)))}
                                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs font-bold text-center text-[var(--text-primary)] outline-none focus:border-orange-500"
                                />
                              </td>
                              <td className="p-2">
                                <input 
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.rate}
                                  onChange={(e) => handleItemChange(idx, 'rate', Math.max(0, parseFloat(e.target.value) || 0))}
                                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs font-bold text-right font-mono text-[var(--text-primary)] outline-none focus:border-orange-500"
                                />
                              </td>
                              <td className="p-2">
                                <select
                                  value={item.gstRate}
                                  onChange={(e) => handleItemChange(idx, 'gstRate', Number(e.target.value))}
                                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-1.5 py-1.5 text-xs font-bold text-center text-[var(--text-primary)] outline-none focus:border-orange-500 cursor-pointer"
                                >
                                  <option value={0}>0%</option>
                                  <option value={5}>5%</option>
                                  <option value={12}>12%</option>
                                  <option value={18}>18%</option>
                                  <option value={28}>28%</option>
                                </select>
                              </td>
                              <td className="p-2 text-right font-mono font-bold text-xs text-[var(--text-primary)]">
                                ₹{calc.total.toFixed(2)}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="p-1.5 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  title="Item Delete Karein"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payment Status & Financial Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* Left: Payment Status & Notes */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        Payment Status
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['paid', 'pending', 'partial'] as const).map(st => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              setPaymentStatus(st);
                              if (st === 'paid') setPaidAmount(grandTotal);
                              if (st === 'pending') setPaidAmount(0);
                            }}
                            className={cn(
                              "py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all",
                              paymentStatus === st
                                ? (st === 'paid' 
                                    ? "bg-green-500 border-green-500 text-white shadow-md shadow-green-500/20" 
                                    : st === 'pending'
                                    ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/20"
                                    : "bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-500/20")
                                : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                            )}
                          >
                            {st === 'paid' ? 'Paid (Jama)' : (st === 'pending' ? 'Udhaar (Pending)' : 'Partial')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {paymentStatus === 'partial' && (
                      <div className="p-3 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] space-y-1">
                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">
                          Jama Rakam (Paid Amount ₹)
                        </label>
                        <input 
                          type="number"
                          min="0"
                          max={grandTotal}
                          value={paidAmount}
                          onChange={(e) => setPaidAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm font-mono font-bold text-[var(--text-primary)] outline-none focus:border-orange-500"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">
                        Invoice Notes / Shartein
                      </label>
                      <input 
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Udaharan: Maal wapas nahi hoga..."
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  {/* Right: Comprehensive GST Summary */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] space-y-3">
                    <div className="flex justify-between text-xs sm:text-sm text-[var(--text-secondary)]">
                      <span>Subtotal (Taxable Value)</span>
                      <span className="font-mono font-semibold text-[var(--text-primary)]">₹{subtotal.toFixed(2)}</span>
                    </div>

                    {gstType === 'CGST_SGST' ? (
                      <>
                        <div className="flex justify-between text-xs sm:text-sm text-[var(--text-secondary)]">
                          <span>CGST (Central Tax)</span>
                          <span className="font-mono text-[var(--text-primary)]">₹{cgstAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs sm:text-sm text-[var(--text-secondary)]">
                          <span>SGST (State Tax - {customerState})</span>
                          <span className="font-mono text-[var(--text-primary)]">₹{sgstAmount.toFixed(2)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-xs sm:text-sm text-[var(--text-secondary)]">
                        <span>IGST (Integrated Tax)</span>
                        <span className="font-mono text-[var(--text-primary)]">₹{igstAmount.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-xs sm:text-sm text-[var(--text-secondary)] pt-1 border-t border-[var(--border-color)]">
                      <span>Total GST Amount</span>
                      <span className="font-mono font-bold text-[var(--text-primary)]">₹{totalGst.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-[var(--border-color)]">
                      <span className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">Grand Total</span>
                      <span className="text-xl sm:text-2xl font-black text-orange-500 font-mono tracking-tight">
                        ₹{grandTotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs pt-2 border-t border-dashed border-[var(--border-color)]">
                      <span className="text-green-500 font-bold">Paid: ₹{effectivePaidAmount.toFixed(2)}</span>
                      <span className={cn("font-bold", balanceAmount > 0 ? "text-red-500 font-mono" : "text-[var(--text-secondary)]")}>
                        Balance: ₹{balanceAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Final Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[var(--border-color)]">
                  <button
                    type="button"
                    onClick={() => setStep('input')}
                    className="px-5 py-3 rounded-xl sm:rounded-2xl border border-[var(--border-color)] text-xs sm:text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] flex items-center justify-center gap-2 transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" /> Prompt Badlein
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmAndSave}
                    disabled={isSaving}
                    className="flex-1 py-3.5 sm:py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl sm:rounded-2xl text-sm sm:text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Invoice Save Ho Raha Hai...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Invoice Banayein Aur Dekhein ✨
                      </>
                    )}
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
