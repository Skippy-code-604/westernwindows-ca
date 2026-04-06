'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/icons/logo';
import {
    LayoutDashboard,
    Image,
    Users,
    Handshake,
    Wrench,
    Star,
    FileText,
    ExternalLink,
    LogOut,
    Menu,
    X
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
    { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/admin/gallery', icon: Image, label: 'Gallery' },
    { href: '/admin/contractors', icon: Users, label: 'Contractors' },
    { href: '/admin/partners', icon: Handshake, label: 'Partners' },
    { href: '/admin/services', icon: Wrench, label: 'Services' },
    { href: '/admin/reviews', icon: Star, label: 'Reviews' },
    { href: '/portal', icon: FileText, label: 'Portal', external: true },
];

function AdminLayoutContent({ children }: { children: ReactNode }) {
    const { user, isAdmin, loading, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [authReady, setAuthReady] = useState(false);

    // Check if this is the login page
    const isLoginPage = pathname === '/admin/login';

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Track when auth has resolved at least once
    useEffect(() => {
        if (!loading && isMounted && user && isAdmin) {
            setAuthReady(true);
        }
    }, [loading, isMounted, user, isAdmin]);

    useEffect(() => {
        if (!loading && isMounted && !isLoginPage) {
            if (!user) {
                // Only redirect if auth has never been ready (fresh visit, not a navigation)
                if (!authReady) {
                    router.push('/admin/login');
                }
            } else if (!isAdmin) {
                router.push('/admin/login');
            }
        }
    }, [user, isAdmin, loading, router, isLoginPage, isMounted, authReady]);

    // Show loading during SSR and initial mount
    if (!isMounted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse">Loading...</div>
            </div>
        );
    }

    // For login page, just render children directly without auth check
    if (isLoginPage) {
        return <>{children}</>;
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse">Loading...</div>
            </div>
        );
    }

    if (!user || !isAdmin) {
        // If auth was previously ready, keep showing layout instead of flashing null
        if (authReady) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="animate-pulse">Loading...</div>
                </div>
            );
        }
        return null;
    }

    return (
        <div className="min-h-screen flex bg-muted/30">
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-card border-r transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="p-4 border-b flex items-center justify-between">
                        <a href="/admin" className="flex items-center gap-2">
                            <Logo />
                            <span className="font-semibold text-sm">Admin</span>
                        </a>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1">
                        {navItems.map((item, idx) => {
                            const isActive = pathname === item.href;
                            const isExternal = 'external' in item && item.external;
                            const prevItem = navItems[idx - 1];
                            const showDivider = isExternal && prevItem && !('external' in prevItem && prevItem.external);
                            return (
                                <div key={item.href}>
                                    {showDivider && <div className="border-t my-2" />}
                                    <a
                                        href={item.href}
                                        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                        className={`
                                            flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                                            ${isActive
                                                ? 'bg-primary text-primary-foreground'
                                                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                                            }
                                        `}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <item.icon className="h-5 w-5" />
                                        {item.label}
                                        {isExternal && <ExternalLink className="h-3 w-3 ml-auto opacity-50" />}
                                    </a>
                                </div>
                            );
                        })}
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t">
                        <div className="text-sm text-muted-foreground mb-2 truncate">
                            {user.email}
                        </div>
                        <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={signOut}
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile header */}
                <header className="lg:hidden border-b bg-card p-4 flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                    <span className="font-semibold">NSCCR Admin</span>
                </header>

                {/* Page content */}
                <main className="flex-1 p-4 lg:p-8 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <AuthProvider>
            <AdminLayoutContent>{children}</AdminLayoutContent>
        </AuthProvider>
    );
}
