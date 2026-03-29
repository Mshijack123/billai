import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Sparkles, Loader2, CreditCard } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import axios from 'axios';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose }) => {
  const { profile } = useFirebase();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = () => {
    if (!profile) return;
    const message = `Hi, I want to upgrade my BillAI account to PRO. My email is: ${profile.email}`;
    const whatsappUrl = `https://wa.me/917023936809?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
        className="relative w-full max-w-lg bg-[#0C1020] border border-orange-500/30 rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-10 h-10 text-orange-500" />
          </div>
          
          <div>
            <h2 className="text-3xl font-bold mb-2">Upgrade to PRO</h2>
            <p className="text-gray-400">Unlock unlimited possibilities with BillAI PRO</p>
          </div>

          <div className="bg-white/5 rounded-3xl p-6 text-left space-y-4 border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-green-500" />
              </div>
              <span className="text-sm font-medium">Unlimited Invoice Creation</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-green-500" />
              </div>
              <span className="text-sm font-medium">Advanced GST Reports</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-green-500" />
              </div>
              <span className="text-sm font-medium">Custom Branding & Logos</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-green-500" />
              </div>
              <span className="text-sm font-medium">Priority Support</span>
            </div>
          </div>

          <div className="pt-4">
            <div className="text-4xl font-bold mb-1">₹499<span className="text-lg text-gray-500 font-normal">/lifetime</span></div>
            <p className="text-xs text-gray-500 mb-6">Contact admin for manual payment & activation</p>
            
            <button 
              onClick={handleUpgrade}
              className="w-full btn-orange flex items-center justify-center gap-3 py-4 text-lg"
            >
              <CreditCard className="w-6 h-6" />
              Contact Admin to Upgrade
            </button>
          </div>

          <button 
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-white transition-colors"
          >
            Maybe later
          </button>
        </div>

        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-gray-500" />
        </button>
      </motion.div>
    </div>
  );
};
