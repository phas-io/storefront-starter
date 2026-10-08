import 'server-only'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}. Refer to .env.example.`)
  return value
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '')

/** Server-only configuration. The values are read when they are first used. */
export const env = {
  get storeName() {
    return required('STORE_NAME')
  },
  get authServer() {
    return withoutTrailingSlash(required('AUTH_SERVER'))
  },
  get apiBase() {
    return withoutTrailingSlash(required('API_BASE'))
  },
  get clientId() {
    return required('AUTH_CLIENT_ID')
  },
  get clientSecret() {
    return required('AUTH_CLIENT_SECRET')
  }
}
