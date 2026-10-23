import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { basketAccess, defaultConfiguration, readBasket, toCartItem, writeBasket } from '@/lib/basket'
import {
  ApiError,
  addCartItem,
  createCart,
  getAnalysisResult,
  getAnalysisStatus,
  getLeadTimes,
  getProcesses
} from '@/lib/customer-api'
import { getSession } from '@/lib/session'

/**
 * The browser polls this route after an upload.
 * When the analysis is complete, the route adds the part to the cart.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ status: 'failed' }, { status: 401 })
  const basket = await readBasket()
  if (basketAccess(basket, session) !== 'ready') {
    return NextResponse.json({ status: 'failed', message: 'This part could not be added to your basket. Refresh the page to continue.' }, { status: 409 })
  }

  const status = await getAnalysisStatus(session.token, analysisId)
  if (status === 'ANALYSIS_FAILED' || status === 'DESIGN_DOES_NOT_EXIST') return NextResponse.json({ status: 'failed' })
  // ANALYSIS_COMPLETED is not the end: wait for RESULT_READY.
  if (status !== 'RESULT_READY') return NextResponse.json({ status: 'pending' })

  const [processes, leadTimes] = await Promise.all([getProcesses(), getLeadTimes()])
  const configuration = defaultConfiguration(processes, leadTimes)
  if (!configuration) return NextResponse.json({ status: 'failed', message: 'No processes are available right now. Please try again later.' })

  // Read the result only after finding a usable configuration; it can be fetched once.
  const part = await getAnalysisResult(session.token, analysisId)

  const cartId = basket.cartId ?? (await createCart(session.token)).cartId

  const line = {
    key: randomUUID(),
    itemId: 0,
    partRevisionId: part.partRevisionId,
    name: part.fileName,
    size: [part.width, part.height, part.length] as [number, number, number],
    quantity: 1,
    ...configuration
  }
  let item
  try {
    item = await addCartItem(session.token, cartId, toCartItem(line))
  } catch (error) {
    if (!basket.claimed && basket.cartId && error instanceof ApiError && (error.status === 403 || error.code === 'CART_NOT_FOUND')) {
      await writeBasket({ ...basket, guestAccessInvalid: true })
      return NextResponse.json({ status: 'failed', message: 'This guest basket can no longer be used. Start a new basket and upload your parts again.' }, { status: 409 })
    }
    throw error
  }
  const owner = session.customer ? String(session.customer.organisationId) : session.subject

  await writeBasket({
    cartId,
    // A cart that a customer creates belongs to the customer from the start.
    claimed: basket.cartId ? basket.claimed : Boolean(session.customer),
    owner: basket.owner ?? owner,
    lines: [...basket.lines, { ...line, itemId: item.id }]
  })
  return NextResponse.json({ status: 'ready' })
}
