import Link from 'next/link'
import { redirect } from 'next/navigation'
import { placeOrder } from '@/app/actions'
import { readBasket, toCartItem, toCreateOrder } from '@/lib/basket'
import { getPrice, getShippingMethods, getShippingRates, getStore, listAddresses } from '@/lib/customer-api'
import { date, money } from '@/lib/format'
import { one, type SearchParams } from '@/lib/params'
import { getCustomerSession } from '@/lib/session'
import { collectionOption, rateOption, toShipping } from '@/lib/shipping'

export default async function CheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const session = await getCustomerSession()
  if (!session) redirect('/login?next=/checkout')

  const basket = await readBasket()
  if (basket.lines.length === 0) redirect('/')

  const [store, addresses, methods] = await Promise.all([
    getStore(),
    listAddresses(session.token),
    getShippingMethods(session.token)
  ])

  const addressId = Number(one(params.address)) || addresses[0]?.addressId
  const address = addresses.find(a => a.addressId === addressId)

  // Delivery rates depend on the address and on the parts.
  const rates = address
    ? await getShippingRates(session.token, {
        currency: store.currency,
        toAddressId: address.addressId,
        parts: basket.lines.map(line => {
          const { partRevisionId, units, quantity, processPricesId, materialId } = toCartItem(line)
          return { partRevisionId, units, quantity, processPricesId, materialId }
        })
      }).catch(() => [])
    : []

  const shippingOption = one(params.shipping)
  const shipping = address ? toShipping(shippingOption, methods, address.addressId) : null

  // The final price: with shipping and the billing address, the quote includes shipping and tax.
  const price =
    address && shipping
      ? await getPrice(session.token, toCreateOrder(basket, store.currency, { shipping, billingAddressId: address.addressId }))
      : null

  return (
    <>
      <h1>Checkout</h1>

      <form method="get">
        <h2>1. Address</h2>
        {addresses.length === 0 && <p className="muted">You have no address yet.</p>}
        {addresses.map(a => (
          <label className="check card" key={a.addressId}>
            <input type="radio" name="address" value={a.addressId} defaultChecked={a.addressId === addressId} />
            <span>
              {a.name}
              {a.company ? `, ${a.company}` : ''} — {a.street1}, {a.zip} {a.city}, {a.country}
            </span>
          </label>
        ))}
        <p>
          <Link href="/checkout/address">Add an address</Link>
        </p>

        {address && (
          <>
            <h2>2. Shipping</h2>
            {methods
              .filter(m => m.shippingMode === 'SELF_COLLECTION')
              .map(m => (
                <label className="check card" key={m.shippingMethodId}>
                  <input
                    type="radio"
                    name="shipping"
                    value={collectionOption(m.shippingMethodId)}
                    defaultChecked={shippingOption === collectionOption(m.shippingMethodId)}
                  />
                  <span>{m.name ?? 'Collection'} — collect from the manufacturer</span>
                </label>
              ))}
            {rates.flatMap(group =>
              group.rates.map(rate => (
                <label className="check card" key={rate.id}>
                  <input
                    type="radio"
                    name="shipping"
                    value={rateOption(rate.shippingMethodId, rate.id)}
                    defaultChecked={shippingOption === rateOption(rate.shippingMethodId, rate.id)}
                  />
                  <span>
                    {rate.serviceName} — {money(rate.rate, rate.currency)}
                  </span>
                </label>
              ))
            )}
            {rates.some(group => group.tooLargeForBoxes) && (
              <p className="muted">Some parts are too large for standard delivery. The manufacturer will contact you.</p>
            )}
          </>
        )}

        <p>
          <button className="secondary">Update price</button>
        </p>
      </form>

      {price && address && (
        <>
          <h2>3. Summary</h2>
          <table>
            <tbody>
              <tr>
                <td>Parts</td>
                <td className="amount">{money(price.quote.subtotal, store.currency)}</td>
              </tr>
              {price.quote.topUp ? (
                <tr>
                  <td>Minimum order surcharge</td>
                  <td className="amount">{money(price.quote.topUp, store.currency)}</td>
                </tr>
              ) : null}
              {price.quote.discount ? (
                <tr>
                  <td>Discount</td>
                  <td className="amount">-{money(price.quote.discount, store.currency)}</td>
                </tr>
              ) : null}
              <tr>
                <td>Shipping</td>
                <td className="amount">{money(price.quote.shipping, store.currency)}</td>
              </tr>
              <tr>
                <td>Tax</td>
                <td className="amount">{money(price.quote.tax.totalPrice, store.currency)}</td>
              </tr>
              <tr className="total">
                <td>Total</td>
                <td className="amount">{money(price.quote.price, store.currency)}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">Expected dispatch: {date(price.quote.expectedDispatchDate)}</p>

          <form action={placeOrder}>
            <input type="hidden" name="address" value={address.addressId} />
            <input type="hidden" name="shipping" value={shippingOption} />
            {/* canBePurchased false: the manufacturer reviews the quote before the customer can pay. */}
            <button>{price.purchasability.canBePurchased ? 'Place order' : 'Request a quote'}</button>
          </form>
        </>
      )}
    </>
  )
}
