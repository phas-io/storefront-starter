import type { CreateShipping, ShippingMethod } from './types'

/**
 * The checkout form sends the selected shipping option as one string:
 *   "collect:<shippingMethodId>"            collection from the manufacturer
 *   "rate:<shippingMethodId>:<rateId>"      a delivery rate from POST /shipping/rate
 */
export const collectionOption = (methodId: number) => `collect:${methodId}`
export const rateOption = (methodId: number, rateId: string) => `rate:${methodId}:${rateId}`

export function toShipping(option: string | undefined, methods: ShippingMethod[], toAddressId: number): CreateShipping | null {
  if (!option) return null
  const [kind, methodId, ...rest] = option.split(':')
  const method = methods.find(m => m.shippingMethodId === Number(methodId))
  if (!method) return null

  if (kind === 'collect' && method.shippingMode === 'SELF_COLLECTION') {
    return { shippingMode: 'SELF_COLLECTION', shippingMethodId: method.shippingMethodId }
  }
  if (kind === 'rate' && (method.shippingMode === 'FIXED_PRICE' || method.shippingMode === 'CARRIER_ACCOUNT')) {
    return { shippingMode: method.shippingMode, shippingMethodId: method.shippingMethodId, rateId: rest.join(':'), toAddressId }
  }
  return null
}
