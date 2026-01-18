'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    User,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

interface AuthContextType {
    user: User | null;
    isAdmin: boolean;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    error: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Whitelisted admin emails
const ADMIN_EMAILS = ['shane@nsccr.ca'];

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    // Handle SSR - set mounted flag on client
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Listen to auth state changes (client-side only)
    useEffect(() => {
        if (!isMounted) return;

        // Check if auth is properly initialized
        if (!auth || typeof auth.onAuthStateChanged !== 'function') {
            console.error('Firebase auth not properly initialized');
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUser(user);

            if (user) {
                // Check if user is in whitelist
                const email = user.email?.toLowerCase();
                if (email && ADMIN_EMAILS.includes(email)) {
                    setIsAdmin(true);
                } else {
                    // Also check Firestore for dynamic whitelist
                    try {
                        const whitelistDoc = await getDoc(doc(db, 'settings', 'adminWhitelist'));
                        const whitelist = whitelistDoc.data()?.emails || [];
                        setIsAdmin(email ? whitelist.includes(email) : false);
                    } catch {
                        setIsAdmin(false);
                    }
                }
            } else {
                setIsAdmin(false);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, [isMounted]);

    const signIn = async (email: string, password: string) => {
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError('Invalid email or password');
            throw err;
        }
    };

    const signInWithGoogle = async () => {
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (err) {
            setError('Failed to sign in with Google');
            throw err;
        }
    };

    const signOut = async () => {
        await firebaseSignOut(auth);
        setIsAdmin(false);
    };

    // Show loading during SSR and initial mount
    if (!isMounted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse">Loading...</div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, isAdmin, loading, signIn, signInWithGoogle, signOut, error }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
