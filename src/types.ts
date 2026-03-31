/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  businessName?: string;
  shopName?: string;
  gstin?: string;
  address?: string;
  state?: string;
  phone?: string;
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    ifsc: string;
    upiId: string;
  };
  invoiceSettings?: {
    prefix: string;
    startingNumber: number;
    defaultGstRate: number;
    paymentTerms: string;
    defaultNotes: string;
    autoGenerateNumber: boolean;
    sendEmailCopy: boolean;
    showBankDetails: boolean;
    enableSignature: boolean;
    themeColor?: string;
    logoUrl?: string;
    signatureUrl?: string;
    fontStyle?: 'sans' | 'serif' | 'mono';
    templateStyle?: 'classic' | 'modern' | 'minimal' | 'professional';
  };
  notifications?: {
    emailAlerts: boolean;
    whatsappAlerts: boolean;
    paymentReminders: boolean;
    monthlyReports: boolean;
  };
  plan: 'free' | 'pro';
  planExpiry?: string;
  role?: 'admin' | 'user';
  createdAt: string;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  businessName?: string;
  gstin?: string;
  address?: string;
  state: string;
  createdAt: string;
}

export interface InvoiceItem {
  description: string;
  hsn?: string;
  qty: number;
  rate: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  total: number;
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  method: string;
  note?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  businessId: string;
  customerId: string;
  customerName: string;
  customerGstin?: string;
  customerState?: string;
  customerAddress?: string;
  customerPhone?: string;
  // Business details at the time of creation
  businessName?: string;
  shopName?: string;
  businessAddress?: string;
  businessGstin?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessBankDetails?: {
    bankName: string;
    accountNumber: string;
    ifsc: string;
    upiId: string;
  };
  businessLogoUrl?: string;
  businessSignatureUrl?: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  status: 'paid' | 'pending' | 'partial';
  gstType: 'CGST_SGST' | 'IGST';
  notes?: string;
  confirmedByUser: boolean;
  payments?: Payment[];
  createdAt: string;
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  hsn?: string;
  rate: number;
  gstRate: number;
  unit: string;
  createdAt: string;
}

export interface DashboardStats {
  totalRevenue: number;
  pendingPayments: number;
  gstPayable: number;
  totalInvoices: number;
}
