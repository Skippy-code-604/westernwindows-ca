'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, X, Loader2, Star, Globe, Eye, EyeOff } from 'lucide-react';
import {
    Review,
    ReviewSource,
    REVIEW_SOURCES,
    getReviews,
    addReview,
    updateReview,
    deleteReview
} from '@/lib/services/reviews-service';

function StarRating({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(i => (
                <Star
                    key={i}
                    className={`h-5 w-5 cursor-pointer transition-colors ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                    onClick={() => onChange?.(i)}
                />
            ))}
        </div>
    );
}

function SourceBadge({ source }: { source: ReviewSource }) {
    const colors: Record<ReviewSource, string> = {
        google: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        facebook: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
        homestar: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
        yelp: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        manual: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    };
    const label = REVIEW_SOURCES.find(s => s.value === source)?.label || source;
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[source]}`}>
            {source === 'google' && <Globe className="inline h-3 w-3 mr-1 -mt-0.5" />}
            {label}
        </span>
    );
}

export default function ReviewsAdminPage() {
    const [items, setItems] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Review | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const [authorName, setAuthorName] = useState('');
    const [text, setText] = useState('');
    const [rating, setRating] = useState(5);
    const [source, setSource] = useState<ReviewSource>('google');
    const [location, setLocation] = useState('');
    const [date, setDate] = useState('');
    const [visible, setVisible] = useState(true);

    useEffect(() => { loadItems(); }, []);

    async function loadItems() {
        try {
            const data = await getReviews();
            setItems(data);
        } catch (error) {
            toast({ title: 'Error loading reviews', variant: 'destructive' });
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    function openEditor(item?: Review) {
        if (item) {
            setEditing(item);
            setIsNew(false);
            setAuthorName(item.authorName);
            setText(item.text);
            setRating(item.rating);
            setSource(item.source);
            setLocation(item.location || '');
            setDate(item.date || '');
            setVisible(item.visible);
        } else {
            setEditing({} as Review);
            setIsNew(true);
            setAuthorName('');
            setText('');
            setRating(5);
            setSource('google');
            setLocation('');
            setDate('');
            setVisible(true);
        }
    }

    function closeEditor() { setEditing(null); setIsNew(false); }

    async function handleSave() {
        if (!authorName || !text) {
            toast({ title: 'Please fill in name and review text', variant: 'destructive' });
            return;
        }

        setSaving(true);
        try {
            const itemData = {
                authorName,
                text,
                rating,
                source,
                location,
                date,
                visible,
                order: isNew ? items.length : (editing?.order || 0)
            };

            if (isNew) {
                await addReview(itemData);
                toast({ title: 'Review added' });
            } else if (editing?.id) {
                await updateReview(editing.id, itemData);
                toast({ title: 'Review updated' });
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

    async function handleDelete(item: Review) {
        if (!confirm(`Delete review by "${item.authorName}"?`)) return;
        try {
            await deleteReview(item.id!);
            toast({ title: 'Review deleted' });
            loadItems();
        } catch (error) {
            toast({ title: 'Error deleting', variant: 'destructive' });
        }
    }

    async function handleToggleVisible(item: Review) {
        try {
            await updateReview(item.id!, { visible: !item.visible });
            loadItems();
        } catch (error) {
            toast({ title: 'Error updating visibility', variant: 'destructive' });
        }
    }

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Reviews</h1>
                    <p className="text-muted-foreground">Manage customer testimonials from Google and other sources</p>
                </div>
                <Button onClick={() => openEditor()}><Plus className="h-4 w-4 mr-2" />Add Review</Button>
            </div>

            {editing !== null && (
                <Card className="border-primary">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>{isNew ? 'Add Review' : 'Edit Review'}</CardTitle>
                        <Button variant="ghost" size="icon" onClick={closeEditor}><X className="h-4 w-4" /></Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Author Name *</Label>
                                <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="John Smith" />
                            </div>
                            <div className="space-y-2">
                                <Label>Source</Label>
                                <Select value={source} onValueChange={(v) => setSource(v as ReviewSource)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select source" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {REVIEW_SOURCES.map(s => (
                                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Rating</Label>
                            <StarRating rating={rating} onChange={setRating} />
                        </div>
                        <div className="space-y-2">
                            <Label>Review Text *</Label>
                            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What the customer said..." rows={4} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Location</Label>
                                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="North Vancouver, BC" />
                            </div>
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="March 2026" />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch id="visible" checked={visible} onCheckedChange={setVisible} />
                            <Label htmlFor="visible">Visible on landing page</Label>
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
                <Card className="p-12 text-center">
                    <p className="text-muted-foreground mb-4">No reviews yet.</p>
                    <p className="text-sm text-muted-foreground">Add reviews manually or use the Google sync to import them automatically.</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {items.map(item => (
                        <Card key={item.id} className={`group ${!item.visible ? 'opacity-60' : ''}`}>
                            <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-lg font-bold text-primary">
                                        {item.authorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">{item.authorName}</span>
                                            <SourceBadge source={item.source} />
                                            {!item.visible && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Hidden</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <StarRating rating={item.rating} />
                                            {item.location && <span className="text-sm text-muted-foreground">· {item.location}</span>}
                                            {item.date && <span className="text-sm text-muted-foreground">· {item.date}</span>}
                                        </div>
                                        <p className="text-sm text-muted-foreground line-clamp-3">&ldquo;{item.text}&rdquo;</p>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                        <Button size="icon" variant="ghost" onClick={() => handleToggleVisible(item)} title={item.visible ? 'Hide' : 'Show'}>
                                            {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </Button>
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
