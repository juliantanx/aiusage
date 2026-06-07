export type CurrencyCode = 'USD' | 'CNY'

export interface ExchangeRateState {
  base: 'USD'
  target: 'CNY'
  rate: number | null
  fetchedAt: number | null
  date?: string
  source: string
  error?: string
}

export const EXCHANGE_RATE_SOURCE = 'https://latest.currency-api.pages.dev/v1/currencies/usd.json'

export const currencies: Array<{ code: CurrencyCode; label: string }> = [
  { code: 'USD', label: 'USD' },
  { code: 'CNY', label: 'CNY' },
]

export function convertUsdCost(
  value: number,
  currency: CurrencyCode,
  exchangeRate: ExchangeRateState | null
): number | null {
  if (currency === 'USD') return value
  if (exchangeRate?.rate && Number.isFinite(exchangeRate.rate)) return value * exchangeRate.rate
  return null
}

export function formatUsdCost(
  value: number,
  currency: CurrencyCode,
  locale: string,
  exchangeRate: ExchangeRateState | null,
  compact = false
): string {
  const converted = convertUsdCost(value, currency, exchangeRate)
  return converted === null ? '--' : formatCurrency(converted, currency, locale, compact)
}

export function formatCurrency(
  value: number,
  currency: CurrencyCode,
  locale: string,
  compact = false
): string {
  const notation = compact && Math.abs(value) >= 1_000 ? 'compact' : 'standard'
  const fractionDigits = value >= 100 || notation === 'compact'
    ? 0
    : value >= 1
      ? 2
      : value > 0
        ? 3
        : 0

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}
