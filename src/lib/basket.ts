import 'server-only'
import { cookies } from 'next/headers'
import type { CartItem, CreateOrder, CreateShipping, LeadTime, Process } from './types'

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
  lines: BasketLine[]
}

const emptyBasket: Basket = { cartId: null, claimed: false, lines: [] }

export async function readBasket(): Promise<Basket> {
  const raw = (await cookies()).get(BASKET_COOKIE)?.value
  if (!raw) return emptyBasket
  try {
    return JSON.parse(raw) as Basket
  } catch {
    return emptyBasket
  }
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
  const process = processes.find(p => p.isDefault && p.materials.length > 0) ?? processes.find(p => p.materials.length > 0)
  if (!process) return null
  const material = process.materials.find(m => m.isDefault) ?? process.materials[0]
  const leadTime = leadTimes.find(l => l.isDefault) ?? leadTimes[0]
  return { processPricesId: process.id, materialId: material.id, leadTimeId: leadTime?.id ?? null }
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
