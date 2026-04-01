import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import { motion } from 'motion/react';
import { gsap } from 'gsap';
import { CheckCircle2, ArrowRight, Zap, Shield, FileText, Globe, BarChart3, Users, Sun, Moon } from 'lucide-react';
import { useTheme } from '../components/ThemeContext';

const LandingPage = () => {
  const { theme, toggleTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      alpha: true,
      antialias: true 
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Particles
    const particlesCount = 800;
    const positions = new Float32Array(particlesCount * 3);
    const colors = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 10;
      colors[i] = Math.random();
    }

    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      color: 0xff5c1a
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    camera.position.z = 3;

    const animate = () => {
      requestAnimationFrame(animate);
      particles.rotation.y += 0.001;
      particles.rotation.x += 0.0005;
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    
    // Parallax on mouse move
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 0.5;
      const y = (e.clientY / window.innerHeight - 0.5) * 0.5;
      gsap.to(particles.rotation, { x: y, y: x, duration: 2 });
    };
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden selection:bg-orange-500/30 bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <canvas ref={canvasRef} className="fixed inset-0 -z-10 pointer-events-none" />
      
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between glass m-4 rounded-2xl border border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center font-bold text-white">B</div>
          <span className="text-xl font-display font-bold tracking-tight">Bill<span className="text-orange-500">AI</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--text-secondary)]">
          <a href="#features" className="hover:text-[var(--text-primary)] transition-colors">Features</a>
          <a href="#pricing" className="hover:text-[var(--text-primary)] transition-colors">Pricing</a>
          <a href="#demo" className="hover:text-[var(--text-primary)] transition-colors">Demo</a>
          <Link to="/login" className="hover:text-[var(--text-primary)] transition-colors">Login</Link>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-all"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-orange-500" /> : <Moon className="w-5 h-5 text-orange-500" />}
          </button>
          <Link to="/login" className="btn-orange py-2 px-5 text-sm">
            Free mein shuru karo →
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 max-w-screen-2xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-8xl font-display font-extrabold leading-tight mb-6">
            हिंदी में बोलो, <br />
            <span className="text-orange-500">Invoice बनाओ</span>
          </h1>
          <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10">
            India's first Hindi AI-powered GST billing software. <br className="hidden md:block" />
            Just type: <span className="font-mono text-orange-400 bg-orange-500/10 px-2 py-1 rounded">'Rohit ko 3 shoes ₹2000 each GST 18% unpaid'</span>
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link to="/login" className="btn-orange w-full sm:w-auto flex items-center justify-center gap-2">
              अभी Try करो — Free <ArrowRight className="w-5 h-5" />
            </Link>
            <button className="w-full sm:w-auto px-8 py-3 rounded-xl border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] transition-all font-bold">
              Demo देखो
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-orange-500" /> GST Compliant</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-orange-500" /> PDF Download</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-orange-500" /> Hindi + Hinglish</div>
          </div>
        </motion.div>

        {/* Floating Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
          {[
            { label: 'Invoices Generated', value: '2,400+' },
            { label: 'Total Billed', value: '₹48L+' },
            { label: 'Uptime', value: '99.9%' }
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass p-8 rounded-3xl border border-[var(--border-color)]"
            >
              <p className="text-4xl font-display font-bold text-orange-500 mb-2">{stat.value}</p>
              <p className="text-sm text-[var(--text-secondary)] uppercase tracking-widest font-medium">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Powerful Features</h2>
          <p className="text-[var(--text-secondary)]">Everything you need to manage your business billing.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Zap, title: 'Hindi AI Engine', desc: 'Parse Hindi, Hinglish, and English prompts instantly.' },
            { icon: Shield, title: 'GST Compliant', desc: 'Automatic CGST/SGST/IGST split for all your bills.' },
            { icon: FileText, title: 'PDF Invoices', desc: 'Professional PDF generation with one-click download.' },
            { icon: BarChart3, title: 'Smart Dashboard', desc: 'Track revenue, pending payments, and GST payable.' },
            { icon: Users, title: 'Customer CRM', desc: 'Manage your client history and outstanding balances.' },
            { icon: Globe, title: 'Cloud Sync', desc: 'Access your data from anywhere, anytime, securely.' }
          ].map((feature, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -5, borderColor: 'rgba(255, 92, 26, 0.3)' }}
              className="glass p-8 rounded-3xl border border-[var(--border-color)] transition-all group"
            >
              <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-orange-500/20 transition-colors">
                <feature.icon className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Simple Pricing</h2>
          <p className="text-[var(--text-secondary)]">Choose the plan that fits your business.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <div className="glass p-10 rounded-[2.5rem] border border-[var(--border-color)]">
            <h3 className="text-2xl font-bold mb-2">FREE</h3>
            <p className="text-4xl font-display font-bold mb-6">₹0 <span className="text-lg text-[var(--text-secondary)] font-normal">/month</span></p>
            <ul className="space-y-4 mb-10 text-[var(--text-secondary)]">
              <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-orange-500" /> 20 invoices/month</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-orange-500" /> Basic dashboard</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-orange-500" /> PDF download</li>
            </ul>
            <Link to="/login" className="block text-center py-4 rounded-2xl border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] font-bold transition-all">
              Free mein Start karo
            </Link>
          </div>

          <div className="glass p-10 rounded-[2.5rem] border-2 border-orange-500 relative overflow-hidden">
            <div className="absolute top-6 right-6 bg-orange-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">Most Popular 🔥</div>
            <h3 className="text-2xl font-bold mb-2">PRO</h3>
            <p className="text-4xl font-display font-bold mb-6">₹499 <span className="text-lg text-[var(--text-secondary)] font-normal">/lifetime</span></p>
            <ul className="space-y-4 mb-10 text-[var(--text-secondary)]">
              <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-orange-500" /> Unlimited invoices</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-orange-500" /> GST reports + export</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-orange-500" /> WhatsApp sharing</li>
              <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-orange-500" /> Priority support</li>
            </ul>
            <Link to="/login" className="btn-orange block text-center py-4 rounded-2xl">
              Pro upgrade karo →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-[var(--border-color)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center font-bold text-white">B</div>
              <span className="text-xl font-display font-bold tracking-tight">Bill<span className="text-orange-500">AI</span></span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">Made with 🧡 for Indian small businesses</p>
          </div>
          <div className="flex gap-8 text-sm text-[var(--text-secondary)]">
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Terms</a>
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
