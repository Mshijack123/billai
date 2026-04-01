import React, { useState, useEffect } from 'react';
import { db, collection, getDocs, doc, updateDoc, query, orderBy, where } from '../firebase';
import { UserProfile, Invoice, Customer, Product } from '../types';
import { useFirebase } from '../components/FirebaseProvider';
import { 
  Users, 
  FileText, 
  Package, 
  UserCheck, 
  Shield, 
  Search, 
  ChevronRight, 
  ExternalLink,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  FileSpreadsheet,
  Trash2,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { InvoiceDetailModal } from '../components/InvoiceDetailModal';
import axios from 'axios';

export default function AdminPanel() {
  const { profile: adminProfile } = useFirebase();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState({
    totalRevenue: 0,
    totalGST: 0,
    totalInvoices: 0
  });
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userData, setUserData] = useState<{
    invoices: Invoice[];
    customers: Customer[];
    products: Product[];
  }>({ invoices: [], customers: [], products: [] });
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [autoDownload, setAutoDownload] = useState(false);
  const [autoShare, setAutoShare] = useState(false);

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const val = row[header] === null || row[header] === undefined ? '' : row[header];
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportGSTReport = () => {
    if (!selectedUser || userData.invoices.length === 0) return;
    
    const reportData = userData.invoices.map(inv => ({
      InvoiceNumber: inv.invoiceNumber,
      Date: new Date(inv.date).toLocaleDateString(),
      Customer: inv.customerName,
      CustomerGSTIN: inv.customerGstin || 'N/A',
      Status: inv.status,
      TaxableAmount: inv.subtotal,
      CGST: inv.cgst || 0,
      SGST: inv.sgst || 0,
      IGST: inv.igst || 0,
      TotalGST: (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0),
      TotalAmount: inv.total
    }));

    downloadCSV(reportData, `${selectedUser.businessName || selectedUser.displayName}_GST_Report.csv`);
  };

  const exportAllInvoices = () => {
    if (!selectedUser || userData.invoices.length === 0) return;
    downloadCSV(userData.invoices, `${selectedUser.businessName || selectedUser.displayName}_All_Invoices.csv`);
  };

  const exportUsersList = () => {
    if (users.length === 0) return;
    downloadCSV(users, 'All_Users_List.csv');
  };

  const exportGlobalGSTReport = async () => {
    setLoading(true);
    try {
      const invSnap = await getDocs(collection(db, 'invoices'));
      const allInvoices = invSnap.docs.map(doc => doc.data() as Invoice);
      
      const reportData = allInvoices.map(inv => ({
        BusinessName: inv.businessName || 'N/A',
        InvoiceNumber: inv.invoiceNumber,
        Date: new Date(inv.date).toLocaleDateString(),
        Customer: inv.customerName,
        CustomerGSTIN: inv.customerGstin || 'N/A',
        Status: inv.status,
        TaxableAmount: inv.subtotal,
        CGST: inv.cgst || 0,
        SGST: inv.sgst || 0,
        IGST: inv.igst || 0,
        TotalGST: (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0),
        TotalAmount: inv.total
      }));

      downloadCSV(reportData, `Global_GST_Report_${new Date().toLocaleDateString()}.csv`);
    } catch (error) {
      console.error('Error exporting global GST report:', error);
      alert('Failed to export global GST report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [usersSnap, invSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'invoices'))
      ]);

      const usersList = usersSnap.docs.map(doc => ({ ...doc.data() } as UserProfile));
      const allInvoices = invSnap.docs.map(doc => doc.data() as Invoice);

      const stats = allInvoices.reduce((acc, inv) => ({
        totalRevenue: acc.totalRevenue + (inv.total || 0),
        totalGST: acc.totalGST + (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0),
        totalInvoices: acc.totalInvoices + 1
      }), { totalRevenue: 0, totalGST: 0, totalInvoices: 0 });

      setUsers(usersList);
      setGlobalStats(stats);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePlan = async (userId: string, currentPlan: string) => {
    const newPlan = currentPlan === 'free' ? 'pro' : 'free';
    try {
      await updateDoc(doc(db, 'users', userId), { plan: newPlan });
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, plan: newPlan } : u));
      if (selectedUser?.uid === userId) {
        setSelectedUser(prev => prev ? { ...prev, plan: newPlan } : null);
      }
    } catch (error) {
      console.error('Error updating plan:', error);
      alert('Failed to update plan');
    }
  };

  const viewUserData = async (user: UserProfile) => {
    setSelectedUser(user);
    setLoadingUserData(true);
    try {
      // Fetch all data for this user using indexed queries
      const [invSnap, custSnap, prodSnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'), where('businessId', '==', user.uid), orderBy('date', 'desc'))),
        getDocs(query(collection(db, 'customers'), where('businessId', '==', user.uid))),
        getDocs(query(collection(db, 'products'), where('businessId', '==', user.uid)))
      ]);

      const invoices = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      const customers = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      const products = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

      setUserData({ invoices, customers, products });
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Fallback if index doesn't exist yet
      try {
        const [invSnap, custSnap, prodSnap] = await Promise.all([
          getDocs(collection(db, 'invoices')),
          getDocs(collection(db, 'customers')),
          getDocs(collection(db, 'products'))
        ]);
        const invoices = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)).filter(i => i.businessId === user.uid);
        const customers = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)).filter(c => c.businessId === user.uid);
        const products = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)).filter(p => p.businessId === user.uid);
        setUserData({ invoices, customers, products });
      } catch (e) {
        console.error('Fallback fetch failed:', e);
      }
    } finally {
      setLoadingUserData(false);
    }
  };

  const handleDeleteUser = async (targetUserId: string) => {
    if (!adminProfile) return;
    if (!window.confirm("Are you sure you want to PERMANENTLY delete this user and ALL their data? This cannot be undone.")) return;

    setDeletingUser(targetUserId);
    try {
      const response = await axios.post('/api/admin/delete-user', {
        targetUserId,
        adminId: adminProfile.uid
      });

      if (response.data.success) {
        setUsers(users.filter(u => u.uid !== targetUserId));
        alert("User deleted successfully.");
      }
    } catch (error: any) {
      console.error("Error deleting user:", error);
      alert(error.response?.data?.error || "Failed to delete user.");
    } finally {
      setDeletingUser(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.businessName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AnimatePresence mode="wait">
        {!selectedUser ? (
          <motion.div
            key="user-list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Admin Panel</h2>
                <p className="text-sm text-gray-500">Manage users and monitor application data</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={exportGlobalGSTReport}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Global GST Report
                </button>
                <button 
                  onClick={exportUsersList}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-500" />
                  Export Users
                </button>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search users..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-orange-500/50 w-full sm:w-64"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              <div className="bg-[#0C1020] border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Users</p>
                    <p className="text-2xl font-bold">{users.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0C1020] border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Revenue</p>
                    <p className="text-2xl font-bold">₹{globalStats.totalRevenue.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0C1020] border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total GST</p>
                    <p className="text-2xl font-bold">₹{globalStats.totalGST.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0C1020] border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Pro Users</p>
                    <p className="text-2xl font-bold">{users.filter(u => u.plan === 'pro').length}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#0C1020] border border-white/10 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">User</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Business</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Plan</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredUsers.map((user) => (
                      <tr key={user.uid} className="group hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center font-bold text-white border border-white/10">
                              {user.displayName?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold">{user.displayName}</p>
                              <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm">{user.businessName || 'N/A'}</p>
                          <p className="text-[10px] text-gray-500 font-mono">{user.gstin || 'No GSTIN'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                            user.plan === 'pro' ? 'bg-orange-500/10 text-orange-500' : 'bg-gray-500/10 text-gray-500'
                          }`}>
                            {user.plan}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => togglePlan(user.uid, user.plan)}
                              className={`p-2 rounded-lg transition-colors ${
                                user.plan === 'pro' 
                                  ? 'text-orange-500 hover:bg-orange-500/10' 
                                  : 'text-gray-400 hover:bg-white/10'
                              }`}
                              title={user.plan === 'pro' ? 'Downgrade to Free' : 'Upgrade to Pro'}
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => viewUserData(user)}
                              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                              title="View User Data"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            {user.email !== "mshijacknew@gmail.com" && (
                              <button 
                                onClick={() => handleDeleteUser(user.uid)}
                                disabled={deletingUser === user.uid}
                                className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                title="Delete User Permanently"
                              >
                                {deletingUser === user.uid ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="user-detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors text-gray-400 hover:text-white"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold">{selectedUser.displayName}'s Data</h2>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {selectedUser.email !== "mshijacknew@gmail.com" && (
                  <button 
                    onClick={() => {
                      handleDeleteUser(selectedUser.uid);
                      setSelectedUser(null);
                    }}
                    disabled={deletingUser === selectedUser.uid}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    {deletingUser === selectedUser.uid ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Delete User
                  </button>
                )}
                <button 
                  onClick={exportGSTReport}
                  disabled={userData.invoices.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  GST Download
                </button>
                <button 
                  onClick={exportAllInvoices}
                  disabled={userData.invoices.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-xl text-xs font-bold hover:bg-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  All Invoices CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#0C1020] border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Invoices</p>
                    <p className="text-2xl font-bold">{userData.invoices.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0C1020] border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Customers</p>
                    <p className="text-2xl font-bold">{userData.customers.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-[#0C1020] border border-white/10 p-6 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Products</p>
                    <p className="text-2xl font-bold">{userData.products.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {loadingUserData ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-[#0C1020] border border-white/10 rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      Recent Invoices
                    </h3>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-white/5">
                        {userData.invoices.map(inv => (
                          <tr key={inv.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-sm font-bold">{inv.invoiceNumber}</p>
                              <p className="text-[10px] text-gray-500">{new Date(inv.date).toLocaleDateString()}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm">{inv.customerName}</p>
                            </td>
                            <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                              <div>
                                <p className="text-sm font-bold">₹{inv.total.toLocaleString()}</p>
                                <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                  inv.status === 'paid' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'
                                }`}>
                                  {inv.status}
                                </span>
                              </div>
                              <button 
                                onClick={() => {
                                  setSelectedInvoice(inv);
                                  setAutoDownload(true);
                                }}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                                title="Download Invoice"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {userData.invoices.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-10 text-center text-gray-500 text-sm italic">No invoices found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-[#0C1020] border border-white/10 rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2">
                      <Users className="w-4 h-4 text-green-500" />
                      Customers
                    </h3>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-white/5">
                        {userData.customers.map(cust => (
                          <tr key={cust.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-sm font-bold">{cust.name}</p>
                              <p className="text-[10px] text-gray-500">{cust.email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-400">{cust.phone}</p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <p className="text-xs font-mono">{cust.gstin || 'No GSTIN'}</p>
                            </td>
                          </tr>
                        ))}
                        {userData.customers.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-10 text-center text-gray-500 text-sm italic">No customers found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <InvoiceDetailModal 
        isOpen={!!selectedInvoice}
        onClose={() => {
          setSelectedInvoice(null);
          setAutoDownload(false);
          setAutoShare(false);
        }}
        invoice={selectedInvoice}
        profile={selectedUser}
        autoDownload={autoDownload}
        autoShare={autoShare}
        onDownloadComplete={() => setAutoDownload(false)}
        onShareComplete={() => setAutoShare(false)}
      />
    </div>
  );
}
