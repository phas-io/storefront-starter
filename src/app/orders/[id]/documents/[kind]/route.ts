import { NextResponse } from 'next/server'
import { ApiError, type DocumentKind, getOrderDocument } from '@/lib/customer-api'
import { getCustomerSession } from '@/lib/session'

const kinds: DocumentKind[] = ['estimate', 'confirmation', 'invoice']

/** Sends an order PDF to the browser. The access token stays on the server. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params
  const session = await getCustomerSession()
  if (!session) return new NextResponse('Sign in first.', { status: 401 })
  if (!kinds.includes(kind as DocumentKind) || !/^\d+$/.test(id)) return new NextResponse('Not found.', { status: 404 })

  try {
    const document = await getOrderDocument(session.token, Number(id), kind as DocumentKind)
    return new NextResponse(document.body, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${kind}-${id}.pdf"` }
    })
  } catch (error) {
    if (error instanceof ApiError) return new NextResponse('This document is not available.', { status: error.status })
    throw error
  }
}
