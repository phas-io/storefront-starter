import { expect, mock, test } from 'bun:test'

let basket = { cartId: 'legacy-cart', claimed: false, owner: null, lines: [] }
let cleared = 0
let claimed = 0
let signedIn = 0
let signedOut = 0
let selection = null
let updated = 0
let updateError = null

mock.module('next/navigation', () => ({ redirect: path => { throw new Error(`redirect:${path}`) } }))
mock.module('@/lib/auth-api', () => ({
  signIn: async () => ({ ok: true, data: { access_token: 'customer-token', expires_in: 32400 } }),
  isToken: () => true
}))
mock.module('@/lib/basket', () => ({
  readBasket: async () => basket,
  clearBasket: async () => { cleared++ },
  writeBasket: async next => { basket = next },
  basketAccess: () => 'ready',
  availableSelection: () => selection,
  toCartItem: line => line,
  toCreateOrder: () => ({})
}))
class ApiError extends Error {
  constructor(status, code = null) { super('Cart not found'); this.status = status; this.code = code }
}
mock.module('@/lib/customer-api', () => ({
  ApiError,
  claimCart: async () => { claimed++; throw new ApiError(404) },
  getProcesses: async () => [],
  updateCartItem: async () => { updated++; if (updateError) throw updateError }
}))
mock.module('@/lib/session', () => ({
  getGuestSession: async () => ({ token: 'replacement-guest', subject: 'new-guest', customer: null }),
  customerFromToken: async () => ({ organisationId: 8 }),
  startCustomerSession: async () => { signedIn++ },
  endCustomerSession: async () => { signedOut++ },
  clearGuestSession: async () => {},
  getCustomerSession: async () => null,
  getSession: async () => ({ token: 'guest-token', subject: 'guest-1', customer: null })
}))

const { completeSignIn, resetBasket, signOut, updateLine } = await import('../src/app/actions.ts')

const redirectsToHome = async action => {
  await expect(action()).rejects.toThrow('redirect:/')
}

test('sign-in preserves an unowned legacy guest cart when the backend rejects its claim', async () => {
  const form = new FormData()
  form.set('email', 'shopper@example.test')
  await redirectsToHome(() => completeSignIn(form))
  expect(claimed).toBe(1)
  expect(cleared).toBe(0)
  expect(basket.guestAccessInvalid).toBe(true)
  expect(signedIn).toBe(1)
})

test('explicit sign-out clears the local basket', async () => {
  await redirectsToHome(signOut)
  expect(signedOut).toBe(1)
  expect(cleared).toBe(1)
})

test('start new basket clears the local cookie even when it was claimed', async () => {
  basket = { ...basket, claimed: true, owner: '8' }
  await redirectsToHome(resetBasket)
  expect(cleared).toBe(2)
})

test('a submitted process that became unavailable cannot silently replace the line', async () => {
  basket = { cartId: 'cart-1', claimed: false, owner: 'guest-1', lines: [{ key: 'line-1', processPricesId: 'empty', materialId: 99 }] }
  selection = { process: { id: 'available' }, material: { id: 3 }, changed: true }
  const form = new FormData()
  form.set('key', 'line-1')
  form.set('processPricesId', 'empty')
  form.set('materialId', '99')
  await expect(updateLine(form)).rejects.toThrow('redirect:/?error=selection-unavailable')
  expect(updated).toBe(0)
  expect(basket.lines[0].processPricesId).toBe('empty')
})

test('a fallback material removed after rendering requires another confirmation', async () => {
  selection = { process: { id: 'available' }, material: { id: 4 }, changed: true }
  const form = new FormData()
  form.set('key', 'line-1')
  form.set('renderedProcessPricesId', 'available')
  form.set('processPricesId', 'available')
  form.set('materialId', '3')
  await expect(updateLine(form)).rejects.toThrow('redirect:/?error=selection-unavailable')
  expect(updated).toBe(0)
  expect(basket.lines[0].materialId).toBe(99)
})

test('a missing item does not invalidate the other guest basket lines', async () => {
  basket = { cartId: 'cart-1', claimed: false, owner: 'guest-1', lines: [{ key: 'line-1', processPricesId: 'available', materialId: 3 }] }
  selection = { process: { id: 'available' }, material: { id: 3 }, changed: false }
  updateError = new ApiError(404, 'CART_ITEM_NOT_FOUND')
  const form = new FormData()
  form.set('key', 'line-1')
  form.set('renderedProcessPricesId', 'available')
  form.set('processPricesId', 'available')
  form.set('materialId', '3')
  await expect(updateLine(form)).rejects.toThrow('redirect:/?error=update')
  expect(basket.guestAccessInvalid).toBeUndefined()
  expect(basket.lines).toHaveLength(1)
})
