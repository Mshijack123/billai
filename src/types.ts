/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  businessName?: string;
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
  plan: 'free' | 'pro';
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

export interface Invoice {
  id: string;
  invoiceNumber: string;
  businessId: string;
  customerId: string;
  customerName: string;
  customerGstin?: string;
  customerState?: string;
  customerAddress?: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  status: 'paid' | 'pending' | 'partial';
  gstType: 'CGST_SGST' | 'IGST';
  notes?: string;
  confirmedByUser: boolean;
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
