'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PortalEmbed from '@/components/portal-embed';
import { Loader2 } from 'lucide-react';

function NewDocContent() {
    const searchParams = useSearchParams();
    const type = searchParams.get('type') || 'RFQ';
    return <PortalEmbed src={`/portal/select-supplier.html?type=${type}`} />;
}

export default function PortalNewPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <NewDocContent />
        </Suspense>
    );
}
