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
import { db } from '@/lib/firebase';

export interface Service {
    id?: string;
    title: string;
    description: string;
    icon: string;
    order: number;
    createdAt?: Timestamp;
}

const COLLECTION = 'services';

export async function getServices(): Promise<Service[]> {
    const q = query(collection(db, COLLECTION), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as Service));
}

export async function addService(item: Omit<Service, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION), {
        ...item,
        createdAt: Timestamp.now()
    });
    return docRef.id;
}

export async function updateService(id: string, item: Partial<Service>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), item);
}

export async function deleteService(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
}
