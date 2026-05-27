// Suppress "Could not find declaration file" for lucide-react.
// The package ships its own types but tsc can't resolve them with our tsconfig.
// Vite resolves this correctly at build time.
declare module 'lucide-react';
