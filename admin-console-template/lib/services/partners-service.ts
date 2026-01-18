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

export interface Partner {
    id?: string;
    name: string;
    description: string;
    logoUrl: string;
    websiteUrl: string;
    order: number;
    createdAt?: Timestamp;
}

const COLLECTION = 'partners';

export async function getPartners(): Promise<Partner[]> {
    const q = query(collection(db, COLLECTION), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as Partner));
}

export async function addPartner(item: Omit<Partner, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION), {
        ...item,
        createdAt: Timestamp.now()
    });
    return docRef.id;
}

export async function updatePartner(id: string, item: Partial<Partner>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), item);
}

export async function deletePartner(id: string, logoUrl?: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));

    if (logoUrl && logoUrl.includes('firebasestorage.googleapis.com')) {
        try {
            const imageRef = ref(storage, logoUrl);
            await deleteObject(imageRef);
        } catch (error) {
            console.error('Error deleting logo:', error);
        }
    }
}

export async function uploadPartnerLogo(file: File): Promise<string> {
    const filename = `partners/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
}
