import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user exists in Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      // Create new user profile
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: 'user',
        createdAt: serverTimestamp()
      });
      
      // Initialize portfolio
      await setDoc(doc(db, 'portfolios', user.uid), {
        uid: user.uid,
        balance: 0,
        positions: [],
        updatedAt: serverTimestamp()
      });
      
      // Initialize settings
      await setDoc(doc(db, 'settings', user.uid), {
        uid: user.uid,
        chartTheme: 'dark',
        autoBotEnabled: false,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Error logging in with Google:", error);
    throw error;
  }
};

export const logout = () => signOut(auth);
