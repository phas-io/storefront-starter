import { beforeEach, describe, expect, mock, test } from 'bun:test'

class RedirectSignal extends Error {
  constructor(destination) {
    super(`redirect:${destination}`)
    this.destination = destination
  }
}

const redirect = mock((destination) => {
  throw new RedirectSignal(destination)
})
const auth = {
  preAuthenticate: mock(async () => ({ ok: true, data: { result: ['PASSWORD'] } })),
  sendSignInCode: mock(async () => ({ ok: true, data: {} })),
  signIn: mock(async () => ({ ok: true, data: { access_token: 'customer-token', expires_in: 3600 } })),
  sendSignUpCode: mock(async () => ({ ok: true, data: {} })),
  signUp: mock(async () => ({ ok: true, data: { access_token: 'customer-token', expires_in: 3600 } })),
  isToken: mock((result) => Boolean(result.access_token))
}
const session = {
  clearGuestSession: mock(async () => {}),
  customerFromToken: mock(async () => ({ organisationId: 8 })),
  endCustomerSession: mock(async () => {}),
  ensureSession: mock(async () => ({ token: 'guest-token', customer: null })),
  getCustomerSession: mock(async () => null),
  getGuestSession: mock(async () => null),
  getSession: mock(async () => null),
  startCustomerSession: mock(async () => {})
}
const basket = {
  availableProcesses: mock((processes) => processes.filter(process => process.materials.length > 0)),
  availableSelection: mock(() => null),
  basketAccess: mock(() => 'ready'),
  clearBasket: mock(async () => {}),
  readBasket: mock(async () => ({ cartId: null, claimed: false, lines: [] })),
  toCartItem: mock((value) => value),
  toCreateOrder: mock((value) => value),
  writeBasket: mock(async () => {})
}
const customerApi = {
  ApiError: class ApiError extends Error {
    constructor(code) { super(code); this.code = code }
  },
  claimCart: mock(async () => {}),
  getProcesses: mock(async () => [{ id: 'process', materials: [{ id: 1, isDefault: true }] }]),
  getStore: mock(async () => ({ loginStage: 'AFTER_PRICE', maximumFileSize: 10 })),
  // Bun shares module mocks across files, and a later mock replaces only exports named here; basket-actions.test.mjs needs updateCartItem.
  updateCartItem: mock(async () => ({})),
  uploadPart: mock(async () => 'analysis-id')
}

mock.module('next/navigation', () => ({ redirect }))
mock.module('next/server', () => ({
  NextResponse: { json: (body, init) => Response.json(body, init) }
}))
mock.module(new URL('../src/lib/auth-api.ts', import.meta.url).pathname, () => auth)
mock.module(new URL('../src/lib/basket.ts', import.meta.url).pathname, () => basket)
mock.module(new URL('../src/lib/customer-api.ts', import.meta.url).pathname, () => customerApi)
mock.module(new URL('../src/lib/session.ts', import.meta.url).pathname, () => session)
mock.module(new URL('../src/lib/shipping.ts', import.meta.url).pathname, () => ({ toShipping: mock((value) => value) }))

const actions = await import('../src/app/actions')
const uploadRoute = await import('../src/app/api/parts/route')

async function destinationOf(action) {
  try {
    await action()
  } catch (error) {
    if (error instanceof RedirectSignal) return error.destination
    throw error
  }
  throw new Error('Expected the action to redirect')
}

function form(values) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

function nextFrom(location) {
  return new URL(location, 'https://storefront.invalid').searchParams.get('next')
}

beforeEach(() => {
  redirect.mockClear()
  auth.preAuthenticate.mockReset().mockResolvedValue({ ok: true, data: { result: ['PASSWORD'] } })
  auth.sendSignInCode.mockReset().mockResolvedValue({ ok: true, data: {} })
  auth.signIn.mockReset().mockResolvedValue({ ok: true, data: { access_token: 'customer-token', expires_in: 3600 } })
  auth.sendSignUpCode.mockReset().mockResolvedValue({ ok: true, data: {} })
  auth.signUp.mockReset().mockResolvedValue({ ok: true, data: { access_token: 'customer-token', expires_in: 3600 } })
  auth.isToken.mockReset().mockImplementation((result) => Boolean(result.access_token))
  session.clearGuestSession.mockReset()
  session.endCustomerSession.mockReset()
  session.ensureSession.mockReset().mockResolvedValue({ token: 'guest-token', customer: null })
  session.getCustomerSession.mockReset().mockResolvedValue(null)
  session.startCustomerSession.mockReset()
  basket.basketAccess.mockReset().mockReturnValue('ready')
  basket.clearBasket.mockReset()
  basket.readBasket.mockReset().mockResolvedValue({ cartId: null, claimed: false, lines: [] })
  basket.toCartItem.mockReset()
  basket.toCreateOrder.mockReset()
  basket.writeBasket.mockReset()
  customerApi.claimCart.mockReset()
  customerApi.getStore.mockReset().mockResolvedValue({ loginStage: 'AFTER_PRICE', maximumFileSize: 10 })
  customerApi.uploadPart.mockReset().mockResolvedValue('analysis-id')
})

