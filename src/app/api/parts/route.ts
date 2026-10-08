import { NextResponse } from 'next/server'
import { ApiError, getStore, uploadPart } from '@/lib/customer-api'
import { ensureSession } from '@/lib/session'

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

  // A guest token is sufficient for an upload, unless the store requires sign-in first.
  const session = await ensureSession()
  if (store.loginStage === 'BEFORE_PRICE' && !session.customer) {
    return NextResponse.json({ message: 'Sign in before you upload parts.' }, { status: 401 })
  }

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
