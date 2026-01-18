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

export interface GalleryItem {
    id?: string;
    title: string;
    description: string;
    imageUrl: string;
    category: string;
    order: number;
    createdAt?: Timestamp;
}

const COLLECTION = 'gallery';

export async function getGalleryItems(): Promise<GalleryItem[]> {
    const q = query(collection(db, COLLECTION), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as GalleryItem));
}

export async function addGalleryItem(item: Omit<GalleryItem, 'id' | 'createdAt'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION), {
        ...item,
        createdAt: Timestamp.now()
    });
    return docRef.id;
}

export async function updateGalleryItem(id: string, item: Partial<GalleryItem>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), item);
}

export async function deleteGalleryItem(id: string, imageUrl?: string): Promise<void> {
    // Delete from Firestore
    await deleteDoc(doc(db, COLLECTION, id));

    // Delete image from Storage if it's a Firebase Storage URL
    if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
        try {
            const imageRef = ref(storage, imageUrl);
            await deleteObject(imageRef);
        } catch (error) {
            console.error('Error deleting image:', error);
        }
    }
}

export async function uploadGalleryImage(file: File): Promise<string> {
    const filename = `gallery/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
}
