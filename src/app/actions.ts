'use server'

import { redirect } from 'next/navigation'
import * as authApi from '@/lib/auth-api'
import { clearBasket, readBasket, toCartItem, toCreateOrder, writeBasket } from '@/lib/basket'
import * as api from '@/lib/customer-api'
import {
  clearGuestSession,
  endCustomerSession,
  ensureSession,
  getCustomerSession,
  getGuestToken,
  startCustomerSession
} from '@/lib/session'
import { toShipping } from '@/lib/shipping'

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim()

/** Accepts only a path on this site as the page to go to after sign-in. */
const safePath = (path: string) => (path.startsWith('/') && !path.startsWith('//') ? path : '/')

const query = (values: Record<string, string>) => new URLSearchParams(values).toString()

// ---------------------------------------------------------------- Sign-in

/** Step 1: find the factors for this customer, and send a code if one is necessary. */
export async function startSignIn(form: FormData) {
  const email = text(form, 'email').toLowerCase()
  const next = safePath(text(form, 'next'))

  const preAuth = await authApi.preAuthenticate(email)
  if (!preAuth.ok) {
    // 404: there is no account. Offer sign-up.
    if (preAuth.status === 404) redirect(`/sign-up?${query({ email, next })}`)
    redirect(`/login?${query({ error: preAuth.status === 429 ? 'rate' : 'failed', next })}`)
  }

  const factors = preAuth.data.result
  if (factors.includes('OTP')) {
    const sent = await authApi.sendSignInCode(email)
    if (!sent.ok) redirect(`/login?${query({ error: sent.status === 429 ? 'rate' : 'failed', next })}`)
  }
  redirect(`/login?${query({ email, factors: factors.join(','), next })}`)
}

/** Step 2: sign in with the password, the code, or the two together. */
export async function completeSignIn(form: FormData) {
  const email = text(form, 'email').toLowerCase()
  const factors = text(form, 'factors')
  const next = safePath(text(form, 'next'))
  const password = text(form, 'password') || undefined
  const otp = text(form, 'otp') || undefined

  const result = await authApi.signIn(email, { password, otp })
  if (!result.ok) {
    const error = result.status === 429 ? 'rate' : result.status === 401 ? 'credentials' : 'failed'
    redirect(`/login?${query({ email, factors, next, error })}`)
  }
  // The customer exists, but the manufacturer must approve the account first.
  if (!authApi.isToken(result.data)) redirect('/login?notice=approval')

  await startCustomerSession(result.data)
  await claimGuestCart(result.data.access_token)
  redirect(next)
}

// ---------------------------------------------------------------- Sign-up

/** Step 1: send a code to the email address. */
export async function startSignUp(form: FormData) {
  const email = text(form, 'email').toLowerCase()
  const next = safePath(text(form, 'next'))

  const sent = await authApi.sendSignUpCode(email)
  if (!sent.ok) {
    // 409: the customer exists. Go to sign-in.
    if (sent.status === 409) redirect(`/login?${query({ notice: 'exists', next })}`)
    redirect(`/sign-up?${query({ email, next, error: sent.status === 429 ? 'rate' : 'failed' })}`)
  }
  redirect(`/sign-up?${query({ email, next, step: 'code' })}`)
}

/** Step 2: create the customer with the code. Sign-up does not accept a password. */
export async function completeSignUp(form: FormData) {
  const email = text(form, 'email').toLowerCase()
  const next = safePath(text(form, 'next'))

  const result = await authApi.signUp({
    email,
    otp: text(form, 'otp'),
    firstName: text(form, 'firstName'),
    lastName: text(form, 'lastName'),
    companyName: text(form, 'companyName') || undefined
  })
  if (!result.ok) {
    let error = 'failed'
    if (result.status === 401) error = 'code'
    if (result.status === 429) error = 'rate'
    // The code is used up in this case. The customer must request a new one.
    if (result.code === 'CUSTOMER_ORGANISATION_DUPLICATE_NAME') error = 'company'
    redirect(`/sign-up?${query({ email, next, error, ...(error === 'code' ? { step: 'code' } : {}) })}`)
  }
  if (!authApi.isToken(result.data)) redirect('/login?notice=approval')

  await startCustomerSession(result.data)
  await claimGuestCart(result.data.access_token)
  redirect(next)
}

export async function signOut() {
  // There is no sign-out endpoint. Delete this storefront's copy of the token.
  await endCustomerSession()
  await clearBasket()
  redirect('/')
}

/** Moves the parts and the cart of the guest to the customer who signed in. */
async function claimGuestCart(customerToken: string) {
  const basket = await readBasket()
  if (basket.cartId && !basket.claimed) {
    const guestToken = await getGuestToken()
    if (guestToken) {
      await api.claimCart(customerToken, basket.cartId, guestToken)
      await writeBasket({ ...basket, claimed: true })
    } else {
      // The guest session expired, so its parts cannot be moved.
      await clearBasket()
    }
  }
  await clearGuestSession()
}

