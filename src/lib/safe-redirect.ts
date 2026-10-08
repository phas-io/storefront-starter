const STOREFRONT_ORIGIN = 'https://storefront.invalid'

/** Return only a local path, query, and fragment for a post-auth redirect. */
export function safeRedirectPath(value: string): string {
  try {
    const url = new URL(value, STOREFRONT_ORIGIN)
    const pathname = url.pathname
    if (url.origin !== STOREFRONT_ORIGIN || !pathname.startsWith('/') || pathname.startsWith('//')) return '/'
    return `${pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}
