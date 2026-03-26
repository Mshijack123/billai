import { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, Timestamp } from '../firebase';
import { useFirebase } from '../components/FirebaseProvider';

export const useInvoiceLimit = () => {
  const { profile } = useFirebase();
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const LIMIT = 20;

  useEffect(() => {
    if (!profile) return;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const q = query(
      collection(db, 'invoices'), 
      where('businessId', '==', profile.uid),
      where('createdAt', '>=', Timestamp.fromDate(startOfMonth))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInvoiceCount(snapshot.docs.length);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const canCreateInvoice = invoiceCount < LIMIT;

  return {
    invoiceCount,
    limit: LIMIT,
    canCreateInvoice,
    loading,
    remaining: Math.max(0, LIMIT - invoiceCount)
  };
};
