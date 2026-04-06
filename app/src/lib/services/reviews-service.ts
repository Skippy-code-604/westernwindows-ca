import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    orderBy,
    Timestamp,
    writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ReviewSource = 'google' | 'facebook' | 'homestar' | 'yelp' | 'manual';

export interface Review {
    id?: string;
    authorName: string;
    text: string;
    rating: number; // 1-5
    source: ReviewSource;
    location?: string; // e.g. "North Vancouver, BC"
    date?: string;     // When the review was written
    visible: boolean;
    order: number;
    createdAt?: Timestamp;
}

export const REVIEW_SOURCES: { value: ReviewSource; label: string }[] = [
    { value: 'google', label: 'Google' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'homestar', label: 'HomeStars' },
    { value: 'yelp', label: 'Yelp' },
    { value: 'manual', label: 'Manual' },
];

const COLLECTION = 'reviews';

export async function getReviews(): Promise<Review[]> {
    const q = query(collection(db, COLLECTION), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as Review));
}

export async function addReview(item: Omit<Review, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION), {
        ...item,
        createdAt: Timestamp.now()
    });
    return docRef.id;
}

export async function updateReview(id: string, item: Partial<Review>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), item);
}

export async function deleteReview(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
}

// Batch import reviews (used by Google sync)
export async function batchImportReviews(reviews: Omit<Review, 'id' | 'createdAt'>[]): Promise<number> {
    const batch = writeBatch(db);
    let count = 0;
    for (const review of reviews) {
        const docRef = doc(collection(db, COLLECTION));
        batch.set(docRef, { ...review, createdAt: Timestamp.now() });
        count++;
    }
    await batch.commit();
    return count;
}
