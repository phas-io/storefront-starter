/** Prices from the API are decimal numbers in the given currency. */
export const money = (amount: number | null | undefined, currency: string) =>
  amount == null ? '-' : new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)

export const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('en') : '-')
