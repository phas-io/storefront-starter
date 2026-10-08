import { notFound, redirect } from 'next/navigation'
import { payByInvoice, payByPurchaseOrder } from '@/app/actions'
import { ApiError, getCustomer, getOrder, getOrderLines, getOrderPurchasability, getOrderQuote, getStore } from '@/lib/customer-api'
import { date, money } from '@/lib/format'
import { one, type SearchParams } from '@/lib/params'
import { getCustomerSession } from '@/lib/session'

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const orderId = Number((await params).id)
  const session = await getCustomerSession()
  if (!session) redirect(`/login?next=/orders/${orderId}`)

  const order = await getOrder(session.token, orderId).catch(error => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound()
    throw error
  })

  const [store, customer, lines, quote, purchasability] = await Promise.all([
    getStore(),
    getCustomer(session.token),
    getOrderLines(session.token, orderId),
    getOrderQuote(session.token, orderId).catch(() => null),
    getOrderPurchasability(session.token, orderId).catch(() => null)
  ])

  const awaitsPayment = order.state === 'QUOTE' && order.paymentStatus === 'UNPAID' && !order.isVoided
  const canPay = awaitsPayment && purchasability?.canBePurchased === true

  // Which payment methods to show: the store settings, together with the customer type.
  const type = customer.customerType
  const showInvoice = canPay && (store.isPayByInvoiceEnabled || type === 'ACCOUNT')
  const showPurchaseOrder = canPay && ((store.isPayByPurchaseOrderEnabled && type !== 'INTERNAL') || type === 'ACCOUNT')
  const showOnline = canPay && store.paymentProvider !== 'NONE' && type !== 'INTERNAL'

  return (
    <>
      <h1>
        {order.state === 'ORDER' ? 'Order' : 'Quote'} {order.orderNumber ?? order.quoteNumber}
      </h1>
      {one((await searchParams).error) === 'payment' && <p className="error">This payment method is not available for this order.</p>}

      <p>
        Payment: <strong>{order.paymentStatus}</strong>
        {order.kanbanColumn && (
          <>
            {' '}
            · Production: <strong>{order.kanbanColumn.name}</strong>
          </>
        )}
        {' '}· Expected dispatch: {date(order.shipping?.expectedDispatchDate)}
      </p>
      {awaitsPayment && !canPay && <p className="notice">The manufacturer reviews this quote. You can pay after the review.</p>}

      <h2>Parts</h2>
      <table>
        <tbody>
          {lines.map(line => (
            <tr key={line.id}>
              <td>{line.name}</td>
              <td>× {line.quantity}</td>
              <td className="amount">{money(quote?.requisitions[line.id]?.price, order.currency)}</td>
            </tr>
          ))}
          {quote && (
            <>
              <tr>
                <td colSpan={2}>Shipping</td>
                <td className="amount">{money(quote.shipping, order.currency)}</td>
              </tr>
              <tr>
                <td colSpan={2}>Tax</td>
                <td className="amount">{money(quote.tax.totalPrice, order.currency)}</td>
              </tr>
            </>
          )}
          <tr className="total">
            <td colSpan={2}>Total</td>
            <td className="amount">{money(quote?.price ?? order.price, order.currency)}</td>
          </tr>
        </tbody>
      </table>

      {order.shipments.map(shipment =>
        shipment.tracking ? (
          <p key={shipment.id}>
            Shipped with {shipment.tracking.provider}:{' '}
            {shipment.tracking.trackingUrl ? (
              <a href={shipment.tracking.trackingUrl}>{shipment.tracking.trackingNumber}</a>
            ) : (
              shipment.tracking.trackingNumber
            )}
          </p>
        ) : null
      )}

      {canPay && <h2>Pay</h2>}
      {showInvoice && (
        <form action={payByInvoice} className="card">
          <input type="hidden" name="orderId" value={order.id} />
          <button>Pay by invoice</button>
        </form>
      )}
      {showPurchaseOrder && (
        <form action={payByPurchaseOrder} className="card stack">
          <input type="hidden" name="orderId" value={order.id} />
          <label>
            Purchase order number
            <input name="purchaseOrderNumber" required />
          </label>
          <label>
            Purchase order document (optional)
            <input type="file" name="file" accept=".pdf" />
          </label>
          <button>Pay by purchase order</button>
        </form>
      )}
      {showOnline && (
        <p className="notice">
          Online payment ({store.paymentProvider}) is not part of this example. To add it, call <code>createPayment</code> in{' '}
          <code>src/lib/customer-api.ts</code>, then complete the payment in the browser with the SDK of the payment provider.
        </p>
      )}

      <h2>Documents</h2>
      <p className="row">
        <a href={`/orders/${order.id}/documents/estimate`}>Quote (PDF)</a>
        {order.state === 'ORDER' && <a href={`/orders/${order.id}/documents/confirmation`}>Order confirmation (PDF)</a>}
        {order.state === 'ORDER' && store.isInvoiceDownloadEnabled && <a href={`/orders/${order.id}/documents/invoice`}>Invoice (PDF)</a>}
      </p>
    </>
  )
}
