import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Share2, Edit3, Printer, Loader2, CreditCard, History, Plus, Calendar as CalendarIcon, IndianRupee, Layout } from 'lucide-react';
import { Invoice, UserProfile, Payment } from '../types';
import { numberToWords } from '../lib/utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { db, doc, updateDoc } from '../firebase';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  profile: UserProfile | null;
  autoDownload?: boolean;
  onDownloadComplete?: () => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ 
  isOpen, 
  onClose, 
  invoice, 
  profile,
  autoDownload,
  onDownloadComplete
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [currentTemplate, setCurrentTemplate] = useState(profile?.invoiceSettings?.templateStyle || 'modern');

  React.useEffect(() => {
    if (isOpen && autoDownload && invoice) {
      const timer = setTimeout(() => {
        handleDownload();
        if (onDownloadComplete) onDownloadComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoDownload, invoice?.id]);

  if (!isOpen || !invoice || !profile) return null;

  const gstBreakup = invoice.items.reduce((acc: Record<string, any>, item) => {
    const hsn = item.hsn || 'N/A';
    if (!acc[hsn]) {
      acc[hsn] = {
        taxableAmount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        gstRate: item.gstRate
      };
    }
    acc[hsn].taxableAmount += item.taxableAmount;
    if (invoice.gstType === 'CGST_SGST') {
      acc[hsn].cgst += (item.gstAmount || 0) / 2;
      acc[hsn].sgst += (item.gstAmount || 0) / 2;
    } else {
      acc[hsn].igst += (item.gstAmount || 0);
    }
    return acc;
  }, {});

  const handleWhatsAppShare = () => {
    if (!invoice || !profile) return;
    
    // Create a detailed message for WhatsApp
    const message = `*TAX INVOICE: ${invoice.invoiceNumber}*\n` +
      `--------------------------\n` +
      `*From:* ${profile.businessName}\n` +
      `*To:* ${invoice.customerName}\n` +
      `*Date:* ${new Date(invoice.date).toLocaleDateString()}\n` +
      `--------------------------\n` +
      `*Items:*\n` +
      invoice.items.map(item => `- ${item.description}: ₹${item.total.toLocaleString()}`).join('\n') + `\n` +
      `--------------------------\n` +
      `*Total Amount: ₹${invoice.total.toLocaleString()}*\n` +
      `*Status:* ${invoice.status.toUpperCase()}\n` +
      `*Due Date:* ${new Date(invoice.dueDate).toLocaleDateString()}\n\n` +
      `*Bank Details:*\n` +
      `Bank: ${profile.bankDetails?.bankName || 'N/A'}\n` +
      `A/C: ${profile.bankDetails?.accountNumber || 'N/A'}\n` +
      `IFSC: ${profile.bankDetails?.ifsc || 'N/A'}\n\n` +
      `Thank you for your business!\n` +
      `_Generated via BillAI_`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    const element = document.getElementById('invoice-paper');
    if (!element) {
      alert('Invoice element not found. Please try again.');
      return;
    }

    setIsDownloading(true);
    try {
      // Use a slightly longer timeout to ensure everything is rendered
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('invoice-paper');
          if (clonedElement) {
            // Reset transforms for clean capture
            clonedElement.style.transform = 'none';
            clonedElement.style.scale = '1';
            clonedElement.style.margin = '0';
            clonedElement.style.position = 'relative';
            clonedElement.style.boxShadow = 'none';
            clonedElement.style.width = '1000px';
            clonedElement.style.height = 'auto';
            clonedElement.style.left = '0';
            clonedElement.style.top = '0';
            clonedElement.style.display = 'block';
            clonedElement.style.visibility = 'visible';
            
            // Force all elements to use standard color formats if they are using oklch
            const allElements = clonedElement.querySelectorAll('*');
            allElements.forEach((el: any) => {
              const style = window.getComputedStyle(el);
              if (style.color.includes('oklch')) el.style.color = '#1f2937';
              if (style.backgroundColor.includes('oklch')) el.style.backgroundColor = 'transparent';
              if (style.borderColor.includes('oklch')) el.style.borderColor = '#e5e7eb';
            });
          }
        }
      });
      
      if (!canvas) {
        throw new Error('Canvas generation failed');
      }

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const fileName = `Invoice-${invoice.invoiceNumber || invoice.id}.pdf`;
      pdf.save(fileName);
      console.log('PDF Downloaded successfully');
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      alert('PDF download failed: ' + (error.message || 'Unknown error. Please check if your browser blocks popups or large downloads.'));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!invoice || !paymentAmount || isNaN(Number(paymentAmount))) return;
    
    const amount = Number(paymentAmount);
    if (amount <= 0 || amount > (invoice.balanceAmount ?? invoice.total)) {
      alert('Invalid payment amount');
      return;
    }

    setIsSavingPayment(true);
    try {
      const newPayment: Payment = {
        id: Math.random().toString(36).substr(2, 9),
        amount,
        date: new Date().toISOString(),
        method: paymentMethod,
        note: paymentNote
      };

      const updatedPaidAmount = (invoice.paidAmount || 0) + amount;
      const updatedBalanceAmount = invoice.total - updatedPaidAmount;
      const updatedStatus = updatedBalanceAmount <= 0 ? 'paid' : 'partial';

      await updateDoc(doc(db, 'invoices', invoice.id), {
        paidAmount: updatedPaidAmount,
        balanceAmount: updatedBalanceAmount,
        status: updatedStatus,
        payments: [...(invoice.payments || []), newPayment]
      });

      // Update local state if needed, but usually we rely on onSnapshot in parent
      setIsRecordingPayment(false);
      setPaymentAmount('');
      setPaymentNote('');
    } catch (error) {
      console.error('Error recording payment:', error);
      alert('Failed to record payment');
    } finally {
      setIsSavingPayment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 overflow-y-auto">
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
        className="relative w-full max-w-4xl bg-[#0C1020] border border-white/10 sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between bg-[#0C1020] sticky top-0 z-10">
          <div className="flex items-center gap-2 sm:gap-4">
            <h2 className="text-sm sm:text-xl font-bold truncate max-w-[120px] sm:max-w-none">{invoice.invoiceNumber}</h2>
            <span className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-bold uppercase tracking-widest ${
              invoice.status === 'paid' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'
            }`}>
              {invoice.status}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-[10px] font-bold uppercase text-gray-500">Template</span>
              <select 
                value={currentTemplate}
                onChange={(e) => setCurrentTemplate(e.target.value as any)}
                className="bg-transparent text-[10px] font-bold text-orange-500 focus:outline-none cursor-pointer"
              >
                <option value="minimal">Minimal</option>
                <option value="classic">Classic</option>
                <option value="professional">Professional</option>
                <option value="modern">Modern</option>
              </select>
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-[10px] font-bold uppercase text-gray-500">Zoom</span>
              <input 
                type="range" 
                min="0.5" 
                max="1.5" 
                step="0.1" 
                value={zoom} 
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <span className="text-[10px] font-bold text-orange-500 w-8">{Math.round(zoom * 100)}%</span>
            </div>
            <button onClick={handlePrint} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white">
              <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button 
              onClick={handleDownload} 
              disabled={isDownloading}
              className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white disabled:opacity-50"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Download className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <button 
              onClick={handleWhatsAppShare}
              className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg transition-colors text-green-500 hover:bg-green-500/10"
              title="Share on WhatsApp"
            >
              <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="w-px h-4 sm:h-6 bg-white/10 mx-1 sm:mx-2" />
            <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Invoice Paper */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 bg-[#060810]/50 flex flex-col lg:flex-row gap-8 items-start justify-center">
          <div 
            className="relative flex-shrink-0"
            style={{ 
              width: `${1000 * zoom}px`,
              height: `${1414 * zoom}px`,
            }}
          >
            <div 
              id="invoice-paper" 
              className="bg-white text-black p-6 sm:p-12 rounded-sm shadow-2xl w-full min-w-[1000px] min-h-[1414px] flex flex-col print:shadow-none print:p-0 print:m-0 print:w-full origin-top-left absolute top-0 left-0"
              style={{ 
                transform: `scale(${zoom})`,
              }}
            >
              {/* Status Stamp moved to end of div for z-index purposes */}
            <style>{`
              #invoice-paper { 
                color: #000000 !important; 
                background-color: #ffffff !important; 
                font-family: ${
                  profile.invoiceSettings?.fontStyle === 'serif' 
                    ? "'Libre Baskerville', serif" 
                    : profile.invoiceSettings?.fontStyle === 'mono'
                    ? "'JetBrains Mono', monospace"
                    : "'Inter', sans-serif"
                };
              }
              #invoice-paper .theme-text { color: ${profile.invoiceSettings?.themeColor || '#f97316'} !important; }
              #invoice-paper .theme-bg { background-color: ${profile.invoiceSettings?.themeColor || '#f97316'} !important; }
              #invoice-paper .theme-border { border-color: ${profile.invoiceSettings?.themeColor || '#f97316'} !important; }
              #invoice-paper .text-gray-500 { color: #6b7280 !important; }
              #invoice-paper .text-gray-600 { color: #4b5563 !important; }
              #invoice-paper .text-gray-700 { color: #374151 !important; }
              #invoice-paper .text-gray-800 { color: #1f2937 !important; }
              #invoice-paper .text-gray-900 { color: #111827 !important; }
              #invoice-paper .text-gray-400 { color: #9ca3af !important; }
              #invoice-paper .bg-gray-50 { background-color: #f9fafb !important; }
              #invoice-paper .bg-gray-50\/50 { background-color: rgba(249, 250, 251, 0.5) !important; }
              #invoice-paper .bg-gray-100 { background-color: #f3f4f6 !important; }
              #invoice-paper .bg-gray-200 { background-color: #e5e7eb !important; }
              #invoice-paper .border-gray-50 { border-color: #f9fafb !important; }
              #invoice-paper .border-gray-100 { border-color: #f3f4f6 !important; }
              #invoice-paper .border-gray-200 { border-color: #e5e7eb !important; }
              #invoice-paper .border-gray-300 { border-color: #d1d5db !important; }
              
              /* Additional common colors to avoid oklch */
              #invoice-paper .text-black { color: #000000 !important; }
              #invoice-paper .bg-white { background-color: #ffffff !important; }
              #invoice-paper .text-white { color: #ffffff !important; }
              #invoice-paper .bg-black { background-color: #000000 !important; }
              #invoice-paper .text-green-500 { color: #22c55e !important; }
              #invoice-paper .text-amber-500 { color: #f59e0b !important; }
              #invoice-paper .text-orange-500 { color: #f97316 !important; }
              #invoice-paper .bg-orange-500 { background-color: #f97316 !important; }
              #invoice-paper .bg-orange-500\/10 { background-color: rgba(249, 115, 22, 0.1) !important; }
              #invoice-paper .border-black { border-color: #000000 !important; }
              #invoice-paper .divide-gray-100 > :not([hidden]) ~ :not([hidden]) { border-color: #f3f4f6 !important; }
              #invoice-paper .divide-gray-200 > :not([hidden]) ~ :not([hidden]) { border-color: #e5e7eb !important; }
              
              /* Ensure transparency doesn't use oklch */
              #invoice-paper .bg-transparent { background-color: transparent !important; }
              #invoice-paper .border-transparent { border-color: transparent !important; }
              
              /* Template Specific Styles */
              ${profile.invoiceSettings?.templateStyle === 'minimal' ? `
                #invoice-paper .rounded-2xl, #invoice-paper .rounded-3xl, #invoice-paper .rounded-[2rem] { border-radius: 0 !important; }
                #invoice-paper .bg-gray-50 { background-color: transparent !important; border-bottom: 1px solid #eee !important; }
              ` : ''}
              
              ${profile.invoiceSettings?.templateStyle === 'classic' ? `
                #invoice-paper .rounded-2xl, #invoice-paper .rounded-3xl, #invoice-paper .rounded-[2rem] { border-radius: 4px !important; }
                #invoice-paper .theme-bg { background-color: #333 !important; }
                #invoice-paper .theme-text { color: #000 !important; }
              ` : ''}

              ${profile.invoiceSettings?.templateStyle === 'professional' ? `
                #invoice-paper .rounded-2xl, #invoice-paper .rounded-3xl, #invoice-paper .rounded-[2rem] { border-radius: 0 !important; }
                #invoice-paper .theme-bg { background-color: #1a1a1a !important; color: white !important; }
                #invoice-paper .theme-text { color: #1a1a1a !important; }
                #invoice-paper .theme-border { border-color: #1a1a1a !important; }
              ` : ''}
            `}</style>
            
            {/* Template Layouts */}
            {currentTemplate === 'minimal' ? (
              <div className="flex flex-col h-full">
                {/* Minimal Header */}
                <div className="flex justify-between items-start mb-16 border-b-2 border-black pb-8">
                  <div>
                    <h1 className="text-4xl font-light tracking-widest uppercase mb-4">{invoice.businessName || profile.businessName || profile.displayName || 'Your Business Name'}</h1>
                    <div className="text-[10px] text-gray-500 space-y-1">
                      <p>{invoice.businessAddress || profile.address || 'Your Business Address'}</p>
                      <p>GSTIN: {invoice.businessGstin || profile.gstin || 'N/A'}</p>
                      <p>PH: {invoice.businessPhone || profile.phone || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-6xl font-thin tracking-tighter mb-4">INVOICE</h2>
                    <p className="text-sm font-bold">#{invoice.invoiceNumber}</p>
                    <p className="text-xs text-gray-500">{new Date(invoice.date).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-20 mb-16">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Client</h4>
                    <h3 className="text-xl font-medium mb-2">{invoice.customerName}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{invoice.customerAddress}</p>
                  </div>
                  <div className="text-right">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4 border-b border-gray-200 pb-2">Details</h4>
                    <div className="text-xs space-y-2">
                      <p><span className="text-gray-400">Due Date:</span> {new Date(invoice.dueDate).toLocaleDateString()}</p>
                      <p><span className="text-gray-400">Place:</span> {invoice.customerState}</p>
                    </div>
                  </div>
                </div>

                <table className="w-full mb-16">
                  <thead>
                    <tr className="border-b border-black text-[10px] uppercase tracking-widest text-left">
                      <th className="py-4 font-bold">Description</th>
                      <th className="py-4 text-center font-bold">Qty</th>
                      <th className="py-4 text-right font-bold">Rate</th>
                      <th className="py-4 text-right font-bold">GST</th>
                      <th className="py-4 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoice.items.map((item, i) => (
                      <tr key={i} className="text-sm">
                        <td className="py-6">
                          <p className="font-medium">{item.description}</p>
                          <p className="text-[10px] text-gray-400">HSN: {item.hsn || 'N/A'}</p>
                        </td>
                        <td className="py-6 text-center">{item.qty}</td>
                        <td className="py-6 text-right">₹{item.rate.toLocaleString()}</td>
                        <td className="py-6 text-right">{item.gstRate}%</td>
                        <td className="py-6 text-right font-bold">₹{item.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* GST Breakup Table */}
                <div className="mb-12">
                  <h5 className="text-[10px] font-bold uppercase text-gray-400 mb-2">GST Breakup</h5>
                  <table className="w-full text-[9px] border-collapse border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-200 p-1 text-left">HSN/SAC</th>
                        <th className="border border-gray-200 p-1 text-right">Taxable Value</th>
                        {invoice.gstType === 'CGST_SGST' ? (
                          <>
                            <th className="border border-gray-200 p-1 text-right">CGST</th>
                            <th className="border border-gray-200 p-1 text-right">SGST</th>
                          </>
                        ) : (
                          <th className="border border-gray-200 p-1 text-right">IGST</th>
                        )}
                        <th className="border border-gray-200 p-1 text-right">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(gstBreakup).map(([hsn, data]: [string, any]) => (
                        <tr key={hsn}>
                          <td className="border border-gray-200 p-1">{hsn}</td>
                          <td className="border border-gray-200 p-1 text-right">₹{data.taxableAmount.toLocaleString()}</td>
                          {invoice.gstType === 'CGST_SGST' ? (
                            <>
                              <td className="border border-gray-200 p-1 text-right">₹{data.cgst.toLocaleString()} ({data.gstRate/2}%)</td>
                              <td className="border border-gray-200 p-1 text-right">₹{data.sgst.toLocaleString()} ({data.gstRate/2}%)</td>
                            </>
                          ) : (
                            <td className="border border-gray-200 p-1 text-right">₹{data.igst.toLocaleString()} ({data.gstRate}%)</td>
                          )}
                          <td className="border border-gray-200 p-1 text-right font-bold">₹{(data.cgst + data.sgst + data.igst).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-20">
                  <div className="text-[10px] text-gray-400 space-y-4">
                    <div>
                      <h5 className="font-bold text-black mb-1">Payment Info</h5>
                      <p>{invoice.businessBankDetails?.bankName || profile.bankDetails?.bankName}</p>
                      <p>A/C: {invoice.businessBankDetails?.accountNumber || profile.bankDetails?.accountNumber}</p>
                      <p>IFSC: {invoice.businessBankDetails?.ifsc || profile.bankDetails?.ifsc}</p>
                    </div>
                    <p className="italic">"{numberToWords(Math.floor(invoice.total))} Only"</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Subtotal</span>
                      <span>₹{invoice.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Tax</span>
                      <span>₹{(invoice.cgst + invoice.sgst + invoice.igst).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xl font-light pt-4 border-t border-black">
                      <span>Total</span>
                      <span className="font-bold">₹{invoice.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-2">
                      <span className="text-gray-400">Paid Amount</span>
                      <span>₹{(invoice.paidAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-100">
                      <span>Balance Due</span>
                      <span>₹{(invoice.balanceAmount ?? invoice.total).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : currentTemplate === 'classic' ? (
              <div className="flex flex-col h-full border-4 border-double theme-border p-4">
                {/* Classic Header */}
                <div className="text-center mb-10 border-b theme-border pb-6">
                  <h1 className="text-3xl font-bold uppercase mb-2">{invoice.businessName || profile.businessName || profile.displayName || 'Your Business Name'}</h1>
                  <p className="text-sm text-gray-600">{invoice.businessAddress || profile.address || 'Your Business Address'}</p>
                  <p className="text-xs text-gray-500 mt-1">GSTIN: {invoice.businessGstin || profile.gstin || 'N/A'} | Phone: {invoice.businessPhone || profile.phone || 'N/A'}</p>
                </div>

                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold underline decoration-double underline-offset-4 theme-text">TAX INVOICE</h2>
                </div>

                <div className="grid grid-cols-2 border theme-border mb-8">
                  <div className="p-4 border-r theme-border">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Billed To:</p>
                    <h3 className="text-lg font-bold">{invoice.customerName}</h3>
                    <p className="text-xs text-gray-600 mt-1">{invoice.customerAddress}</p>
                    <p className="text-xs font-bold mt-2">GSTIN: {invoice.customerGstin}</p>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold">Invoice No:</span>
                      <span>{invoice.invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-bold">Date:</span>
                      <span>{new Date(invoice.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-bold">Due Date:</span>
                      <span>{new Date(invoice.dueDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-bold">Place of Supply:</span>
                      <span>{invoice.customerState}</span>
                    </div>
                  </div>
                </div>

                <table className="w-full border-collapse border theme-border mb-8">
                  <thead>
                    <tr className="bg-gray-100 text-[10px] font-bold uppercase">
                      <th className="border theme-border px-2 py-2 text-center">S.No</th>
                      <th className="border theme-border px-2 py-2 text-left">Description</th>
                      <th className="border theme-border px-2 py-2 text-center">HSN</th>
                      <th className="border theme-border px-2 py-2 text-center">Qty</th>
                      <th className="border theme-border px-2 py-2 text-right">Rate</th>
                      <th className="border theme-border px-2 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, i) => (
                      <tr key={i} className="text-xs">
                        <td className="border theme-border px-2 py-3 text-center">{i + 1}</td>
                        <td className="border theme-border px-2 py-3 font-bold">{item.description}</td>
                        <td className="border theme-border px-2 py-3 text-center">{item.hsn}</td>
                        <td className="border theme-border px-2 py-3 text-center">{item.qty}</td>
                        <td className="border theme-border px-2 py-3 text-right">₹{item.rate.toLocaleString()}</td>
                        <td className="border theme-border px-2 py-3 text-right font-bold">₹{item.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="space-y-4">
                    <div className="border theme-border p-3 rounded">
                      <p className="text-[10px] font-bold uppercase mb-2">Bank Details:</p>
                      <p className="text-xs">Bank: {invoice.businessBankDetails?.bankName || profile.bankDetails?.bankName}</p>
                      <p className="text-xs">A/C: {invoice.businessBankDetails?.accountNumber || profile.bankDetails?.accountNumber}</p>
                      <p className="text-xs">IFSC: {invoice.businessBankDetails?.ifsc || profile.bankDetails?.ifsc}</p>
                    </div>
                    <p className="text-xs italic">Amount in words: {numberToWords(Math.floor(invoice.total))} Only</p>
                  </div>
                  <div className="border theme-border">
                    <div className="p-2 flex justify-between text-xs border-b theme-border">
                      <span>Subtotal:</span>
                      <span>₹{invoice.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="p-2 flex justify-between text-xs border-b theme-border">
                      <span>Total Tax:</span>
                      <span>₹{(invoice.cgst + invoice.sgst + invoice.igst).toLocaleString()}</span>
                    </div>
                    <div className="p-2 flex justify-between text-sm font-bold bg-gray-100">
                      <span>Grand Total:</span>
                      <span>₹{invoice.total.toLocaleString()}</span>
                    </div>
                    <div className="p-2 flex justify-between text-xs border-t theme-border">
                      <span>Paid Amount:</span>
                      <span>₹{(invoice.paidAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="p-2 flex justify-between text-sm font-bold bg-gray-200">
                      <span>Balance Due:</span>
                      <span>₹{(invoice.balanceAmount ?? invoice.total).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto flex justify-between items-end pt-10">
                  <div className="text-[10px] text-gray-500">
                    <p>* This is a computer generated invoice.</p>
                  </div>
                  <div className="text-center border-t theme-border pt-2 w-48">
                    <p className="text-[10px] font-bold uppercase tracking-widest">Authorized Signatory</p>
                  </div>
                </div>
              </div>
            ) : currentTemplate === 'professional' ? (
              <div className="flex flex-col h-full bg-white">
                {/* Professional Header */}
                <div className="flex justify-between items-start mb-12 border-b-4 border-black pb-8">
                  <div className="flex items-center gap-6">
                    {(invoice.businessLogoUrl || profile.invoiceSettings?.logoUrl) ? (
                      <img 
                        src={invoice.businessLogoUrl || profile.invoiceSettings?.logoUrl} 
                        alt="Logo" 
                        className="w-24 h-24 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-24 h-24 bg-black flex items-center justify-center font-bold text-white text-4xl">
                        {(invoice.businessName || profile.businessName)?.charAt(0) || 'B'}
                      </div>
                    )}
                    <div>
                      <h1 className="text-3xl font-bold uppercase tracking-tight mb-1">{invoice.businessName || profile.businessName || profile.displayName || 'Your Business Name'}</h1>
                      <p className="text-xs text-gray-600 max-w-[300px] leading-relaxed">{invoice.businessAddress || profile.address || 'Your Business Address'}</p>
                      <div className="mt-2 text-[10px] font-bold space-y-0.5">
                        <p>GSTIN: {invoice.businessGstin || profile.gstin || 'N/A'}</p>
                        <p>PH: {invoice.businessPhone || profile.phone || 'N/A'}</p>
                        <p>EMAIL: {invoice.businessEmail || profile.email || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-4xl font-black mb-4">TAX INVOICE</h2>
                    <div className="text-sm space-y-1">
                      <p><span className="text-gray-500 font-bold uppercase text-[10px]">Invoice No:</span> <span className="font-bold">{invoice.invoiceNumber}</span></p>
                      <p><span className="text-gray-500 font-bold uppercase text-[10px]">Date:</span> <span className="font-bold">{new Date(invoice.date).toLocaleDateString()}</span></p>
                      <p><span className="text-gray-500 font-bold uppercase text-[10px]">Due Date:</span> <span className="font-bold">{new Date(invoice.dueDate).toLocaleDateString()}</span></p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-12 mb-12">
                  <div className="border-l-4 border-black pl-6">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Bill To</h4>
                    <h3 className="text-xl font-bold mb-2">{invoice.customerName}</h3>
                    <p className="text-xs text-gray-600 leading-relaxed mb-4">{invoice.customerAddress}</p>
                    {invoice.customerGstin && (
                      <p className="text-[10px] font-bold">GSTIN: {invoice.customerGstin}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Ship To / Place of Supply</h4>
                    <p className="text-lg font-bold mb-1">{invoice.customerState}</p>
                    <p className="text-xs text-gray-500">GST Type: {invoice.gstType}</p>
                  </div>
                </div>

                <table className="w-full mb-12 border-collapse">
                  <thead>
                    <tr className="bg-black text-white text-[10px] font-bold uppercase tracking-widest">
                      <th className="px-4 py-4 text-left">Description</th>
                      <th className="px-4 py-4 text-center">HSN</th>
                      <th className="px-4 py-4 text-center">Qty</th>
                      <th className="px-4 py-4 text-right">Rate</th>
                      <th className="px-4 py-4 text-right">GST%</th>
                      <th className="px-4 py-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="border-b-2 border-black">
                    {invoice.items.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-4 py-5">
                          <p className="font-bold text-sm">{item.description}</p>
                        </td>
                        <td className="px-4 py-5 text-center text-xs font-mono">{item.hsn || 'N/A'}</td>
                        <td className="px-4 py-5 text-center text-xs font-bold">{item.qty}</td>
                        <td className="px-4 py-5 text-right text-xs font-mono">₹{item.rate.toLocaleString()}</td>
                        <td className="px-4 py-5 text-right text-xs font-bold">{item.gstRate}%</td>
                        <td className="px-4 py-5 text-right text-sm font-bold font-mono">₹{item.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* GST Breakup Table */}
                <div className="mb-8">
                  <h5 className="text-[10px] font-bold uppercase text-gray-400 mb-2">GST Breakup Summary</h5>
                  <table className="w-full text-[9px] border-collapse border theme-border">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border theme-border p-1 text-left">HSN/SAC</th>
                        <th className="border theme-border p-1 text-right">Taxable Value</th>
                        {invoice.gstType === 'CGST_SGST' ? (
                          <>
                            <th className="border theme-border p-1 text-right">CGST</th>
                            <th className="border theme-border p-1 text-right">SGST</th>
                          </>
                        ) : (
                          <th className="border theme-border p-1 text-right">IGST</th>
                        )}
                        <th className="border theme-border p-1 text-right">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(gstBreakup).map(([hsn, data]: [string, any]) => (
                        <tr key={hsn}>
                          <td className="border theme-border p-1">{hsn}</td>
                          <td className="border theme-border p-1 text-right">₹{data.taxableAmount.toLocaleString()}</td>
                          {invoice.gstType === 'CGST_SGST' ? (
                            <>
                              <td className="border theme-border p-1 text-right">₹{data.cgst.toLocaleString()}</td>
                              <td className="border theme-border p-1 text-right">₹{data.sgst.toLocaleString()}</td>
                            </>
                          ) : (
                            <td className="border theme-border p-1 text-right">₹{data.igst.toLocaleString()}</td>
                          )}
                          <td className="border theme-border p-1 text-right font-bold">₹{(data.cgst + data.sgst + data.igst).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-2 gap-12">
                  <div>
                    <div className="mb-8 flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <h5 className="text-[10px] font-bold uppercase text-gray-500 mb-3">Bank Details</h5>
                        <div className="text-xs space-y-1 font-medium">
                          <p><span className="text-gray-400 uppercase text-[9px]">Bank:</span> {profile.bankDetails?.bankName}</p>
                          <p><span className="text-gray-400 uppercase text-[9px]">A/C:</span> {profile.bankDetails?.accountNumber}</p>
                          <p><span className="text-gray-400 uppercase text-[9px]">IFSC:</span> {profile.bankDetails?.ifsc}</p>
                        </div>
                      </div>
                      {profile.bankDetails?.upiId && (
                        <div className="text-center">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`upi://pay?pa=${profile.bankDetails.upiId}&pn=${profile.businessName}&am=${invoice.total}&cu=INR`)}`} 
                            alt="UPI QR"
                            className="w-20 h-20 mb-1 border-2 border-black p-1 bg-white"
                            referrerPolicy="no-referrer"
                          />
                          <p className="text-[8px] font-bold uppercase tracking-tighter">Scan to Pay</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold uppercase text-gray-500 mb-2">Total in Words</h5>
                      <p className="text-xs font-bold italic text-gray-700">{numberToWords(Math.floor(invoice.total))} Only</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-bold uppercase text-[10px]">Subtotal</span>
                      <span className="font-bold">₹{invoice.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-bold uppercase text-[10px]">Total Tax</span>
                      <span className="font-bold">₹{(invoice.cgst + invoice.sgst + invoice.igst).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-6 border-t-4 border-black">
                      <span className="text-xl font-black uppercase">Total Amount</span>
                      <span className="text-3xl font-black">₹{invoice.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[10px] font-bold uppercase text-gray-500">Paid Amount</span>
                      <span className="text-lg font-bold">₹{(invoice.paidAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                      <span className="text-[10px] font-bold uppercase text-gray-500">Balance Due</span>
                      <span className="text-xl font-black">₹{(invoice.balanceAmount ?? invoice.total).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-16 flex justify-between items-end">
                  <div className="text-[9px] text-gray-400 max-w-[300px]">
                    <p className="font-bold text-black mb-1 uppercase tracking-widest">Notes & Terms</p>
                    <p>{profile.invoiceSettings?.defaultNotes}</p>
                    <p className="mt-4 font-bold text-black">Generated by BillAI - Professional Invoicing</p>
                  </div>
                  <div className="text-center">
                    <div className="w-48 h-20 border-b-2 border-black mb-2 flex items-center justify-center overflow-hidden">
                      {(invoice.businessSignatureUrl || profile.invoiceSettings?.signatureUrl) ? (
                        <img 
                          src={invoice.businessSignatureUrl || profile.invoiceSettings?.signatureUrl} 
                          alt="Signature" 
                          className="max-w-full max-h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="italic text-gray-300">Signature</span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest">Authorized Signatory</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Modern Header (Default) */}
                <div className="flex justify-between items-start mb-12">
                  <div className="flex items-start gap-6">
                    {(invoice.businessLogoUrl || profile.invoiceSettings?.logoUrl) ? (
                      <img 
                        src={invoice.businessLogoUrl || profile.invoiceSettings?.logoUrl} 
                        alt="Logo" 
                        className="w-20 h-20 object-contain rounded-xl"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-20 h-20 theme-bg rounded-2xl flex items-center justify-center font-bold text-white text-3xl shadow-lg">
                        {(invoice.businessName || profile.businessName)?.charAt(0) || 'B'}
                      </div>
                    )}
                    <div>
                      <h1 className="text-2xl font-bold mb-1 tracking-tight">{invoice.businessName || profile.businessName || profile.displayName || 'Your Business Name'}</h1>
                      <p className="text-[11px] text-gray-500 max-w-[300px] leading-relaxed font-medium">{invoice.businessAddress || profile.address || 'Your Business Address'}</p>
                      <div className="mt-4 space-y-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-300 rounded-full" /> GSTIN: <span className="text-black font-mono">{invoice.businessGstin || profile.gstin || 'N/A'}</span>
                        </p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                          <span className="w-1 h-1 bg-gray-300 rounded-full" /> Phone: <span className="text-black">{invoice.businessPhone || profile.phone || 'N/A'}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-4xl font-black theme-text mb-4 tracking-tighter">INVOICE</h2>
                    <div className="inline-block bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between gap-6">
                          <span className="text-gray-400 font-bold uppercase text-[8px] tracking-widest">Number</span>
                          <span className="font-bold font-mono">{invoice.invoiceNumber}</span>
                        </div>
                        <div className="flex justify-between gap-6">
                          <span className="text-gray-400 font-bold uppercase text-[8px] tracking-widest">Date</span>
                          <span className="font-bold">{new Date(invoice.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-10">
                  <div className="bg-gray-50/30 p-6 rounded-3xl border border-gray-100/50">
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 theme-bg rounded-full" /> Bill To
                    </p>
                    <h3 className="text-lg font-bold mb-1">{invoice.customerName}</h3>
                    <p className="text-[11px] text-gray-500 max-w-[250px] leading-relaxed font-medium">{invoice.customerAddress || 'No address provided'}</p>
                    {invoice.customerGstin && (
                      <p className="text-[9px] font-bold mt-3 uppercase tracking-widest text-gray-400">GSTIN: <span className="text-black font-mono">{invoice.customerGstin}</span></p>
                    )}
                  </div>
                  <div className="bg-gray-50/30 p-6 rounded-3xl border border-gray-100/50 text-right">
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-2 justify-end">
                      Place of Supply <span className="w-1.5 h-1.5 theme-bg rounded-full" />
                    </p>
                    <p className="text-base font-bold mb-1">{invoice.customerState || 'N/A'}</p>
                    <div className="mt-3">
                      <p className="text-[8px] text-gray-400 uppercase tracking-widest font-bold">Tax Type</p>
                      <p className="text-[10px] font-bold theme-text">{invoice.gstType.replace('_', ' & ')}</p>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-900 text-white text-[8px] font-bold uppercase tracking-widest">
                        <th className="px-4 py-3 rounded-tl-xl">#</th>
                        <th className="px-4 py-3">Item Description</th>
                        <th className="px-4 py-3">HSN</th>
                        <th className="px-4 py-3 text-center">Qty</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Taxable</th>
                        <th className="px-4 py-3 text-center">GST</th>
                        <th className="px-4 py-3 text-right rounded-tr-xl">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 border-b border-gray-200">
                      {invoice.items.map((item, i) => (
                        <tr key={i} className="text-[11px] hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-4 text-center text-gray-400 font-bold">{i + 1}</td>
                          <td className="px-4 py-4 font-bold text-gray-900">{item.description}</td>
                          <td className="px-4 py-4 font-mono text-gray-400 text-[10px]">{item.hsn || '---'}</td>
                          <td className="px-4 py-4 text-center font-bold">{item.qty}</td>
                          <td className="px-4 py-4 text-right font-mono">₹{item.rate.toLocaleString()}</td>
                          <td className="px-4 py-4 text-right font-mono">₹{item.taxableAmount.toLocaleString()}</td>
                          <td className="px-4 py-4 text-center font-bold">{item.gstRate}%</td>
                          <td className="px-4 py-4 text-right font-bold font-mono text-gray-900">₹{item.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* GST Breakup Table */}
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-3 theme-bg rounded-full" />
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">GST Analysis</h5>
                  </div>
                  <div className="bg-gray-50/30 rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-[9px] border-collapse">
                      <thead>
                        <tr className="bg-gray-900 text-white">
                          <th className="px-3 py-2 text-left">HSN/SAC</th>
                          <th className="px-3 py-2 text-right">Taxable Value</th>
                          {invoice.gstType === 'CGST_SGST' ? (
                            <>
                              <th className="px-3 py-2 text-right">CGST</th>
                              <th className="px-3 py-2 text-right">SGST</th>
                            </>
                          ) : (
                            <th className="px-3 py-2 text-right">IGST</th>
                          )}
                          <th className="px-3 py-2 text-right">Total Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Object.entries(gstBreakup).map(([hsn, data]: [string, any]) => (
                          <tr key={hsn}>
                            <td className="px-3 py-2 font-mono">{hsn}</td>
                            <td className="px-3 py-2 text-right font-mono">₹{data.taxableAmount.toLocaleString()}</td>
                            {invoice.gstType === 'CGST_SGST' ? (
                              <>
                                <td className="px-3 py-2 text-right font-mono">₹{data.cgst.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right font-mono">₹{data.sgst.toLocaleString()}</td>
                              </>
                            ) : (
                              <td className="px-3 py-2 text-right font-mono">₹{data.igst.toLocaleString()}</td>
                            )}
                            <td className="px-3 py-2 text-right font-bold font-mono">₹{(data.cgst + data.sgst + data.igst).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals Section */}
                <div className="mt-10 grid grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-3">Bank Details</p>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                          <div>
                            <p className="text-[8px] text-gray-400 uppercase font-bold">Bank</p>
                            <p className="text-[10px] font-bold">{profile.bankDetails?.bankName || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[8px] text-gray-400 uppercase font-bold">IFSC</p>
                            <p className="text-[10px] font-bold font-mono">{profile.bankDetails?.ifsc || 'N/A'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[8px] text-gray-400 uppercase font-bold">Account</p>
                            <p className="text-[10px] font-bold font-mono">{profile.bankDetails?.accountNumber || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                      {profile.bankDetails?.upiId && (
                        <div className="text-center">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`upi://pay?pa=${profile.bankDetails.upiId}&pn=${profile.businessName}&am=${invoice.total}&cu=INR`)}`} 
                            alt="UPI QR"
                            className="w-16 h-16 mb-1 border border-gray-200 p-1 bg-white rounded-lg"
                            referrerPolicy="no-referrer"
                          />
                          <p className="text-[7px] font-bold text-gray-400 uppercase tracking-tighter">Scan to Pay</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">Amount in Words</p>
                      <p className="text-[10px] font-bold italic text-gray-500 leading-relaxed">{numberToWords(Math.floor(invoice.total))} Only</p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100 space-y-3">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">Subtotal</span>
                      <span className="font-bold font-mono">₹{invoice.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-gray-200">
                      {invoice.gstType === 'CGST_SGST' ? (
                        <>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-gray-400 font-bold">CGST</span>
                            <span className="font-mono font-bold">₹{invoice.cgst.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-gray-400 font-bold">SGST</span>
                            <span className="font-mono font-bold">₹{invoice.sgst.toLocaleString()}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-400 font-bold">IGST</span>
                          <span className="font-mono font-bold">₹{invoice.igst.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-4 border-t-2 theme-border">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold uppercase tracking-tight">Total Amount</span>
                        <span className="text-2xl font-black theme-text font-mono tracking-tighter">₹{invoice.total.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="pt-2 flex justify-between items-center text-[10px]">
                      <span className="text-gray-400 font-bold uppercase">Paid Amount</span>
                      <span className="font-bold">₹{(invoice.paidAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-tight">Balance Due</span>
                      <span className="text-lg font-black theme-text font-mono">₹{(invoice.balanceAmount ?? invoice.total).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-12 flex justify-between items-end">
                  <div className="text-[8px] text-gray-400 font-medium max-w-[250px]">
                    <p className="mb-1 uppercase font-bold text-gray-500">Terms & Conditions:</p>
                    <p>1. Goods once sold will not be taken back.</p>
                    <p>2. Interest @18% p.a. will be charged if payment is not made within due date.</p>
                    <p className="mt-3 font-bold theme-text">Generated via BillAI - Smart Invoicing</p>
                  </div>
                  <div className="text-center">
                    <div className="w-40 h-12 border-b border-gray-200 mb-2 flex items-center justify-center overflow-hidden">
                      {(invoice.businessSignatureUrl || profile.invoiceSettings?.signatureUrl) ? (
                        <img 
                          src={invoice.businessSignatureUrl || profile.invoiceSettings?.signatureUrl} 
                          alt="Signature" 
                          className="max-w-full max-h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="italic text-gray-200 text-[10px]">{invoice.businessName || profile.businessName}</span>
                      )}
                    </div>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Authorized Signatory</p>
                  </div>
                </div>
              </>
            )}

              {/* Status Stamp - Moved here for better visibility */}
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-8 rounded-xl px-8 py-4 text-6xl font-black uppercase tracking-widest opacity-[0.08] -rotate-12 pointer-events-none select-none z-10 ${
                invoice.status === 'paid' ? 'border-green-600 text-green-600' : 'border-amber-600 text-amber-600'
              }`}>
                {invoice.status}
              </div>
            </div>
          </div>

          {/* Payment Sidebar */}
          <div className="w-full lg:w-80 space-y-6">
            {/* Payment Summary */}
            <div className="glass p-6 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center gap-2 text-orange-500 mb-2">
                <CreditCard className="w-5 h-5" />
                <h3 className="font-bold uppercase tracking-widest text-xs">Payment Summary</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-xs">Total Amount</span>
                  <span className="font-bold font-mono">₹{invoice.total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-xs">Paid Amount</span>
                  <span className="font-bold text-green-500 font-mono">₹{(invoice.paidAmount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-white/5">
                  <span className="text-gray-400 text-xs font-bold">Balance Due</span>
                  <span className="font-black text-xl text-orange-500 font-mono">₹{(invoice.balanceAmount ?? invoice.total).toLocaleString()}</span>
                </div>
              </div>

              {invoice.status !== 'paid' && (
                <button 
                  onClick={() => setIsRecordingPayment(true)}
                  className="w-full btn-orange py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold"
                >
                  <Plus className="w-4 h-4" /> Record Payment
                </button>
              )}
            </div>

            {/* Payment History */}
            <div className="glass p-6 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <History className="w-5 h-5" />
                <h3 className="font-bold uppercase tracking-widest text-xs">Payment History</h3>
              </div>

              <div className="space-y-4">
                {invoice.payments && invoice.payments.length > 0 ? (
                  invoice.payments.map((payment, idx) => (
                    <div key={payment.id || idx} className="p-3 bg-white/5 rounded-2xl border border-white/5 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm">₹{payment.amount.toLocaleString()}</span>
                        <span className="text-[10px] text-gray-500">{new Date(payment.date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-400">{payment.method}</span>
                        {payment.note && <span className="text-gray-500 italic truncate max-w-[100px]">{payment.note}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 text-xs py-4">No payments recorded yet</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Record Payment Modal Overlay */}
        <AnimatePresence>
          {isRecordingPayment && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsRecordingPayment(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md bg-[#0C1020] border border-white/10 rounded-[2rem] p-8 shadow-2xl"
              >
                <h3 className="text-xl font-bold mb-6">Payment Record Karo</h3>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Amount (₹)</label>
                    <div className="relative">
                      <IndianRupee className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input 
                        type="number" 
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="Enter amount"
                        className="input-dark w-full pl-10"
                        max={invoice.balanceAmount ?? invoice.total}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500">Max: ₹{(invoice.balanceAmount ?? invoice.total).toLocaleString()}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Method</label>
                    <select 
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="input-dark w-full appearance-none"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="UPI">UPI</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Note (Optional)</label>
                    <input 
                      type="text" 
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="e.g. Received via GPay"
                      className="input-dark w-full"
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setIsRecordingPayment(false)}
                      className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 font-bold transition-all text-sm"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleRecordPayment}
                      disabled={isSavingPayment || !paymentAmount}
                      className="flex-[2] btn-orange flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                    >
                      {isSavingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Payment Add Karo
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #invoice-paper, #invoice-paper * {
            visibility: visible;
          }
          #invoice-paper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
};
