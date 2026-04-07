const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const { getAdmin } = require('../firestore');

const PLACE_ID = 'ChIJNbe6Jo5whlQRKEEX3iTdf08';
const PLACES_API_URL = `https://places.googleapis.com/v1/places/${PLACE_ID}`;

/**
 * GET /api/google-reviews/sync
 * Fetches reviews from Google Places API and syncs them into Firestore.
 * Requires admin auth. Uses Application Default Credentials (service account).
 */
router.get('/sync', requireAuth, async (req, res) => {
    try {
        const { GoogleAuth } = require('google-auth-library');
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        const accessToken = tokenResponse.token;

        // Fetch reviews from Places API (New)
        const response = await fetch(PLACES_API_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Goog-FieldMask': 'reviews',
                'x-goog-user-project': 'western-windows-ca'
            }
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Places API error:', response.status, errBody);
            return res.status(502).json({
                error: 'Failed to fetch reviews from Google',
                details: errBody
            });
        }

        const data = await response.json();
        const googleReviews = data.reviews || [];

        if (googleReviews.length === 0) {
            return res.json({ message: 'No reviews found on Google', imported: 0, skipped: 0 });
        }

        // Get existing reviews from Firestore to avoid duplicates
        const admin = getAdmin();
        const db = admin.firestore();
        const existingSnap = await db.collection('reviews')
            .where('source', '==', 'google')
            .get();

        const existingAuthors = new Set();
        existingSnap.forEach(doc => {
            const d = doc.data();
            // Use author name + first 50 chars of text as dedup key
            existingAuthors.add(`${d.authorName}::${(d.text || '').substring(0, 50)}`);
        });

        // Get max order for new entries
        const allReviewsSnap = await db.collection('reviews').orderBy('order', 'desc').limit(1).get();
        let maxOrder = 0;
        if (!allReviewsSnap.empty) {
            maxOrder = allReviewsSnap.docs[0].data().order || 0;
        }

        let imported = 0;
        let skipped = 0;
        const batch = db.batch();

        for (const review of googleReviews) {
            const authorName = review.authorAttribution?.displayName || 'Anonymous';
            const reviewText = review.text?.text || '';
            const dedupKey = `${authorName}::${reviewText.substring(0, 50)}`;

            if (existingAuthors.has(dedupKey)) {
                skipped++;
                continue;
            }

            // Parse the publish date into a friendly format
            const publishDate = review.publishTime
                ? new Date(review.publishTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : '';

            const docRef = db.collection('reviews').doc();
            batch.set(docRef, {
                authorName: authorName,
                text: reviewText,
                rating: review.rating || 5,
                source: 'google',
                location: '',
                date: publishDate,
                visible: true,
                order: maxOrder + imported + 1,
                googleReviewId: review.name || '',
                googleMapsUri: review.googleMapsUri || '',
                authorPhotoUri: review.authorAttribution?.photoUri || '',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            imported++;
        }

        if (imported > 0) {
            await batch.commit();
        }

        res.json({
            message: `Synced ${imported} new reviews from Google (${skipped} already existed)`,
            imported,
            skipped,
            total: googleReviews.length
        });
    } catch (err) {
        console.error('Google Reviews sync error:', err);
        res.status(500).json({ error: 'Sync failed', details: err.message });
    }
});

module.exports = router;
