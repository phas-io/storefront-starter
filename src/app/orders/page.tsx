import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listOrders } from '@/lib/customer-api'
import { date, money } from '@/lib/format'
import { getCustomerSession } from '@/lib/session'

export default async function OrdersPage() {
  const session = await getCustomerSession()
  if (!session) redirect('/login?next=/orders')

  // One list contains quotes and orders. The `state` field tells them apart.
  const orders = await listOrders(session.token)

  return (
    <>
      <h1>Quotes and orders</h1>
      {orders.length === 0 ? (
        <p className="muted">
          You have no orders yet. <Link href="/">Upload a part</Link>.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Type</th>
              <th>Date</th>
              <th>Payment</th>
              <th className="amount">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.id}>
                <td>
                  <Link href={`/orders/${order.id}`}>{order.orderNumber ?? order.quoteNumber ?? order.id}</Link>
                </td>
                <td>{order.state === 'ORDER' ? 'Order' : 'Quote'}</td>
                <td>{date(order.createdAt)}</td>
                <td>{order.paymentStatus}</td>
                <td className="amount">{money(order.price, order.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
