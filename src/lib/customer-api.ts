import 'server-only'
import { gzipSync } from 'node:zlib'
import { decode } from '@msgpack/msgpack'
import { env } from './env'
import type {
  Address,
  AnalysisResult,
  AnalysisStatus,
  Cart,
  CartItem,
  Country,
  CreateOrder,
  CustomerProfile,
  Jurisdiction,
  LeadTime,
  NewAddress,
  Order,
  Payment,
  PreOrder,
  Process,
  Purchasability,
  Quote,
  Requisition,
  ShippingMethod,
  ShippingRates,
  Store
} from './types'

/**
 * Client for the Phasio Customer API.
 *
 * Each call sends the `X-Store-Name` header. Calls that are not public also send
 * the access token (guest or customer) as a Bearer token.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** A stable error code, when the API gives one. Some errors have an empty body. */
    readonly code: string | null,
    message: string
  ) {
    super(message)
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  token?: string
  json?: unknown
  form?: FormData
  headers?: Record<string, string>
  /** Seconds to cache a public GET. Calls with a token are not cached. */
  revalidate?: number
}

async function send(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { 'X-Store-Name': env.storeName, ...options.headers }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.json !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${env.apiBase}/api/customer/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.form ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined),
    ...(options.revalidate && !options.token ? { next: { revalidate: options.revalidate } } : { cache: 'no-store' as const })
  })

  if (!response.ok) {
    // Check the status first: many errors have an empty body.
    const body = await response.json().catch(() => null)
    const code = typeof body?.error === 'string' && /^[A-Z_]+$/.test(body.error) ? body.error : null
    throw new ApiError(response.status, code, body?.message ?? body?.error ?? `Request failed with status ${response.status}`)
  }
  return response
}

const json = async <T>(path: string, options?: RequestOptions) => (await send(path, options)).json() as Promise<T>

// ---------------------------------------------------------------- Store (public)

export const getStore = () => json<Store>('/operator', { revalidate: 60 })
export const getProcesses = () => json<Process[]>('/operator/processes', { revalidate: 60 })
export const getLeadTimes = async () =>
  (await json<LeadTime[]>('/operator/lead-times', { revalidate: 60 })).filter(leadTime => !leadTime.isDeleted)
export const getCountries = () => json<Country[]>('/countries', { revalidate: 3600 })

// ---------------------------------------------------------------- Parts (guest or customer)

/** Uploads one part file. Returns the analysis ID. */
export async function uploadPart(token: string, file: File): Promise<string> {
  // The API expects the file data compressed with gzip.
  const compressed = gzipSync(Buffer.from(await file.arrayBuffer()))
  const form = new FormData()
  form.append('file', new Blob([compressed]), file.name)

  return json<string>('/part-revision/upload', {
    method: 'PUT',
    token,
    form,
    // The API reads the file type from the extension of this name.
    headers: { 'X-Filename': encodeURIComponent(file.name) }
  })
}

export async function getAnalysisStatus(token: string, analysisId: string): Promise<AnalysisStatus> {
  const statuses = await json<Record<string, AnalysisStatus>>(
    `/part-revision/upload/status?analysisIds=${encodeURIComponent(analysisId)}`,
    { token }
  )
  return statuses[analysisId] ?? 'ANALYSIS_FAILED'
}

/**
 * Reads the analysis result. The body is MessagePack, and the API lets you read
 * it ONE TIME only. Keep the data that you need.
 */
export async function getAnalysisResult(token: string, analysisId: string): Promise<AnalysisResult> {
  const response = await send(`/part-revision/upload/${analysisId}/results`, {
    token,
    headers: { Accept: 'application/msgpack' }
  })
  const result = decode(new Uint8Array(await response.arrayBuffer())) as AnalysisResult
  // The result also has binary fields (stl, thumbnail, wallThickness). This example does not use them.
  return {
    partRevisionId: result.partRevisionId,
    fileName: result.fileName,
    width: result.width,
    height: result.height,
    length: result.length,
    volume: result.volume,
    watertight: result.watertight
  }
}

