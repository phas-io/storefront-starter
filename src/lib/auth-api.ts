import 'server-only'
import { env } from './env'

/**
 * Client for the Phasio Auth API.
 *
 * All calls go from this server to the Auth API. The storefront credentials
 * (client ID and client secret) must not go to the browser.
 */

export type TokenResponse = {
  scope: 'CUSTOMER' | 'ANONYMOUS'
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  expires_in: number
}

export type LoginFactor = 'PASSWORD' | 'OTP'
export type LoginMethod = 'PASSWORD' | 'OTP' | 'OTP_AND_PASSWORD'

export type AuthResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; code?: string }

type PendingApproval = { result: ['WAIT_FOR_APPROVAL'] }
export type SignInData = TokenResponse | PendingApproval
export type SignUpData = (TokenResponse & { approved: true }) | (PendingApproval & { approved: false })

export const isToken = (data: SignInData | SignUpData): data is TokenResponse =>
  'access_token' in data && Boolean(data.access_token)

async function call<T>(method: 'POST' | 'PATCH', path: string, body: unknown, authorization: string): Promise<AuthResult<T>> {
  const response = await fetch(`${env.authServer}${path}`, {
    method,
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  })
  const json = await response.json().catch(() => ({}))
  if (response.ok) return { ok: true, data: json as T }
  // Use the status code in your logic. The message text can change.
  return { ok: false, status: response.status, message: json.message ?? 'Request failed', code: json.code }
}

const withCredentials = <T>(path: string, body: unknown) => {
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')
  return call<T>('POST', path, body, `Basic ${basic}`)
}

/** Gets a guest token. Each call makes a new, independent guest. */
export const createGuestSession = () => withCredentials<TokenResponse>('/customer/anonymous', { store: env.storeName })

/** Tells you which factors the customer must give. A 404 status means "no account". */
export const preAuthenticate = (email: string) =>
  // This endpoint uses `username` and `storeName`. All other endpoints use `email` and `store`.
  withCredentials<{ result: LoginFactor[] }>('/customer/login/pre-auth', { username: email, storeName: env.storeName })

/** Sends a sign-in code. The answer is always `{ sent: true }`, also for an unknown customer. */
export const sendSignInCode = (email: string) =>
  withCredentials<{ sent: true }>('/customer/otp/send', { store: env.storeName, email })

export const signIn = (email: string, factors: { password?: string; otp?: string }) =>
  withCredentials<SignInData>('/customer/sign-in', { store: env.storeName, email, ...factors })

/** Sends a sign-up code. A 409 status means that the customer already exists. */
export const sendSignUpCode = (email: string, locale?: string) =>
  withCredentials<{ sent: true }>('/customer/signup/otp/send', { store: env.storeName, email, requestedLocale: locale })

export type SignUpDetails = { email: string; otp: string; firstName?: string; lastName?: string; companyName?: string }

/** Creates the customer. Do not send a password: the API rejects it. */
export const signUp = (details: SignUpDetails) =>
  withCredentials<SignUpData>('/customer/sign-up', { store: env.storeName, ...details })

export type ChangeLoginMethod = {
  newLoginMethod: LoginMethod
  newPassword?: string | null
  /** The current password, or… */
  passwordGuess?: string | null
  /** …a new code from `sendSignInCode`. */
  otpGuess?: string | null
}

/** Sets, changes or removes the password. This call uses the customer token, not the credentials. */
export const changeLoginMethod = (customerToken: string, body: ChangeLoginMethod) =>
  call<{ status: true }>('PATCH', '/customer/login/reset', body, `Bearer ${customerToken}`)
