const STOREFRONT_ORIGIN = 'https://storefront.invalid'

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
