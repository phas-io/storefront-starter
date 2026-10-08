import { describe, expect, mock, test } from 'bun:test'

const cookieValues = new Map()
process.env.AUTH_SERVER = 'https://auth.example'

mock.module('server-only', () => ({}))
mock.module('next/headers', () => ({
  cookies: async () => ({ get: name => ({ value: cookieValues.get(name) }), set: (name, value) => cookieValues.set(name, value), delete: name => cookieValues.delete(name) })
}))
mock.module('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async token => {
    if (token === 'guest-expired') throw new Error('expired')
    if (token === 'guest-last-minute') return { payload: { scope: 'ANONYMOUS', sub: 'guest-1', exp: Date.now() / 1000 + 30 } }
    if (token === 'guest-other') return { payload: { scope: 'ANONYMOUS', sub: 'guest-2', exp: Date.now() / 1000 + 3600 } }
    throw new Error('invalid')
  }
}))

const { getGuestSession, getGuestToken } = await import('../src/lib/session.ts')
const { availableProcesses, availableSelection, basketAccess } = await import('../src/lib/basket.ts')

const guest = { token: 'guest-last-minute', subject: 'guest-1', customer: null }
const customer = { token: 'customer', subject: 'customer-1', customer: { customerId: 1, organisationId: 8 } }
const guestBasket = { cartId: 'cart-1', claimed: false, owner: 'guest-1', lines: [] }
const claimedBasket = { ...guestBasket, claimed: true, owner: '8' }
const processes = [
  { id: 'empty', isDefault: true, materials: [] },
  { id: 'available', isDefault: false, materials: [{ id: 3, isDefault: true }, { id: 4, isDefault: false }] }
]

describe('basket access', () => {
  test('a verified guest token remains usable in its final minute', async () => {
    cookieValues.set('sf_guest', 'guest-last-minute')
    expect(await getGuestToken()).toBe('guest-last-minute')
    expect((await getGuestSession()).subject).toBe('guest-1')
    expect(basketAccess(guestBasket, guest)).toBe('ready')
  })

  test('an expired or replacement guest cannot use an old cart', async () => {
    cookieValues.set('sf_guest', 'guest-expired')
    expect(await getGuestSession()).toBeNull()
    expect(basketAccess(guestBasket, null)).toBe('guest-expired')
    expect(basketAccess(guestBasket, { ...guest, subject: 'guest-2' })).toBe('guest-expired')
    expect(basketAccess({ ...guestBasket, owner: null }, guest)).toBe('ready')
    expect(basketAccess({ ...guestBasket, owner: null, guestAccessInvalid: true }, guest)).toBe('guest-expired')
  })

  test('a claimed cart awaits sign-in and accepts the owning organisation', () => {
    expect(basketAccess(claimedBasket, guest)).toBe('customer-sign-in')
    expect(basketAccess(claimedBasket, null)).toBe('customer-sign-in')
    expect(basketAccess(claimedBasket, customer)).toBe('ready')
    expect(basketAccess(claimedBasket, { ...customer, customer: { customerId: 2, organisationId: 8 } })).toBe('ready')
    expect(basketAccess(claimedBasket, { ...customer, customer: { customerId: 3, organisationId: 9 } })).toBe('different-customer')
  })
})

describe('selection fallback', () => {
  test('excludes processes with no materials and chooses a valid default', () => {
    expect(availableProcesses(processes).map(process => process.id)).toEqual(['available'])
    expect(availableSelection(processes, 'empty', 0)).toMatchObject({ process: { id: 'available' }, material: { id: 3 }, changed: true })
  })

  test('repairs a stale material and leaves a valid selection alone', () => {
    expect(availableSelection(processes, 'available', 99)).toMatchObject({ material: { id: 3 }, changed: true })
    expect(availableSelection(processes, 'available', 4)).toMatchObject({ material: { id: 4 }, changed: false })
    expect(availableSelection(processes.slice(0, 1), 'empty', 0)).toBeNull()
  })
})
