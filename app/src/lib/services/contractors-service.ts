import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    orderBy,
    Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

export interface Contractor {
    id?: string;
    name: string;
    role: string;
    bio: string;
    photoUrl: string;
    order: number;
    createdAt?: Timestamp;
}

const COLLECTION = 'contractors';

export async function getContractors(): Promise<Contractor[]> {
    const q = query(collection(db, COLLECTION), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as Contractor));
}

export async function addContractor(item: Omit<Contractor, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION), {
        ...item,
        createdAt: Timestamp.now()
    });
    return docRef.id;
}

export async function updateContractor(id: string, item: Partial<Contractor>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), item);
}

export async function deleteContractor(id: string, photoUrl?: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));

    if (photoUrl && photoUrl.includes('firebasestorage.googleapis.com')) {
        try {
            const imageRef = ref(storage, photoUrl);
            await deleteObject(imageRef);
        } catch (error) {
            console.error('Error deleting photo:', error);
        }
    }
}

export async function uploadContractorPhoto(file: File): Promise<string> {
    const filename = `contractors/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
}