// ---------------------------------------------------------------- Basket

export async function updateLine(form: FormData) {
  const basket = await readBasket()
  const line = basket.lines.find(l => l.key === text(form, 'key'))
  if (!line || !basket.cartId) redirect('/')

  const processes = await api.getProcesses()
  const process = processes.find(p => p.id === text(form, 'processPricesId')) ?? processes.find(p => p.id === line.processPricesId)
  if (!process) redirect('/')

  // If the process changed, the old material is possibly not available. Use the default.
  const material =
    process.materials.find(m => m.id === Number(text(form, 'materialId'))) ??
    process.materials.find(m => m.isDefault) ??
    process.materials[0]

  const updated = {
    ...line,
    quantity: Math.max(1, Math.floor(Number(text(form, 'quantity')) || 1)),
    processPricesId: process.id,
    materialId: material.id,
    leadTimeId: text(form, 'leadTimeId') || line.leadTimeId
  }

  const session = await ensureSession()
  await api.updateCartItem(session.token, basket.cartId, line.itemId, toCartItem(updated))
  await writeBasket({ ...basket, lines: basket.lines.map(l => (l.key === line.key ? updated : l)) })
  redirect('/')
}

export async function removeLine(form: FormData) {
  const basket = await readBasket()
  const line = basket.lines.find(l => l.key === text(form, 'key'))
  if (line && basket.cartId) {
    const session = await ensureSession()
    await api.removeCartItem(session.token, basket.cartId, line.itemId)
    await writeBasket({ ...basket, lines: basket.lines.filter(l => l.key !== line.key) })
  }
  redirect('/')
}

// ---------------------------------------------------------------- Checkout

async function requireCustomer(next: string) {
  const session = await getCustomerSession()
  if (!session) redirect(`/login?${query({ next })}`)
  return session
}

export async function saveAddress(form: FormData) {
  const session = await requireCustomer('/checkout')
  const address = await api.createAddress(session.token, {
    name: text(form, 'name'),
    company: text(form, 'company'),
    street1: text(form, 'street1'),
    street2: text(form, 'street2'),
    city: text(form, 'city'),
    state: text(form, 'state'),
    zip: text(form, 'zip'),
    country: text(form, 'country'),
    jurisdictionIsoCode: text(form, 'jurisdictionIsoCode'),
    phone: text(form, 'phone'),
    email: text(form, 'email') || session.customer.email,
    residential: form.get('residential') === 'on',
    taxId: text(form, 'taxId') || null,
    isBillingAddress: true,
    isShippingAddress: true
  })
  redirect(`/checkout?${query({ address: String(address.addressId) })}`)
}

export async function placeOrder(form: FormData) {
  const session = await requireCustomer('/checkout')
  const basket = await readBasket()
  if (basket.lines.length === 0 || !basket.cartId) redirect('/')

  const addressId = Number(text(form, 'address'))
  const [store, methods] = await Promise.all([api.getStore(), api.getShippingMethods(session.token)])
  const shipping = toShipping(text(form, 'shipping'), methods, addressId)
  if (!addressId || !shipping) redirect('/checkout')

  const order = toCreateOrder(basket, store.currency, { shipping, billingAddressId: addressId })

  // The API calculates the price again when it creates the order. This call only
  // tells the storefront if the customer can pay now, or if a review is necessary.
  const { purchasability } = await api.getPrice(session.token, order)

  const created = await api.createOrder(session.token, {
    ...order,
    cartId: basket.cartId,
    // "CHECKOUT": the customer continues to payment now, so no "quote ready" notification is necessary.
    ...(purchasability.canBePurchased ? { intent: 'CHECKOUT' as const } : {})
  })

  await clearBasket()
  redirect(`/orders/${created.order.id}`)
}

// ---------------------------------------------------------------- Payment

export async function payByInvoice(form: FormData) {
  const orderId = Number(text(form, 'orderId'))
  const session = await requireCustomer(`/orders/${orderId}`)
  let failed = false
  try {
    await api.payByInvoice(session.token, orderId)
  } catch (error) {
    // A 400 status with an empty body: this method is not permitted for this order.
    if (!(error instanceof api.ApiError)) throw error
    failed = true
  }
  redirect(`/orders/${orderId}${failed ? '?error=payment' : ''}`)
}

export async function payByPurchaseOrder(form: FormData) {
  const orderId = Number(text(form, 'orderId'))
  const session = await requireCustomer(`/orders/${orderId}`)
  const file = form.get('file')
  let failed = false
  try {
    await api.payByPurchaseOrder(session.token, orderId, text(form, 'purchaseOrderNumber'), file instanceof File ? file : null)
  } catch (error) {
    if (!(error instanceof api.ApiError)) throw error
    failed = true
  }
  redirect(`/orders/${orderId}${failed ? '?error=payment' : ''}`)
}
