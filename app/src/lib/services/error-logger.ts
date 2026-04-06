import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function logError(context: string, error: any) {
    try {
        await addDoc(collection(db, 'error_logs'), {
            context,
            message: error?.message || String(error),
            code: error?.code || null,
            stack: error?.stack?.substring(0, 500) || null,
            url: typeof window !== 'undefined' ? window.location.href : null,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            timestamp: Timestamp.now()
        });
    } catch (logErr) {
        // If logging itself fails, just console.error
        console.error('[ErrorLogger] Failed to log to Firestore:', logErr);
    }
}
