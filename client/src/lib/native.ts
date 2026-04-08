import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

export const API_BASE_URL = isNative ? 'https://app.lervit.com' : '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function openUrl(url: string, target: '_blank' | '_self' = '_blank'): Promise<void> {
  if (isNative) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, target);
  }
}

export async function openTel(phone: string): Promise<void> {
  const url = `tel:${phone}`;
  if (isNative) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_self');
  }
}