// ---------------------------------------------------------------- Cart (guest or customer)

export const createCart = (token: string) => json<Cart>('/cart', { method: 'POST', token })

export const addCartItem = (token: string, cartId: string, item: CartItem) =>
  json<CartItem & { id: number }>(`/carts/${cartId}/items`, { method: 'POST', token, json: item })

export const updateCartItem = (token: string, cartId: string, itemId: number, item: CartItem) =>
  json<CartItem>(`/carts/${cartId}/items/${itemId}`, { method: 'PUT', token, json: item })

export const removeCartItem = (token: string, cartId: string, itemId: number) =>
  send(`/carts/${cartId}/items/${itemId}`, { method: 'DELETE', token })

/**
 * Moves all parts and open carts of a guest to the signed-in customer.
 * A 409 status means that the cart is already claimed.
 */
export async function claimCart(customerToken: string, cartId: string, guestToken: string): Promise<void> {
  try {
    await send(`/cart/${cartId}/claim`, { method: 'PATCH', token: customerToken, json: { anonymousSessionToken: guestToken } })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return
    throw error
  }
}

// ---------------------------------------------------------------- Prices (guest or customer)

/** Calculates the price. The call stores no data: call it again after each change. */
export const getPrice = (token: string, order: CreateOrder) => json<PreOrder>('/pre-order', { method: 'POST', token, json: order })

// ---------------------------------------------------------------- Customer only

export const getCustomer = (token: string) => json<CustomerProfile>('/customer', { token })

export const listAddresses = async (token: string) =>
  (await json<Address[]>('/address', { token })).filter(address => !address.isDeleted)

export const createAddress = (token: string, address: NewAddress) =>
  json<Address>('/address', { method: 'POST', token, json: address })

export const getJurisdictions = (token: string, country: string) =>
  json<Jurisdiction[]>(`/countries/${encodeURIComponent(country)}/jurisdictions`, { token })

export const getShippingMethods = (token: string) => json<ShippingMethod[]>('/operator/shipping-methods', { token })

export const getShippingRates = (
  token: string,
  body: { currency: string; toAddressId: number; parts: Pick<CartItem, 'partRevisionId' | 'units' | 'quantity' | 'processPricesId' | 'materialId'>[] }
) => json<ShippingRates[]>('/shipping/rate', { method: 'POST', token, json: body })

export const createOrder = (token: string, order: CreateOrder) =>
  json<{ order: Order }>('/order', { method: 'POST', token, json: order })

export const listOrders = (token: string) => json<Order[]>('/order', { token })
export const getOrder = (token: string, orderId: number) => json<Order>(`/order/${orderId}`, { token })
export const getOrderLines = (token: string, orderId: number) => json<Requisition[]>(`/requisition?orderId=${orderId}`, { token })
export const getOrderQuote = (token: string, orderId: number) => json<Quote>(`/order/${orderId}/quote`, { token })
export const getOrderPurchasability = (token: string, orderId: number) =>
  json<Purchasability>(`/order/${orderId}/purchasability`, { token })

/** Starts an online payment. Complete it in the browser with the SDK of the payment provider. */
export const createPayment = (token: string, orderId: number) =>
  json<Payment>(`/order/${orderId}/payment`, { method: 'POST', token })

export const payByInvoice = (token: string, orderId: number) =>
  json<Order>(`/order/${orderId}/payment/invoice`, { method: 'PATCH', token })

export function payByPurchaseOrder(token: string, orderId: number, purchaseOrderNumber: string, file: File | null) {
  const form = new FormData()
  form.append('purchaseOrderNumber', purchaseOrderNumber)
  if (file && file.size > 0) form.append('file', file, file.name)
  return json<Order>(`/order/${orderId}/payment/purchase-order`, { method: 'PATCH', token, form })
}

export type DocumentKind = 'estimate' | 'confirmation' | 'invoice'

/** Returns the PDF response for an order document. */
export const getOrderDocument = (token: string, orderId: number, kind: DocumentKind) =>
  send(`/document/order/${orderId}/${kind}`, { token })
