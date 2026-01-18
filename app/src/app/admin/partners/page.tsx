'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, X, Upload, Loader2, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import {
    Partner,
    getPartners,
    addPartner,
    updatePartner,
    deletePartner,
    uploadPartnerLogo
} from '@/lib/services/partners-service';

export default function PartnersAdminPage() {
    const [items, setItems] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Partner | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState('');

    useEffect(() => { loadItems(); }, []);

    async function loadItems() {
        try {
            const data = await getPartners();
            setItems(data);
        } catch (error) {
            toast({ title: 'Error loading partners', variant: 'destructive' });
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    function openEditor(item?: Partner) {
        if (item) {
            setEditing(item);
            setIsNew(false);
            setName(item.name);
            setDescription(item.description);
            setWebsiteUrl(item.websiteUrl);
            setLogoUrl(item.logoUrl);
            setLogoPreview(item.logoUrl);
        } else {
            setEditing({} as Partner);
            setIsNew(true);
            setName('');
            setDescription('');
            setWebsiteUrl('');
            setLogoUrl('');
            setLogoPreview('');
        }
        setLogoFile(null);
    }

    function closeEditor() { setEditing(null); setIsNew(false); }

    function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    }

    async function handleSave() {
        if (!name) {
            toast({ title: 'Please enter a name', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            let finalLogoUrl = logoUrl;
            if (logoFile) {
                finalLogoUrl = await uploadPartnerLogo(logoFile);
            }

            const itemData = {
                name,
                description,
                websiteUrl,
                logoUrl: finalLogoUrl,
                order: isNew ? items.length : (editing?.order || 0)
            };

            if (isNew) {
                await addPartner(itemData);
                toast({ title: 'Partner added' });
            } else if (editing?.id) {
                await updatePartner(editing.id, itemData);
                toast({ title: 'Partner updated' });
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

    async function handleDelete(item: Partner) {
        if (!confirm(`Delete "${item.name}"?`)) return;
        try {
            await deletePartner(item.id!, item.logoUrl);
            toast({ title: 'Partner deleted' });
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
                    <h1 className="text-3xl font-bold">Partners</h1>
                    <p className="text-muted-foreground">Manage partner companies</p>
                </div>
                <Button onClick={() => openEditor()}><Plus className="h-4 w-4 mr-2" />Add Partner</Button>
            </div>

            {editing !== null && (
                <Card className="border-primary">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>{isNew ? 'Add Partner' : 'Edit Partner'}</CardTitle>
                        <Button variant="ghost" size="icon" onClick={closeEditor}><X className="h-4 w-4" /></Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Name *</Label>
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company Name" />
                            </div>
                            <div className="space-y-2">
                                <Label>Website URL</Label>
                                <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..." rows={2} />
                        </div>
                        <div className="space-y-2">
                            <Label>Logo</Label>
                            <div className="flex gap-4 items-start">
                                {logoPreview && (
                                    <div className="relative w-32 h-20 rounded border bg-white p-2">
                                        <Image src={logoPreview} alt="Preview" fill className="object-contain" />
                                    </div>
                                )}
                                <Label htmlFor="logo" className="flex flex-col items-center justify-center h-20 w-32 border-2 border-dashed rounded cursor-pointer hover:bg-muted/50">
                                    <Upload className="h-6 w-6 text-muted-foreground" />
                                    <Input id="logo" type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
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
                <Card className="p-12 text-center"><p className="text-muted-foreground">No partners yet.</p></Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(item => (
                        <Card key={item.id} className="group">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-4">
                                    <div className="relative w-16 h-12 bg-white rounded border flex-shrink-0">
                                        {item.logoUrl && <Image src={item.logoUrl} alt={item.name} fill className="object-contain p-1" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium truncate">{item.name}</h3>
                                        {item.websiteUrl && (
                                            <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary flex items-center gap-1 hover:underline">
                                                Website <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button size="icon" variant="ghost" onClick={() => openEditor(item)}><Pencil className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
