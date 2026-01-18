'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, X, Upload, Loader2 } from 'lucide-react';
import Image from 'next/image';
import {
    GalleryItem,
    getGalleryItems,
    addGalleryItem,
    updateGalleryItem,
    deleteGalleryItem,
    uploadGalleryImage
} from '@/lib/services/gallery-service';

const CATEGORIES = [
    'Kitchen',
    'Bathroom',
    'Living Room',
    'Bedroom',
    'Exterior',
    'Custom Cabinetry',
    'Windows & Doors',
    'Other'
];

export default function GalleryAdminPage() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<GalleryItem | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const { toast } = useToast();

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState('');

    useEffect(() => {
        loadItems();
    }, []);

    async function loadItems() {
        try {
            const data = await getGalleryItems();
            setItems(data);
        } catch (error) {
            toast({ title: 'Error loading gallery', variant: 'destructive' });
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    function openEditor(item?: GalleryItem) {
        if (item) {
            setEditing(item);
            setIsNew(false);
            setTitle(item.title);
            setDescription(item.description);
            setCategory(item.category);
            setImageUrl(item.imageUrl);
            setImagePreview(item.imageUrl);
        } else {
            setEditing({} as GalleryItem);
            setIsNew(true);
            setTitle('');
            setDescription('');
            setCategory('');
            setImageUrl('');
            setImagePreview('');
        }
        setImageFile(null);
    }

    function closeEditor() {
        setEditing(null);
        setIsNew(false);
        setImageFile(null);
        setImagePreview('');
    }

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    }

    async function handleSave() {
        if (!title || !category) {
            toast({ title: 'Please fill in all required fields', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            let finalImageUrl = imageUrl;

            // Upload new image if selected
            if (imageFile) {
                setUploading(true);
                finalImageUrl = await uploadGalleryImage(imageFile);
                setUploading(false);
            }

            if (!finalImageUrl) {
                toast({ title: 'Please upload an image', variant: 'destructive' });
                setSaving(false);
                return;
            }

            const itemData = {
                title,
                description,
                category,
                imageUrl: finalImageUrl,
                order: isNew ? items.length : (editing?.order || 0)
            };

            if (isNew) {
                await addGalleryItem(itemData);
                toast({ title: 'Gallery item added' });
            } else if (editing?.id) {
                await updateGalleryItem(editing.id, itemData);
                toast({ title: 'Gallery item updated' });
            }

            closeEditor();
            loadItems();
        } catch (error) {
            toast({ title: 'Error saving item', variant: 'destructive' });
            console.error(error);
        } finally {
            setSaving(false);
            setUploading(false);
        }
    }

    async function handleDelete(item: GalleryItem) {
        if (!confirm(`Delete "${item.title}"?`)) return;

        try {
            await deleteGalleryItem(item.id!, item.imageUrl);
            toast({ title: 'Gallery item deleted' });
            loadItems();
        } catch (error) {
            toast({ title: 'Error deleting item', variant: 'destructive' });
            console.error(error);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Gallery</h1>
                    <p className="text-muted-foreground">Manage project photos</p>
                </div>
                <Button onClick={() => openEditor()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Image
                </Button>
            </div>

            {/* Editor Modal */}
            {editing !== null && (
                <Card className="border-primary">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>{isNew ? 'Add New Image' : 'Edit Image'}</CardTitle>
                        <Button variant="ghost" size="icon" onClick={closeEditor}>
                            <X className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="title">Title *</Label>
                                <Input
                                    id="title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Kitchen Renovation"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Category *</Label>
                                <Select value={category} onValueChange={setCategory}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map(cat => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Brief description of the project..."
                                rows={3}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Image *</Label>
                            <div className="flex gap-4 items-start">
                                {imagePreview && (
                                    <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                                        <Image
                                            src={imagePreview}
                                            alt="Preview"
                                            fill
                                            className="object-cover"
                                        />
                                    </div>
                                )}
                                <div className="flex-1">
                                    <Label
                                        htmlFor="image"
                                        className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                                    >
                                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                                        <span className="text-sm text-muted-foreground">
                                            {uploading ? 'Uploading...' : 'Click to upload'}
                                        </span>
                                        <Input
                                            id="image"
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleImageSelect}
                                        />
                                    </Label>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={closeEditor}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {isNew ? 'Add' : 'Save'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Gallery Grid */}
            {items.length === 0 ? (
                <Card className="p-12 text-center">
                    <p className="text-muted-foreground">No gallery items yet. Click "Add Image" to get started.</p>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map(item => (
                        <Card key={item.id} className="overflow-hidden group">
                            <div className="relative aspect-square">
                                <Image
                                    src={item.imageUrl}
                                    alt={item.title}
                                    fill
                                    className="object-cover"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button size="sm" variant="secondary" onClick={() => openEditor(item)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleDelete(item)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <CardContent className="p-3">
                                <h3 className="font-medium truncate">{item.title}</h3>
                                <p className="text-sm text-muted-foreground">{item.category}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
