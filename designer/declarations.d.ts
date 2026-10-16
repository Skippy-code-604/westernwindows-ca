/// <reference types="vite/client" />
// Suppress "Could not find declaration file" for lucide-react.
// The package ships its own types but tsc can't resolve them with our tsconfig.
// Vite resolves this correctly at build time.
declare module 'lucide-react';

// App version injected by Vite `define` from package.json (see vite.config.ts)
declare const __APP_VERSION__: string;
