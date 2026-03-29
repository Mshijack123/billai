import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection as fsCollection, doc as fsDoc, setDoc as fsSetDoc, getDoc as fsGetDoc, query as fsQuery, where as fsWhere, onSnapshot as fsOnSnapshot, addDoc as fsAddDoc, updateDoc as fsUpdateDoc, deleteDoc as fsDeleteDoc, serverTimestamp as fsServerTimestamp, getDocs as fsGetDocs, Timestamp, Query, DocumentReference, CollectionReference, DocumentData, SnapshotListenOptions, QuerySnapshot, DocumentSnapshot, FirestoreError } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Wrapped Firestore functions
export const collection = fsCollection;
export const doc = fsDoc;
export const query = fsQuery;
export const where = fsWhere;
export const serverTimestamp = fsServerTimestamp;

export const setDoc = async (reference: DocumentReference<DocumentData>, data: any, options?: any) => {
  try {
    return await fsSetDoc(reference, data, options);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, reference.path);
    throw error;
  }
};

export const getDoc = async (reference: DocumentReference<DocumentData>) => {
  try {
    return await fsGetDoc(reference);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, reference.path);
    throw error;
  }
};

export const addDoc = async (reference: CollectionReference<DocumentData>, data: any) => {
  try {
    return await fsAddDoc(reference, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, reference.path);
    throw error;
  }
};

export const updateDoc = async (reference: DocumentReference<DocumentData>, data: any) => {
  try {
    return await fsUpdateDoc(reference, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, reference.path);
    throw error;
  }
};

export const deleteDoc = async (reference: DocumentReference<DocumentData>) => {
  try {
    return await fsDeleteDoc(reference);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, reference.path);
    throw error;
  }
};

export const getDocs = async (q: Query<DocumentData>) => {
  try {
    return await fsGetDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, null);
    throw error;
  }
};

export const onSnapshot = (
  reference: Query<DocumentData> | DocumentReference<DocumentData>,
  onNext: (snapshot: any) => void,
  onError?: (error: FirestoreError) => void
) => {
  return fsOnSnapshot(
    reference as any,
    onNext,
    (error: FirestoreError) => {
      handleFirestoreError(error, OperationType.GET, (reference as any).path || null);
      if (onError) onError(error);
    }
  );
};

export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  Timestamp
};
