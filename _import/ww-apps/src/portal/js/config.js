// ---- Portal Configuration ----
// Keys are loaded from Firebase Hosting's reserved URL at runtime.
// This avoids hardcoding secrets in source control.

const PORTAL_CONFIG = {
  // Firebase config — loaded dynamically from /__/firebase/init.json
  firebase: null,

  // Google Maps — loaded from meta tag or falls back to empty
  mapsApiKey: document.querySelector('meta[name="maps-api-key"]')?.content || '',
};

async function loadFirebaseConfig() {
  if (PORTAL_CONFIG.firebase) return PORTAL_CONFIG.firebase;

  try {
    // Firebase Hosting auto-serves config at this reserved URL
    const res = await fetch('/__/firebase/init.json');
    if (res.ok) {
      const config = await res.json();
      PORTAL_CONFIG.firebase = config;
      return config;
    }
  } catch (e) {
    console.warn('Could not load Firebase config from hosting, using fallback');
  }

  // Fallback for local dev — reads from env-config.js if present
  if (window.__FIREBASE_CONFIG) {
    PORTAL_CONFIG.firebase = window.__FIREBASE_CONFIG;
    return window.__FIREBASE_CONFIG;
  }

  throw new Error('Firebase configuration not available');
}
