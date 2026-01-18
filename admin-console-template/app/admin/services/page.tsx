'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, X, Loader2, Wrench, Home, Hammer, Paintbrush, Ruler, Settings, Lightbulb } from 'lucide-react';
import {
    Service,
    getServices,
    addService,
    updateService,
    deleteService
} from '@/lib/services/services-service';

const ICONS = [
    { name: 'wrench', icon: Wrench, label: 'Wrench' },
    { name: 'home', icon: Home, label: 'Home' },
    { name: 'hammer', icon: Hammer, label: 'Hammer' },
    { name: 'paintbrush', icon: Paintbrush, label: 'Paintbrush' },
    { name: 'ruler', icon: Ruler, label: 'Ruler' },
    { name: 'settings', icon: Settings, label: 'Settings' },
    { name: 'lightbulb', icon: Lightbulb, label: 'Lightbulb' },
];

function getIconComponent(iconName: string) {
    const found = ICONS.find(i => i.name === iconName);
    return found?.icon || Wrench;
}

export default function ServicesAdminPage() {
    const [items, setItems] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Service | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [icon, setIcon] = useState('');

    useEffect(() => { loadItems(); }, []);

    async function loadItems() {
        try {
            const data = await getServices();
            setItems(data);
        } catch (error) {
            toast({ title: 'Error loading services', variant: 'destructive' });
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    function openEditor(item?: Service) {
        if (item) {
            setEditing(item);
            setIsNew(false);
            setTitle(item.title);
            setDescription(item.description);
            setIcon(item.icon);
        } else {
            setEditing({} as Service);
            setIsNew(true);
            setTitle('');
            setDescription('');
            setIcon('wrench');
        }
    }

    function closeEditor() { setEditing(null); setIsNew(false); }

    async function handleSave() {
        if (!title) {
            toast({ title: 'Please enter a title', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const itemData = {
                title,
                description,
                icon: icon || 'wrench',
                order: isNew ? items.length : (editing?.order || 0)
            };

            if (isNew) {
                await addService(itemData);
                toast({ title: 'Service added' });
            } else if (editing?.id) {
                await updateService(editing.id, itemData);
                toast({ title: 'Service updated' });
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

    async function handleDelete(item: Service) {
        if (!confirm(`Delete "${item.title}"?`)) return;
        try {
            await deleteService(item.id!);
            toast({ title: 'Service deleted' });
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
                    <h1 className="text-3xl font-bold">Services</h1>
                    <p className="text-muted-foreground">Manage service offerings</p>
                </div>
                <Button onClick={() => openEditor()}><Plus className="h-4 w-4 mr-2" />Add Service</Button>
            </div>

            {editing !== null && (
                <Card className="border-primary">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>{isNew ? 'Add Service' : 'Edit Service'}</CardTitle>
                        <Button variant="ghost" size="icon" onClick={closeEditor}><X className="h-4 w-4" /></Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Title *</Label>
                                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Custom Cabinetry" />
                            </div>
                            <div className="space-y-2">
                                <Label>Icon</Label>
                                <Select value={icon} onValueChange={setIcon}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select icon" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ICONS.map(i => (
                                            <SelectItem key={i.name} value={i.name}>
                                                <div className="flex items-center gap-2">
                                                    <i.icon className="h-4 w-4" />
                                                    {i.label}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this service..." rows={3} />
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
                <Card className="p-12 text-center"><p className="text-muted-foreground">No services yet.</p></Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(item => {
                        const IconComponent = getIconComponent(item.icon);
                        return (
                            <Card key={item.id} className="group">
                                <CardContent className="p-4 flex gap-4 items-start">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <IconComponent className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium">{item.title}</h3>
                                        <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button size="icon" variant="ghost" onClick={() => openEditor(item)}><Pencil className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
