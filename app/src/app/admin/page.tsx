'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Image, Users, Handshake, Wrench, ExternalLink } from 'lucide-react';

const contentTypes = [
    {
        title: 'Gallery',
        description: 'Manage project photos and portfolio images',
        icon: Image,
        href: '/admin/gallery',
        count: 0, // Will be dynamic
    },
    {
        title: 'Contractors',
        description: 'Manage team member profiles',
        icon: Users,
        href: '/admin/contractors',
        count: 0,
    },
    {
        title: 'Partners',
        description: 'Manage partner company logos and info',
        icon: Handshake,
        href: '/admin/partners',
        count: 0,
    },
    {
        title: 'Services',
        description: 'Manage service offerings',
        icon: Wrench,
        href: '/admin/services',
        count: 0,
    },
];

export default function AdminDashboard() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your website content
                </p>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-4">
                <Button asChild variant="outline">
                    <Link href="/" target="_blank">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Live Site
                    </Link>
                </Button>
            </div>

            {/* Content Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {contentTypes.map((type) => (
                    <Link key={type.href} href={type.href}>
                        <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {type.title}
                                </CardTitle>
                                <type.icon className="h-5 w-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <CardDescription>{type.description}</CardDescription>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Instructions */}
            <Card>
                <CardHeader>
                    <CardTitle>Getting Started</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <p>
                        <strong>Gallery:</strong> Upload project photos to showcase your work.
                        Add titles, descriptions, and categories.
                    </p>
                    <p>
                        <strong>Contractors:</strong> Add team member profiles with photos and bios.
                    </p>
                    <p>
                        <strong>Partners:</strong> Add partner company logos and links.
                    </p>
                    <p>
                        <strong>Services:</strong> Update your service offerings with descriptions.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
