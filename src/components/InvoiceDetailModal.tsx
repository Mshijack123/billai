import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Share2, Edit3, Printer, Loader2 } from 'lucide-react';
import { Invoice, UserProfile } from '../types';
import { numberToWords } from '../lib/utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  profile: UserProfile | null;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ isOpen, onClose, invoice, profile }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen || !invoice || !profile) return null;

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
    if (!element) return;

    setIsDownloading(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
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
      pdf.save(`Invoice-${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsDownloading(false);
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
          <div className="flex items-center gap-1 sm:gap-2">
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
        <div className="flex-1 overflow-y-auto p-2 sm:p-8 bg-[#060810]/50">
          <div className="min-w-fit sm:min-w-0 flex justify-center">
            <div 
              id="invoice-paper" 
              className="bg-white text-black p-6 sm:p-12 rounded-sm shadow-2xl w-full max-w-[800px] min-h-[1123px] flex flex-col print:shadow-none print:p-0 print:m-0 print:w-full origin-top scale-[0.6] sm:scale-100 -mb-[40%] sm:mb-0"
            >
            <style>{`
              #invoice-paper { color: #000000 !important; background-color: #ffffff !important; }
              #invoice-paper .text-orange-500 { color: #f97316 !important; }
              #invoice-paper .bg-orange-500 { background-color: #f97316 !important; }
              #invoice-paper .text-gray-500 { color: #6b7280 !important; }
              #invoice-paper .text-gray-600 { color: #4b5563 !important; }
              #invoice-paper .text-gray-400 { color: #9ca3af !important; }
              #invoice-paper .bg-gray-100 { background-color: #f3f4f6 !important; }
              #invoice-paper .border-gray-200 { border-color: #e5e7eb !important; }
              #invoice-paper .border-gray-300 { border-color: #d1d5db !important; }
              #invoice-paper .bg-gray-200 { background-color: #e5e7eb !important; }
            `}</style>
            {/* Header */}
            <div className="flex justify-between items-start mb-12">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center font-bold text-white text-2xl">
                  {profile.businessName?.charAt(0) || 'B'}
                </div>
                <div>
                  <h1 className="text-2xl font-bold mb-1">{profile.businessName || 'BillAI Demo Business'}</h1>
                  <p className="text-xs text-gray-600 max-w-[250px] leading-relaxed">{profile.address || '123 MG Road, Jaipur, Rajasthan 302001'}</p>
                  <p className="text-xs font-bold mt-2">GSTIN: <span className="font-mono">{profile.gstin || '08ABCDE1234F1Z5'}</span></p>
                  <p className="text-xs text-gray-600">Phone: {profile.phone || '+91 98765 43210'}</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-4xl font-black text-orange-500 mb-4 tracking-tighter">TAX INVOICE</h2>
                <div className="space-y-1 text-sm">
                  <p><span className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mr-2">Invoice No:</span> <span className="font-bold font-mono">{invoice.invoiceNumber}</span></p>
                  <p><span className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mr-2">Date:</span> <span className="font-bold">{new Date(invoice.date).toLocaleDateString()}</span></p>
                  <p><span className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mr-2">Due Date:</span> <span className="font-bold">{new Date(invoice.dueDate).toLocaleDateString()}</span></p>
                </div>
              </div>
            </div>

            <div className="h-1 bg-orange-500 mb-12" />

            {/* Bill To */}
            <div className="flex justify-between mb-12">
              <div>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Bill To:</p>
                <h3 className="text-lg font-bold mb-1">{invoice.customerName}</h3>
                <p className="text-xs text-gray-600 max-w-[250px] leading-relaxed">{invoice.customerAddress || 'No address provided'}</p>
                {invoice.customerGstin && (
                  <p className="text-xs font-bold mt-2">GSTIN: <span className="font-mono">{invoice.customerGstin}</span></p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Place of Supply:</p>
                <p className="text-sm font-bold">{invoice.customerState || 'N/A'}</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">GST Type: {invoice.gstType}</p>
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-[10px] font-bold uppercase tracking-widest">
                    <th className="px-4 py-3 border border-gray-200">#</th>
                    <th className="px-4 py-3 border border-gray-200">Description</th>
                    <th className="px-4 py-3 border border-gray-200">HSN</th>
                    <th className="px-4 py-3 border border-gray-200 text-center">Qty</th>
                    <th className="px-4 py-3 border border-gray-200 text-right">Rate</th>
                    <th className="px-4 py-3 border border-gray-200 text-right">Taxable</th>
                    <th className="px-4 py-3 border border-gray-200 text-center">GST%</th>
                    <th className="px-4 py-3 border border-gray-200 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, i) => (
                    <tr key={i} className="text-xs">
                      <td className="px-4 py-3 border border-gray-200 text-center">{i + 1}</td>
                      <td className="px-4 py-3 border border-gray-200 font-bold">{item.description}</td>
                      <td className="px-4 py-3 border border-gray-200 font-mono">{item.hsn || '6403'}</td>
                      <td className="px-4 py-3 border border-gray-200 text-center">{item.qty}</td>
                      <td className="px-4 py-3 border border-gray-200 text-right font-mono">₹{item.rate.toLocaleString()}</td>
                      <td className="px-4 py-3 border border-gray-200 text-right font-mono">₹{item.taxableAmount.toLocaleString()}</td>
                      <td className="px-4 py-3 border border-gray-200 text-center">{item.gstRate}%</td>
                      <td className="px-4 py-3 border border-gray-200 text-right font-bold font-mono">₹{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-12 flex justify-between">
              <div className="max-w-[300px]">
                <div className="mb-6">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Bank Details</p>
                  <p className="text-xs font-bold">{profile.bankDetails?.bankName || 'State Bank of India'}</p>
                  <p className="text-xs">A/C: <span className="font-mono">{profile.bankDetails?.accountNumber || 'XXXX XXXX 1234'}</span></p>
                  <p className="text-xs">IFSC: <span className="font-mono">{profile.bankDetails?.ifsc || 'SBIN0001234'}</span></p>
                  <p className="text-xs">UPI: <span className="font-mono">{profile.bankDetails?.upiId || 'billai@upi'}</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">Amount in Words</p>
                  <p className="text-xs font-bold italic">{numberToWords(Math.floor(invoice.total))}</p>
                </div>
              </div>
              
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 font-bold">Taxable Amount:</span>
                  <span className="font-mono font-bold">₹{invoice.subtotal.toLocaleString()}</span>
                </div>
                {invoice.gstType === 'CGST_SGST' ? (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">CGST:</span>
                      <span className="font-mono">₹{invoice.cgst.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">SGST:</span>
                      <span className="font-mono">₹{invoice.sgst.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">IGST:</span>
                    <span className="font-mono">₹{invoice.igst.toLocaleString()}</span>
                  </div>
                )}
                <div className="h-px bg-gray-200 my-2" />
                <div className="flex justify-between text-lg font-black text-orange-500">
                  <span>Total:</span>
                  <span className="font-mono">₹{invoice.total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-auto pt-12 flex justify-between items-end">
              <div className="text-[10px] text-gray-400">
                <p>GST invoice generated by BillAI.</p>
                <p>For queries: support@billai.in</p>
              </div>
              <div className="text-center">
                <div className="w-32 h-12 border-b border-gray-300 mb-2" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Authorized Signature</p>
              </div>
            </div>
            </div>
          </div>
        </div>
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
