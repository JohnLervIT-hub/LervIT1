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
    sessionStorage.setItem(key, jsonData);
    sessionStorage.setItem(`${DRAFT_KEY_PREFIX}latest`, jsonData);
  } catch (e) {
    console.error('[BookingDraft] Failed to save draft:', e);
  }
}

export function loadDraft(moverId: string | null): BookingDraft | null {
  try {
    let key = getDraftKey(moverId);
    let jsonData = sessionStorage.getItem(key);
    if (!jsonData) {
      jsonData = sessionStorage.getItem(`${DRAFT_KEY_PREFIX}latest`);
    }
    if (!jsonData) return null;
    
    const draft: BookingDraft = JSON.parse(jsonData);
    if (draft.version !== DRAFT_VERSION) {
      clearDraft(moverId);
      return null;
    }
    if (isExpired(draft.createdAt)) {
      clearDraft(moverId);
      clearDraft(null);
      return null;
    }
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
    localStorage.removeItem('pendingBooking');
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
