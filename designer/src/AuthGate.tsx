/// <reference types="vite/client" />
// Login gate for the web build (westernwindows.ca/designer).
// Same Firebase project and admin allowlist as the portal and admin console (keep all in sync with
// app/src/lib/auth-context.tsx and the isAdmin() rules). Skipped in the Electron desktop build and in
// `vite` dev, where there is no Firebase Hosting config to load.
import { useEffect, useState, type ReactNode } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, type Auth, type User } from 'firebase/auth';

const ADMIN_EMAILS = ['shane@nsccr.ca'];

const isDesktop = typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: unknown }).electronAPI;

type State =
  | { kind: 'loading' }
  | { kind: 'open' }                       // desktop / local dev: no gate
  | { kind: 'signed-out'; auth: Auth }
  | { kind: 'denied'; auth: Auth; user: User }
  | { kind: 'allowed' }
  | { kind: 'error'; message: string };

export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(isDesktop || import.meta.env.DEV ? { kind: 'open' } : { kind: 'loading' });

  useEffect(() => {
    if (state.kind === 'open') return;
    let unsub = () => {};
    (async () => {
      try {
        // Firebase Hosting serves the project's web config here (same as the portal's config.js).
        const res = await fetch('/__/firebase/init.json');
        if (!res.ok) throw new Error(`Could not load Firebase config (${res.status})`);
        const app = getApps().length ? getApp() : initializeApp(await res.json());
        const auth = getAuth(app);
        unsub = onAuthStateChanged(auth, (user) => {
          if (!user) setState({ kind: 'signed-out', auth });
          else if (user.email && ADMIN_EMAILS.includes(user.email)) setState({ kind: 'allowed' });
          else setState({ kind: 'denied', auth, user });
        });
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => unsub();
  }, []);

  if (state.kind === 'open' || state.kind === 'allowed') return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow text-center space-y-4">
        <img src="./ww1.png" alt="Western Windows" className="mx-auto h-12" />
        <h1 className="text-lg font-semibold text-slate-800">Window Designer</h1>
        {state.kind === 'loading' && <p className="text-slate-500">Checking sign-in…</p>}
        {state.kind === 'error' && <p className="text-red-600 text-sm">{state.message}</p>}
        {state.kind === 'signed-out' && (
          <button
            className="w-full rounded-lg bg-slate-800 px-4 py-2 text-white hover:bg-slate-700"
            onClick={() => signInWithPopup(state.auth, new GoogleAuthProvider()).catch((e) => setState({ kind: 'error', message: e.message }))}
          >
            Sign in with Google
          </button>
        )}
        {state.kind === 'denied' && (
          <>
            <p className="text-sm text-slate-600">{state.user.email} isn't authorized to use the designer.</p>
            <button className="text-sm text-slate-500 underline" onClick={() => signOut(state.auth)}>Sign out</button>
          </>
        )}
      </div>
    </div>
  );
}
