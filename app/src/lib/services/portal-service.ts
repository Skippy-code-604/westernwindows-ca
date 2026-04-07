import { getAuth } from 'firebase/auth';

// ---- Types ----

export interface LineItem {
    line_number: number;
    qty: number;
    width: number | null;
    height: number | null;
    product_type: string | null;
    series: string | null;
    glass_type: string | null;
    thickness: string | null;
    tint_coating: string | null;
    is_igu: boolean;
    igu_config: string | null;
    spacer_type: string | null;
    gas_fill: string | null;
    shape: string | null;
    edge_work: string | null;
    holes_cutouts: string | null;
    frit_pattern: string | null;
    product_category: string | null;
    application_type: string | null;
    frame_color: string | null;
    grid_pattern: string | null;
    grid_type: string | null;
    glass_package: string | null;
    tempered: boolean;
    screen: string | null;
    hardware_color: string | null;
    operating_style: string | null;
    energy_star: boolean;
    door_type: string | null;
    door_material: string | null;
    door_style: string | null;
    unit_price: number;
    line_total: number;
    frame_type: string | null;
    reno_flange_size: string | null;
    notes: string | null;
    quoted_price?: number;
}

export type DocType = 'RFQ' | 'PO';
export type DocStatus = 'Draft' | 'Sent' | 'Quoted' | 'Ordered' | 'Delivered' | 'Confirmed' | 'Cancelled';

export interface PortalDocument {
    id: string;
    doc_type: DocType;
    doc_number: string;
    status: DocStatus;
    created_date: string;
    required_date: string | null;
    supplier_id: string;
    supplier_name?: string;
    project_name: string | null;
    job_address: string | null;
    requested_by: string;
    shipping_method: string;
    notes: string | null;
    quote_reference: string | null;
    total_amount: number;
    line_items?: LineItem[];
    batch_group?: string;
    converted_from_rfq?: string;
    order_confirmation?: string;
    updated_at?: string;
}

export interface Supplier {
    id: string;
    name: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    type?: string;
    address?: string;
    products?: string[];
}

export interface DocumentFilters {
    doc_type?: string | null;
    supplier_id?: string | null;
    status?: string | null;
    search?: string | null;
    date_from?: string | null;
    date_to?: string | null;
}

// ---- Valid statuses ----

export const DOC_STATUSES: DocStatus[] = ['Draft', 'Sent', 'Quoted', 'Ordered', 'Delivered', 'Confirmed', 'Cancelled'];

export const PIPELINE_STATUSES: DocStatus[] = ['Draft', 'Sent', 'Quoted', 'Ordered', 'Delivered'];

// ---- Auth Helper ----

async function getAuthToken(): Promise<string> {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
}

// ---- API Fetch Wrapper ----

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await getAuthToken();
    const config: RequestInit = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        },
    };
    const res = await fetch(`/api${url}`, config);
    if (res.status === 401) {
        throw new Error('Unauthorized — please sign in again');
    }
    return res;
}

// ---- Documents API ----

export async function fetchDocuments(filters?: DocumentFilters): Promise<PortalDocument[]> {
    const params = new URLSearchParams();
    if (filters) {
        if (filters.doc_type) params.set('doc_type', filters.doc_type);
        if (filters.supplier_id) params.set('supplier_id', filters.supplier_id);
        if (filters.status) params.set('status', filters.status);
        if (filters.search) params.set('search', filters.search);
        if (filters.date_from) params.set('date_from', filters.date_from);
        if (filters.date_to) params.set('date_to', filters.date_to);
    }
    const query = params.toString();
    const res = await apiFetch(`/documents${query ? '?' + query : ''}`);
    if (!res.ok) throw new Error('Failed to fetch documents');
    return res.json();
}

export async function fetchRecentDocuments(): Promise<PortalDocument[]> {
    const res = await apiFetch('/documents/recent/list');
    if (!res.ok) throw new Error('Failed to fetch recent documents');
    return res.json();
}

export async function fetchDocument(id: string): Promise<{ document: PortalDocument; lineItems: LineItem[] }> {
    const res = await apiFetch(`/documents/${id}`);
    if (!res.ok) throw new Error('Document not found');
    return res.json();
}

export async function getNextDocNumber(type: DocType): Promise<string> {
    const res = await apiFetch(`/documents/next-number/${type}`);
    if (!res.ok) throw new Error('Failed to get next doc number');
    const data = await res.json();
    return data.number;
}

export async function createDocument(
    document: Partial<PortalDocument>,
    lineItems: Partial<LineItem>[]
): Promise<{ document: PortalDocument; lineItems: LineItem[] }> {
    const res = await apiFetch('/documents', {
        method: 'POST',
        body: JSON.stringify({ document, lineItems }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create document');
    }
    return res.json();
}

export async function createBatchDocuments(
    document: Partial<PortalDocument>,
    lineItems: Partial<LineItem>[],
    supplierIds: string[]
): Promise<{ documents: PortalDocument[] }> {
    const res = await apiFetch('/documents/batch', {
        method: 'POST',
        body: JSON.stringify({ document, lineItems, supplier_ids: supplierIds }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create batch documents');
    }
    return res.json();
}

export async function updateDocument(
    id: string,
    document: Partial<PortalDocument>,
    lineItems: Partial<LineItem>[]
): Promise<{ document: PortalDocument; lineItems: LineItem[] }> {
    const res = await apiFetch(`/documents/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ document, lineItems }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update document');
    }
    return res.json();
}

export async function updateDocumentStatus(id: string, status: DocStatus): Promise<PortalDocument> {
    const res = await apiFetch(`/documents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update status');
    return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
    const res = await apiFetch(`/documents/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete document');
}

export async function convertRfqToPo(id: string): Promise<{ document: PortalDocument }> {
    const res = await apiFetch(`/documents/${id}/convert-to-po`, { method: 'POST' });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to convert RFQ to PO');
    }
    return res.json();
}

export async function saveQuotePrices(
    id: string,
    prices: { line_number: number; quoted_price: number }[]
): Promise<PortalDocument> {
    const res = await apiFetch(`/documents/${id}/quote-prices`, {
        method: 'PATCH',
        body: JSON.stringify({ prices }),
    });
    if (!res.ok) throw new Error('Failed to save quote prices');
    return res.json();
}

export async function fetchBatchGroup(group: string): Promise<PortalDocument[]> {
    const res = await apiFetch(`/documents/batch-group/${encodeURIComponent(group)}`);
    if (!res.ok) throw new Error('Failed to fetch batch group');
    return res.json();
}

// ---- Suppliers API ----

export async function fetchSuppliers(type?: string): Promise<Supplier[]> {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    const res = await apiFetch(`/suppliers${query}`);
    if (!res.ok) throw new Error('Failed to fetch suppliers');
    return res.json();
}

export async function fetchSupplier(id: string): Promise<Supplier> {
    const res = await apiFetch(`/suppliers/${id}`);
    if (!res.ok) throw new Error('Supplier not found');
    return res.json();
}

// ---- Formatting Helpers (ported from utils.js) ----

export function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatCurrency(amount: number | null | undefined): string {
    if (!amount || amount === 0) return '—';
    return '$' + Number(amount).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCurrencyShort(amount: number | null | undefined): string {
    if (!amount || amount === 0) return '$0';
    return '$' + Number(amount).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
