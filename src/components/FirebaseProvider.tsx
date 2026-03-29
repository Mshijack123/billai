import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot } from '../firebase';
import { UserProfile } from '../types';

interface FirebaseContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
});

export const useFirebase = () => useContext(FirebaseContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        try {
          // First check if profile exists, if not create it
          const profileDoc = await getDoc(doc(db, 'users', user.uid));

          if (!profileDoc.exists()) {
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              plan: 'free',
              role: 'user',
              createdAt: new Date().toISOString(),
              invoiceSettings: {
                prefix: 'INV',
                startingNumber: 1,
                defaultGstRate: 18,
                paymentTerms: 'Due on Receipt',
                defaultNotes: 'Thank you for your business!',
                autoGenerateNumber: true,
                sendEmailCopy: false,
                showBankDetails: true,
                enableSignature: false,
                templateStyle: 'modern'
              }
            };
            await setDoc(doc(db, 'users', user.uid), newProfile);
          }

          // Listen for real-time updates
          unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (doc) => {
            if (doc.exists()) {
              setProfile(doc.data() as UserProfile);
            }
            setLoading(false);
            setIsAuthReady(true);
          });
        } catch (error) {
          console.error("Firebase initialization error:", error);
          setLoading(false);
          setIsAuthReady(true);
        }
      } else {
        setProfile(null);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return (
    <FirebaseContext.Provider value={{ user, profile, loading, isAuthReady }}>
      {children}
    </FirebaseContext.Provider>
  );
};
