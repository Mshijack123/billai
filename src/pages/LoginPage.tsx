import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider, signInWithPopup } from '../firebase';
import { Link } from 'react-router-dom';
import { CheckCircle2, Mail, Lock, User, Store, ArrowRight } from 'lucide-react';

const LoginPage = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#060810]">
      {/* Left Panel - Brand Story */}
      <div className="hidden md:flex md:w-3/5 relative overflow-hidden p-12 flex-col justify-between">
        {/* Animated Background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-orange-500/10 via-purple-500/5 to-transparent animate-pulse" />
          <div className="absolute top-1/4 -left-20 w-80 h-80 bg-orange-500/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-purple-500/10 rounded-full blur-[120px]" />
        </div>

        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center font-bold text-white">B</div>
          <span className="text-xl font-display font-bold tracking-tight">Bill<span className="text-orange-500">AI</span></span>
        </Link>

        <div className="max-w-lg">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-6xl font-display font-extrabold leading-tight mb-6"
          >
            बिल बनाना <br />
            <span className="text-orange-500">इतना आसान?</span>
          </motion.h1>
          <p className="text-xl text-gray-400 mb-12">
            Hindi mein type karo, GST invoice seconds mein ready.
          </p>

          {/* 3D Floating Invoice Card */}
          <motion.div
            animate={{ 
              rotateY: [0, 10, 0, -10, 0],
              rotateX: [0, 5, 0, -5, 0],
              y: [0, -10, 0]
            }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="glass p-8 rounded-[2rem] border border-white/10 shadow-2xl shadow-orange-500/10 max-w-sm"
          >
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Customer</p>
                <p className="text-lg font-bold">Rohit Kumar</p>
              </div>
              <div className="bg-orange-500/10 text-orange-500 text-[10px] font-bold px-2 py-1 rounded">PENDING</div>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Running Shoes x3</span>
                <span className="font-mono">₹6,000</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">GST (18%)</span>
                <span className="font-mono">₹1,080</span>
              </div>
              <div className="h-px bg-white/5" />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-orange-500 font-mono">₹7,080</span>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center gap-1 text-[10px] text-gray-500"><CheckCircle2 className="w-3 h-3 text-orange-500" /> GST Ready</div>
              <div className="flex items-center gap-1 text-[10px] text-gray-500"><CheckCircle2 className="w-3 h-3 text-orange-500" /> Instant PDF</div>
            </div>
          </motion.div>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500">
          <p>2,400+ Indian businesses trust BillAI</p>
          <div className="flex items-center gap-1 text-orange-500">
            {"★★★★★".split("").map((s, i) => <span key={i}>{s}</span>)}
            <span className="text-gray-400 ml-2">4.9/5 rating</span>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 bg-[#0C1020] p-8 md:p-16 flex flex-col justify-center">
        <div className="max-w-md mx-auto w-full">
          {/* Tab Switcher */}
          <div className="flex bg-white/5 p-1 rounded-xl mb-10">
            <button 
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'login' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-400 hover:text-white'}`}
            >
              Login
            </button>
            <button 
              onClick={() => setActiveTab('signup')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'signup' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-400 hover:text-white'}`}
            >
              Sign Up
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'login' ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <h2 className="text-3xl font-display font-bold mb-2">Wapas aao! 👋</h2>
                <p className="text-gray-400 mb-8">Apna account mein login karo</p>

                <button 
                  onClick={handleGoogleLogin}
                  className="w-full py-3 px-4 rounded-xl border border-white/10 hover:bg-white/5 flex items-center justify-center gap-3 font-bold transition-all mb-6"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Google se login karo
                </button>

                <div className="flex items-center gap-4 mb-6">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-xs text-gray-600 uppercase tracking-widest font-bold">ya email se</span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>

                <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="w-5 h-5 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input type="email" placeholder="name@company.com" className="input-dark w-full pl-12" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Password</label>
                      <button className="text-[10px] text-orange-500 font-bold hover:underline">Password bhool gaye?</button>
                    </div>
                    <div className="relative">
                      <Lock className="w-5 h-5 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input type="password" placeholder="••••••••" className="input-dark w-full pl-12" />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-1 mb-6">
                    <input type="checkbox" className="w-4 h-4 rounded border-white/10 bg-white/5 text-orange-500 focus:ring-orange-500" />
                    <span className="text-xs text-gray-400">Mujhe yaad rakho</span>
                  </div>

                  <button className="btn-orange w-full flex items-center justify-center gap-2">
                    Login karo →
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <h2 className="text-3xl font-display font-bold mb-2">Shuru karo! 🚀</h2>
                <p className="text-gray-400 mb-8">Free account banao — credit card nahi chahiye</p>

                <button 
                  onClick={handleGoogleLogin}
                  className="w-full py-3 px-4 rounded-xl border border-white/10 hover:bg-white/5 flex items-center justify-center gap-3 font-bold transition-all mb-6"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                  Google se signup karo
                </button>

                <div className="flex items-center gap-4 mb-6">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-xs text-gray-600 uppercase tracking-widest font-bold">ya details bharo</span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>

                <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Naam</label>
                      <div className="relative">
                        <User className="w-5 h-5 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input type="text" placeholder="Ramesh" className="input-dark w-full pl-12" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Business</label>
                      <div className="relative">
                        <Store className="w-5 h-5 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input type="text" placeholder="Gupta Shoes" className="input-dark w-full pl-12" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="w-5 h-5 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input type="email" placeholder="name@company.com" className="input-dark w-full pl-12" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Password</label>
                    <div className="relative">
                      <Lock className="w-5 h-5 text-gray-600 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input type="password" placeholder="••••••••" className="input-dark w-full pl-12" />
                    </div>
                  </div>

                  <button className="btn-orange w-full flex items-center justify-center gap-2 mt-4">
                    Account banao — Free mein →
                  </button>
                  
                  <p className="text-[10px] text-gray-500 text-center mt-4">
                    Account banake aap agree karte ho <span className="text-orange-500 cursor-pointer hover:underline">Terms</span> aur <span className="text-orange-500 cursor-pointer hover:underline">Privacy Policy</span> se
                  </p>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
