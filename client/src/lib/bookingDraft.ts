const DRAFT_VERSION = 1;
const DRAFT_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
const DRAFT_KEY_PREFIX = 'lervit_booking_draft_';

export interface BookingDraftData {
  pickupAddress: string;
  dropoffAddress: string;
  pickupDifficulty: string;
  dropoffDifficulty: string;
  loadSize: string;
  heavyItem: boolean;
  numberOfMovers: number;
  description: string;
  images: string[];
  date: string;
  aiDetectedVolume?: number;
}

export interface BookingDraft {
  moverId: string | null;
  formData: BookingDraftData;
  createdAt: number;
  version: number;
}

function getDraftKey(moverId: string | null): string {
  return `${DRAFT_KEY_PREFIX}${moverId || 'none'}`;
}

export function isExpired(createdAt: number): boolean {
  return Date.now() - createdAt > DRAFT_EXPIRY_MS;
}

export function saveDraft(moverId: string | null, formData: BookingDraftData): void {
  try {
    const draft: BookingDraft = {
      moverId,
      formData,
      createdAt: Date.now(),
      version: DRAFT_VERSION,
    };
    const key = getDraftKey(moverId);
    const jsonData = JSON.stringify(draft);
    
    // Save to sessionStorage (primary)
    sessionStorage.setItem(key, jsonData);
    
    // Also save a "latest" key so we can find it even if moverId changes
    sessionStorage.setItem(`${DRAFT_KEY_PREFIX}latest`, jsonData);
    
    console.log('[BookingDraft] Saved draft:', { key, moverId, dataLength: jsonData.length });
  } catch (e) {
    console.error('[BookingDraft] Failed to save draft:', e);
  }
}

export function loadDraft(moverId: string | null): BookingDraft | null {
  try {
    // First try to load draft for specific moverId
    let key = getDraftKey(moverId);
    let jsonData = sessionStorage.getItem(key);
    
    // If not found, try the "latest" draft
    if (!jsonData) {
      jsonData = sessionStorage.getItem(`${DRAFT_KEY_PREFIX}latest`);
      console.log('[BookingDraft] Trying latest draft');
    }
    
    if (!jsonData) {
      console.log('[BookingDraft] No draft found');
      return null;
    }
    
    const draft: BookingDraft = JSON.parse(jsonData);
    
    // Check version compatibility
    if (draft.version !== DRAFT_VERSION) {
      console.log('[BookingDraft] Draft version mismatch, clearing');
      clearDraft(moverId);
      return null;
    }
    
    // Check expiry
    if (isExpired(draft.createdAt)) {
      console.log('[BookingDraft] Draft expired, clearing');
      clearDraft(moverId);
      clearDraft(null); // Also clear "latest"
      return null;
    }
    
    console.log('[BookingDraft] Loaded draft:', { 
      moverId: draft.moverId, 
      age: Math.round((Date.now() - draft.createdAt) / 1000 / 60) + ' minutes'
    });
    
    return draft;
  } catch (e) {
    console.error('[BookingDraft] Failed to load draft:', e);
    return null;
  }
}

export function clearDraft(moverId: string | null): void {
  try {
    const key = getDraftKey(moverId);
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}latest`);
    
    // Also clear from localStorage if it exists there
    localStorage.removeItem('pendingBooking');
    
    console.log('[BookingDraft] Cleared draft:', { key });
  } catch (e) {
    console.error('[BookingDraft] Failed to clear draft:', e);
  }
}

export function clearAllDrafts(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(DRAFT_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    localStorage.removeItem('pendingBooking');
    console.log('[BookingDraft] Cleared all drafts');
  } catch (e) {
    console.error('[BookingDraft] Failed to clear all drafts:', e);
  }
}

export function createRedirectUrl(moverId: string | null, formData: BookingDraftData): string {
  const params = new URLSearchParams();
  if (moverId) params.set('moverId', moverId);
  params.set('pickup', formData.pickupAddress);
  params.set('dropoff', formData.dropoffAddress);
  if (formData.pickupDifficulty) params.set('pickupAccess', formData.pickupDifficulty);
  if (formData.dropoffDifficulty) params.set('dropoffAccess', formData.dropoffDifficulty);
  params.set('loadSize', formData.loadSize);
  params.set('resumeStep', '2');
  return `/request-move?${params.toString()}`;
}
