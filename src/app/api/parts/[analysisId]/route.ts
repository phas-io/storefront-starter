import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { defaultConfiguration, readBasket, toCartItem, writeBasket } from '@/lib/basket'
import {
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

  const status = await getAnalysisStatus(session.token, analysisId)
  if (status === 'ANALYSIS_FAILED' || status === 'DESIGN_DOES_NOT_EXIST') return NextResponse.json({ status: 'failed' })
  // ANALYSIS_COMPLETED is not the end: wait for RESULT_READY.
  if (status !== 'RESULT_READY') return NextResponse.json({ status: 'pending' })

  // The result can be read one time only. The basket keeps what this storefront needs.
  const part = await getAnalysisResult(session.token, analysisId)

  const [processes, leadTimes] = await Promise.all([getProcesses(), getLeadTimes()])
  const configuration = defaultConfiguration(processes, leadTimes)
  if (!configuration) return NextResponse.json({ status: 'failed', message: 'The store has no processes.' })

  const basket = await readBasket()
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
  const item = await addCartItem(session.token, cartId, toCartItem(line))

  await writeBasket({
    cartId,
    // A cart that a customer creates belongs to the customer from the start.
    claimed: basket.cartId ? basket.claimed : Boolean(session.customer),
    lines: [...basket.lines, { ...line, itemId: item.id }]
  })
  return NextResponse.json({ status: 'ready' })
}
