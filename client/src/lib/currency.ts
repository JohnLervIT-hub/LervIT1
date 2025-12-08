type CurrencyCode = 'CAD' | 'USD' | 'EUR' | 'GBP';
type LocaleCode = 'en-CA' | 'en-US' | 'fr-CA' | 'en-GB';

interface CurrencyConfig {
  code: CurrencyCode;
  locale: LocaleCode;
  symbol: string;
}

const currencyConfigs: Record<CurrencyCode, CurrencyConfig> = {
  CAD: { code: 'CAD', locale: 'en-CA', symbol: '$' },
  USD: { code: 'USD', locale: 'en-US', symbol: '$' },
  EUR: { code: 'EUR', locale: 'en-GB', symbol: '€' },
  GBP: { code: 'GBP', locale: 'en-GB', symbol: '£' },
};

const DEFAULT_CURRENCY: CurrencyCode = 'CAD';

export function formatCurrency(
  amount: number | string | null | undefined,
  options?: {
    currency?: CurrencyCode;
    compact?: boolean;
    showDecimals?: boolean;
  }
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (numAmount === null || numAmount === undefined || isNaN(numAmount)) {
    return '$0.00';
  }

  const currency = options?.currency || DEFAULT_CURRENCY;
  const config = currencyConfigs[currency];
  const showDecimals = options?.showDecimals !== false;
  
  const formatter = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.code,
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
    notation: options?.compact ? 'compact' : 'standard',
  });

  return formatter.format(numAmount);
}

export function formatCurrencyCompact(amount: number | string | null | undefined): string {
  return formatCurrency(amount, { compact: true });
}

export function formatCurrencyWhole(amount: number | string | null | undefined): string {
  return formatCurrency(amount, { showDecimals: false });
}

export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function getCurrencySymbol(currency: CurrencyCode = DEFAULT_CURRENCY): string {
  return currencyConfigs[currency].symbol;
}

export { DEFAULT_CURRENCY, type CurrencyCode };
