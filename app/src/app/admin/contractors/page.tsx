'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, X, Upload, Loader2 } from 'lucide-react';
import Image from 'next/image';
import {
    Contractor,
    getContractors,
    addContractor,
    updateContractor,
    deleteContractor,
    uploadContractorPhoto
} from '@/lib/services/contractors-service';

export default function ContractorsAdminPage() {
    const [items, setItems] = useState<Contractor[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Contractor | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [bio, setBio] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState('');

    useEffect(() => { loadItems(); }, []);

    async function loadItems() {
        try {
            const data = await getContractors();
            setItems(data);
        } catch (error) {
            toast({ title: 'Error loading contractors', variant: 'destructive' });
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    function openEditor(item?: Contractor) {
        if (item) {
            setEditing(item);
            setIsNew(false);
            setName(item.name);
            setRole(item.role);
            setBio(item.bio);
            setPhotoUrl(item.photoUrl);
            setPhotoPreview(item.photoUrl);
        } else {
            setEditing({} as Contractor);
            setIsNew(true);
            setName('');
            setRole('');
            setBio('');
            setPhotoUrl('');
            setPhotoPreview('');
        }
        setPhotoFile(null);
    }

    function closeEditor() {
        setEditing(null);
        setIsNew(false);
    }

    function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    }

    async function handleSave() {
        if (!name || !role) {
            toast({ title: 'Please fill in name and role', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            let finalPhotoUrl = photoUrl;
            if (photoFile) {
                finalPhotoUrl = await uploadContractorPhoto(photoFile);
            }

            const itemData = {
                name,
                role,
                bio,
                photoUrl: finalPhotoUrl,
                order: isNew ? items.length : (editing?.order || 0)
            };

            if (isNew) {
                await addContractor(itemData);
                toast({ title: 'Contractor added' });
            } else if (editing?.id) {
                await updateContractor(editing.id, itemData);
                toast({ title: 'Contractor updated' });
            }

            closeEditor();
            loadItems();
        } catch (error) {
            toast({ title: 'Error saving', variant: 'destructive' });
            console.error(error);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(item: Contractor) {
        if (!confirm(`Delete "${item.name}"?`)) return;
        try {
            await deleteContractor(item.id!, item.photoUrl);
            toast({ title: 'Contractor deleted' });
            loadItems();
        } catch (error) {
            toast({ title: 'Error deleting', variant: 'destructive' });
        }
    }

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Contractors</h1>
                    <p className="text-muted-foreground">Manage team members</p>
                </div>
                <Button onClick={() => openEditor()}><Plus className="h-4 w-4 mr-2" />Add Contractor</Button>
            </div>

            {editing !== null && (
                <Card className="border-primary">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>{isNew ? 'Add Contractor' : 'Edit Contractor'}</CardTitle>
                        <Button variant="ghost" size="icon" onClick={closeEditor}><X className="h-4 w-4" /></Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Name *</Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" />
                            </div>
                            <div className="space-y-2">
                                <Label>Role *</Label>
                                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Lead Carpenter" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Bio</Label>
                            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio..." rows={3} />
                        </div>
                        <div className="space-y-2">
                            <Label>Photo</Label>
                            <div className="flex gap-4 items-start">
                                {photoPreview && (
                                    <div className="relative w-24 h-24 rounded-full overflow-hidden border">
                                        <Image src={photoPreview} alt="Preview" fill className="object-cover" />
                                    </div>
                                )}
                                <Label htmlFor="photo" className="flex flex-col items-center justify-center h-24 w-24 border-2 border-dashed rounded-full cursor-pointer hover:bg-muted/50">
                                    <Upload className="h-6 w-6 text-muted-foreground" />
                                    <Input id="photo" type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                                </Label>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={closeEditor}>Cancel</Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {isNew ? 'Add' : 'Save'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {items.length === 0 ? (
                <Card className="p-12 text-center"><p className="text-muted-foreground">No contractors yet.</p></Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(item => (
                        <Card key={item.id} className="group">
                            <CardContent className="p-4 flex gap-4 items-center">
                                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                    {item.photoUrl ? (
                                        <Image src={item.photoUrl} alt={item.name} fill className="object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                                            {item.name[0]}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium truncate">{item.name}</h3>
                                    <p className="text-sm text-muted-foreground">{item.role}</p>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="icon" variant="ghost" onClick={() => openEditor(item)}><Pencil className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="ghost" onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
