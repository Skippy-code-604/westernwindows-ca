// ---- Firebase Auth for WW Portal ----
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const firebaseConfig = {
    projectId: "western-windows-ca",
    appId: "1:753317905180:web:e2c0313352cb0e025ff0d9",
    storageBucket: "western-windows-ca.firebasestorage.app",
    apiKey: "AIzaSyD8gtXc380asHo3E2K95ZFxDu1-NjJSRlE",
    authDomain: "western-windows-ca.firebaseapp.com",
    messagingSenderId: "753317905180",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Wait for Firebase to determine the actual auth state (persisted user check)
const authReady = auth.authStateReady();

// Get the current user's ID token for API calls
async function getIdToken() {
    await authReady;
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
}

// Check if user is signed in (waits for persistence check)
async function isSignedIn() {
    await authReady;
    return auth.currentUser;
}

// Sign in with Google popup
async function signInWithGoogle() {
    const result = await signInWithPopup(auth, provider);
    return result.user;
}

// Sign out
async function firebaseSignOut() {
    await signOut(auth);
}

// Make these available globally
window.firebaseAuth = {
    getIdToken,
    isSignedIn,
    signInWithGoogle,
    signOut: firebaseSignOut,
    getAuth: () => auth,
};
