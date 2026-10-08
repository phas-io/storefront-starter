import 'server-only'
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createGuestSession, type TokenResponse } from './auth-api'
import { env } from './env'

/**
 * Session storage.
 *
 * The access tokens stay in HttpOnly cookies, so browser scripts cannot read them.
 * There is no refresh token: a token is valid for 9 hours, then the customer signs in again.
 */

const CUSTOMER_COOKIE = 'sf_customer'
const GUEST_COOKIE = 'sf_guest'

export type Customer = {
  customerId: number
  organisationId: number
  email: string
  firstName: string
  lastName: string
  hasCustomPricing: boolean
}

export type Session = { token: string; subject: string; customer: Customer | null }

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

/** Verifies the signature, the issuer and the expiry. Returns null if the token is not valid. */
async function verify(token: string | undefined): Promise<JWTPayload | null> {
  if (!token) return null
  jwks ??= createRemoteJWKSet(new URL(`${env.authServer}/.well-known/jwks.json`))
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: env.authServer, algorithms: ['RS256'] })
    return payload
  } catch {
    return null
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge
})

function toCustomer(claims: JWTPayload): Customer {
  return {
    customerId: claims['customer-id'] as number,
    organisationId: claims['customer-organisation-id'] as number,
    email: claims['customer-principal'] as string,
    firstName: (claims['first-name'] as string) ?? '',
    lastName: (claims['last-name'] as string) ?? '',
    hasCustomPricing: Boolean(claims['has-custom-pricing'])
  }
}

/** The signed-in customer, or null. Safe to call from pages (it does not write cookies). */
export async function getCustomerSession(): Promise<(Session & { customer: Customer }) | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value
  const claims = await verify(token)
  if (!token || claims?.scope !== 'CUSTOMER' || !claims.sub) return null
  return { token, subject: String(claims.sub), customer: toCustomer(claims) }
}

export async function getGuestSession(): Promise<Session | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value
  const claims = await verify(token)
  if (!token || claims?.scope !== 'ANONYMOUS' || !claims.sub) return null
  return { token, subject: claims.sub, customer: null }
}

export async function getGuestToken(): Promise<string | null> {
  return (await getGuestSession())?.token ?? null
}

/** The customer session, or the guest token, or null. Safe to call from pages. */
export async function getSession(): Promise<Session | null> {
  const customer = await getCustomerSession()
  if (customer) return customer
  return getGuestSession()
}

/**
 * The customer session, or a guest session. Gets a new guest token if necessary.
 * This function can write a cookie: call it only from a Server Action or a Route Handler.
 */
export async function ensureSession(): Promise<Session> {
  const existing = await getSession()
  if (existing) return existing

  const result = await createGuestSession()
  if (!result.ok) throw new Error(`Could not start a guest session (${result.status}): ${result.message}`)
  const claims = await verify(result.data.access_token)
  if (claims?.scope !== 'ANONYMOUS' || !claims.sub) throw new Error('Could not verify the guest session.')
  ;(await cookies()).set(GUEST_COOKIE, result.data.access_token, cookieOptions(result.data.expires_in))
  return { token: result.data.access_token, subject: claims.sub, customer: null }
}

export async function customerFromToken(token: string): Promise<Customer> {
  const claims = await verify(token)
  if (claims?.scope !== 'CUSTOMER') throw new Error('Could not verify the customer session.')
  return toCustomer(claims)
}

/** Stores the customer token after sign-in or sign-up. Call from a Server Action. */
export async function startCustomerSession(token: TokenResponse): Promise<void> {
  ;(await cookies()).set(CUSTOMER_COOKIE, token.access_token, cookieOptions(token.expires_in))
}

/** Signs the customer out. There is no sign-out endpoint: delete your copy of the token. */
export async function endCustomerSession(): Promise<void> {
  ;(await cookies()).delete(CUSTOMER_COOKIE)
}

export async function clearGuestSession(): Promise<void> {
  ;(await cookies()).delete(GUEST_COOKIE)
}
