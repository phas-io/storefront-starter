export type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Reads one search parameter as a string. */
export const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''