describe('post-auth redirects', () => {
  const flows = [
    ['sign-in first step', actions.startSignIn],
    ['sign-in final step', actions.completeSignIn],
    ['sign-up first step', actions.startSignUp],
    ['sign-up final step', actions.completeSignUp]
  ]

  for (const [name, action] of flows) {
    test(`${name} keeps a local path, query, and fragment`, async () => {
      const target = '/checkout?source=login#address'
      const destination = await destinationOf(() => action(form({ email: 'jane@example.com', next: target })))
      expect(name.endsWith('first step') ? nextFrom(destination) : destination).toBe(target)
    })

    test(`${name} falls back to the storefront root for hostile URLs`, async () => {
      for (const target of [
        '//attacker.example/path',
        '/\\attacker.example/path',
        'https://attacker.example/path',
        '/.//evil.example/path',
        '/foo/..//evil.example/path',
        'https://storefront.invalid//evil.example/path'
      ]) {
        const destination = await destinationOf(() => action(form({ email: 'jane@example.com', next: target })))
        expect(name.endsWith('first step') ? nextFrom(destination) : destination).toBe('/')
      }
    })
  }
})

test('sign-in sends surrounding password spaces unchanged', async () => {
  await destinationOf(() => actions.completeSignIn(form({
    email: 'jane@example.com',
    factors: 'PASSWORD',
    password: '  correct horse battery staple  ',
    next: '/orders'
  })))

  expect(auth.signIn).toHaveBeenCalledWith('jane@example.com', { password: '  correct horse battery staple  ', otp: undefined })
})

describe('part uploads', () => {
  async function postUpload() {
    const data = new FormData()
    data.set('file', new File(['part'], 'part.stl'))
    return uploadRoute.POST(new Request('https://storefront.invalid/api/parts', { method: 'POST', body: data }))
  }

  test('BEFORE_PRICE rejects without creating a guest session', async () => {
    customerApi.getStore.mockResolvedValue({ loginStage: 'BEFORE_PRICE', maximumFileSize: 10 })
    session.getCustomerSession.mockResolvedValue(null)

    const response = await postUpload()

    expect(response.status).toBe(401)
    expect(session.ensureSession).not.toHaveBeenCalled()
    expect(customerApi.uploadPart).not.toHaveBeenCalled()
  })

  test('BEFORE_PRICE asks for sign-in before it reports a saved basket', async () => {
    customerApi.getStore.mockResolvedValue({ loginStage: 'BEFORE_PRICE', maximumFileSize: 10 })
    session.getCustomerSession.mockResolvedValue(null)
    basket.basketAccess.mockReturnValue('customer-sign-in')

    const response = await postUpload()

    expect(response.status).toBe(401)
    expect(customerApi.uploadPart).not.toHaveBeenCalled()
  })

  test('BEFORE_PRICE accepts a customer session without creating a guest session', async () => {
    customerApi.getStore.mockResolvedValue({ loginStage: 'BEFORE_PRICE', maximumFileSize: 10 })
    session.getCustomerSession.mockResolvedValue({ token: 'customer-token', customer: { customerId: 42 } })

    const response = await postUpload()

    expect(response.status).toBe(200)
    expect(session.ensureSession).not.toHaveBeenCalled()
    expect(customerApi.uploadPart).toHaveBeenCalledWith('customer-token', expect.any(File))
  })

  test('permitted guest upload still creates and uses a guest session', async () => {
    customerApi.getStore.mockResolvedValue({ loginStage: 'AFTER_PRICE', maximumFileSize: 10 })
    session.ensureSession.mockResolvedValue({ token: 'guest-token', customer: null })

    const response = await postUpload()

    expect(response.status).toBe(200)
    expect(session.ensureSession).toHaveBeenCalledTimes(1)
    expect(customerApi.uploadPart).toHaveBeenCalledWith('guest-token', expect.any(File))
    expect(await response.json()).toEqual({ analysisId: 'analysis-id' })
  })
})
