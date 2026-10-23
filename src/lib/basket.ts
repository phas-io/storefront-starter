import 'server-only'
import { cookies } from 'next/headers'
import type { CartItem, CreateOrder, CreateShipping, LeadTime, Process } from './types'
import type { Session } from './session'

/**
 * The basket: this storefront's own record of the cart.
 *
 * A guest can create a cart and change its items through the Customer API, but a
 * guest cannot read the cart back. Thus the storefront keeps the cart ID and the
 * lines. To keep this example small, the basket is in an HttpOnly cookie (which
 * holds approximately 10 lines). A production storefront keeps it in a database,
 * or reads `GET /cart/{cartId}` after sign-in.
 */

const BASKET_COOKIE = 'sf_basket'

export type BasketLine = {
  /** Your key for the line in pre-order and order calls. */
  key: string
  /** The ID of the cart item in the Customer API. */
  itemId: number
  partRevisionId: string
  name: string
  size: [number, number, number]
  quantity: number
  processPricesId: string
  materialId: number
  leadTimeId: string | null
}

export type Basket = {
  cartId: string | null
  /** True when the cart belongs to a customer. False when it belongs to a guest. */
  claimed: boolean
  /** The organisation ID once claimed, the guest token subject before. Null in older basket cookies. */
  owner: string | null
  /** True once this guest's cart can't be used. Its lines still show until the basket is cleared. */
  guestAccessInvalid?: boolean
  lines: BasketLine[]
}

const emptyBasket: Basket = { cartId: null, claimed: false, owner: null, lines: [] }

export async function readBasket(): Promise<Basket> {
  const raw = (await cookies()).get(BASKET_COOKIE)?.value
  if (!raw) return emptyBasket
  try {
    const basket = JSON.parse(raw) as Basket
    return { ...basket, owner: basket.owner ?? null }
  } catch {
    return emptyBasket
  }
}

export type BasketAccess = 'ready' | 'guest-expired' | 'customer-sign-in' | 'different-customer'

export function basketAccess(basket: Basket, session: Session | null): BasketAccess {
  if (!basket.cartId) return 'ready'
  if (basket.claimed) {
    if (!session?.customer) return 'customer-sign-in'
    return basket.owner && basket.owner !== String(session.customer.organisationId) ? 'different-customer' : 'ready'
  }
  if (!session || session.customer || basket.guestAccessInvalid || (basket.owner && basket.owner !== session.subject)) return 'guest-expired'
  return 'ready'
}

export function availableProcesses(processes: Process[]): Process[] {
  return processes.filter(process => process.materials.length > 0)
}

export function availableSelection(processes: Process[], processId: string, materialId: number) {
  const selectable = availableProcesses(processes)
  const process = selectable.find(candidate => candidate.id === processId) ?? selectable.find(candidate => candidate.isDefault) ?? selectable[0]
  if (!process) return null
  const material = process.materials.find(candidate => candidate.id === materialId) ?? process.materials.find(candidate => candidate.isDefault) ?? process.materials[0]
  return { process, material, changed: process.id !== processId || material.id !== materialId }
}

/** Call only from a Server Action or a Route Handler. */
export async function writeBasket(basket: Basket): Promise<void> {
  ;(await cookies()).set(BASKET_COOKIE, JSON.stringify(basket), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  })
}

export async function clearBasket(): Promise<void> {
  ;(await cookies()).delete(BASKET_COOKIE)
}

/** The configuration that a new part gets: the defaults of the store. */
export function defaultConfiguration(processes: Process[], leadTimes: LeadTime[]) {
  const selection = availableSelection(processes, '', -1)
  if (!selection) return null
  const leadTime = leadTimes.find(l => l.isDefault) ?? leadTimes[0]
  return { processPricesId: selection.process.id, materialId: selection.material.id, leadTimeId: leadTime?.id ?? null }
}

/** The cart item for a line. This example uses millimetres and no optional options. */
export const toCartItem = (line: BasketLine): CartItem => ({
  partRevisionId: line.partRevisionId,
  name: line.name,
  quantity: line.quantity,
  units: 'MILLIMETERS',
  processPricesId: line.processPricesId,
  materialId: line.materialId,
  colorId: null,
  infillId: null,
  precisionPricesId: null,
  leadTimeId: line.leadTimeId,
  postProcessingIds: []
})

/** The body for `POST /pre-order` and `POST /order`. */
export function toCreateOrder(
  basket: Basket,
  currency: string,
  checkout: { shipping: CreateShipping | null; billingAddressId: number | null } = { shipping: null, billingAddressId: null }
): CreateOrder {
  return {
    currency,
    requisitions: Object.fromEntries(
      basket.lines.map((line, sequence) => [
        line.key,
        {
          sequence,
          partRevisionId: line.partRevisionId,
          units: 'MILLIMETERS' as const,
          quantity: line.quantity,
          processPricesId: line.processPricesId,
          materialId: line.materialId,
          infillId: null,
          // Note: this field is `precisionPricesId` in a cart item.
          precisionId: null,
          colorId: null,
          leadTimeId: line.leadTimeId,
          postProcessingIds: [],
          comments: [],
          name: line.name
        }
      ])
    ),
    shipping: checkout.shipping,
    shippingId: null,
    billingAddressId: checkout.billingAddressId,
    discountId: null,
    operatorNote: null,
    affiliate: null,
    cartId: null
  }
}
