'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface PortalEmbedProps {
    src: string;
}

export default function PortalEmbed({ src }: PortalEmbedProps) {
    const [loading, setLoading] = useState(true);

    return (
        <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-8 relative">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            )}
            <iframe
                src={src}
                className="w-full h-full border-0"
                onLoad={() => setLoading(false)}
                title="Western Windows Portal"
            />
        </div>
    );
}
