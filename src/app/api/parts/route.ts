import { NextResponse } from 'next/server'
import { ApiError, getProcesses, getStore, uploadPart } from '@/lib/customer-api'
import { availableProcesses, basketAccess, readBasket } from '@/lib/basket'
import { ensureSession, getCustomerSession, getSession } from '@/lib/session'

/** Receives one part file from the browser and sends it to the Customer API. */
export async function POST(request: Request) {
  const file = (await request.formData()).get('file')
  if (!(file instanceof File)) return NextResponse.json({ message: 'A file is necessary.' }, { status: 400 })

  const store = await getStore()

  // The API does not apply the store's file size limit to part uploads. The storefront must.
  const maximumBytes = (store.maximumFileSize ?? 1000) * 1024 * 1024
  if (file.size > maximumBytes) {
    return NextResponse.json({ message: `The file is larger than ${store.maximumFileSize} MB.` }, { status: 413 })
  }

  const customerSession = store.loginStage === 'BEFORE_PRICE' ? await getCustomerSession() : null
  if (store.loginStage === 'BEFORE_PRICE' && !customerSession) {
    return NextResponse.json({ message: 'Sign in before you upload parts.' }, { status: 401 })
  }

  const basket = await readBasket()
  if (basketAccess(basket, await getSession()) !== 'ready') {
    return NextResponse.json({ message: 'This basket can no longer take new parts. Refresh the page to continue.' }, { status: 409 })
  }
  if (availableProcesses(await getProcesses()).length === 0) {
    return NextResponse.json({ message: 'No processes are available right now. Please try again later.' }, { status: 409 })
  }

  const session = customerSession ?? await ensureSession()

  try {
    const analysisId = await uploadPart(session.token, file)
    return NextResponse.json({ analysisId })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNSUPPORTED_FILE_TYPE') {
      return NextResponse.json({ message: 'This file type is not supported.' }, { status: 400 })
    }
    throw error
  }
}
