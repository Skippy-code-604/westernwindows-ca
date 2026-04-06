// Seed script for Firestore — uses Firebase Admin SDK
// Run: node scripts/seed-firestore.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Use Application Default Credentials (gcloud auth)
initializeApp({ projectId: 'western-windows-ca' });
const db = getFirestore();

const SERVICES = [
    {
        title: 'Window Installation',
        description: 'Energy-efficient windows that reduce utility costs and enhance your home\'s aesthetic appeal. Double & triple-pane options available. Vinyl, Wood & Fiberglass. Custom Sizes Available. Energy Star Certified.',
        icon: 'home',
        order: 0
    },
    {
        title: 'Door Replacement',
        description: 'Stylish entry doors, patio doors, and French doors that make a lasting impression while providing superior security. Entry & Storm Doors. Sliding Glass Doors. French & Patio Doors.',
        icon: 'home',
        order: 1
    },
    {
        title: 'Skylight Installation',
        description: 'Bring natural light into your home with our premium skylights. Fixed, vented, and tubular options to brighten any space. Solar-Powered Blinds. Leak-Proof Guarantee.',
        icon: 'lightbulb',
        order: 2
    },
    {
        title: 'Custom Glass Work',
        description: 'Shower enclosures, glass railings, mirrors, and specialty glass installations. Custom cut to fit any space with precision craftsmanship.',
        icon: 'ruler',
        order: 3
    },
    {
        title: 'Glass & Storefront',
        description: 'Commercial glass solutions including storefront systems, curtain walls, and glass partitions. Professional installation for businesses.',
        icon: 'wrench',
        order: 4
    },
    {
        title: 'Window & Door Repair',
        description: 'Expert repair services for foggy glass, broken seals, hardware issues, and weatherstripping. Extend the life of your existing windows and doors.',
        icon: 'settings',
        order: 5
    }
];

const PARTNERS = [
    {
        name: 'NSCCR - North Shore Custom Carpentry & Renovations',
        description: 'Sister company specializing in custom cabinetry, home renovations, and handyman services.',
        websiteUrl: 'https://nsccr.ca',
        logoUrl: '',
        order: 0
    },
    {
        name: 'Gentek',
        description: 'Premium building products manufacturer — windows, doors, siding.',
        websiteUrl: 'https://gentek.ca',
        logoUrl: '',
        order: 1
    },
    {
        name: 'Modern Windows',
        description: 'High-performance window and door manufacturer.',
        websiteUrl: '',
        logoUrl: '',
        order: 2
    }
];

const REVIEWS = [
    {
        authorName: 'Shelly P.',
        text: 'This recent window storm saw my screen door smash the exterior glazed. Rob measured the window and will have it replaced tomorrow morning! The projected time line was two weeks so this is AMAZING. I am thrilled.',
        rating: 5,
        source: 'google',
        location: 'North Vancouver, BC',
        date: '',
        visible: true,
        order: 0
    },
    {
        authorName: 'Chris M.',
        text: 'Rob and his team at Western Windows installed our new storm windows. The service was professional, discreet, and fast. Even replaced the last window short-staffed on short notice. The new windows and white interior frames brighten up our home and cut down noise and heat-loss.',
        rating: 5,
        source: 'google',
        location: 'Vancouver, BC',
        date: '',
        visible: true,
        order: 1
    }
];

async function seedCollection(name, items, keyField) {
    const snap = await db.collection(name).get();
    if (!snap.empty) {
        console.log(`⚠️  "${name}" already has ${snap.size} documents — SKIPPING`);
        return;
    }
    for (const item of items) {
        const ref = await db.collection(name).add(item);
        console.log(`✅ ${name}: added "${item[keyField]}" (${ref.id})`);
    }
    console.log(`✅ ${name}: seeded ${items.length} items\n`);
}

async function main() {
    console.log('=== Seeding Western Windows Firestore ===\n');
    await seedCollection('services', SERVICES, 'title');
    await seedCollection('partners', PARTNERS, 'name');
    await seedCollection('reviews', REVIEWS, 'authorName');
    console.log('🎉 Done!');
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
