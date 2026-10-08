import Link from 'next/link'
import { removeLine, updateLine } from '@/app/actions'
import { Uploader } from '@/components/uploader'
import { readBasket, toCreateOrder } from '@/lib/basket'
import { getLeadTimes, getPrice, getProcesses, getStore } from '@/lib/customer-api'
import { money } from '@/lib/format'
import { getSession } from '@/lib/session'

export default async function PartsPage() {
  const [store, processes, leadTimes, basket, session] = await Promise.all([
    getStore(),
    getProcesses(),
    getLeadTimes(),
    readBasket(),
    getSession()
  ])

  // Store rule: with BEFORE_PRICE, a visitor must sign in before uploads and prices.
  if (store.loginStage === 'BEFORE_PRICE' && !session?.customer) {
    return (
      <>
        <h1>Get an instant quote</h1>
        {store.landingPageMessage && <p className="notice">{store.landingPageMessage}</p>}
        <p>
          <Link href="/login">Sign in</Link> to upload your parts and to see prices.
        </p>
      </>
    )
  }

  const price = session && basket.lines.length > 0 ? await getPrice(session.token, toCreateOrder(basket, store.currency)) : null

  return (
    <>
      <h1>Get an instant quote</h1>
      {store.landingPageMessage && <p className="notice">{store.landingPageMessage}</p>}

      <Uploader maximumMegabytes={store.maximumFileSize ?? 1000} />
      {store.termsOfServiceLink && (
        <p className="muted">
          When you upload a file, you accept the <a href={store.termsOfServiceLink}>terms of service</a>.
        </p>
      )}

      {basket.lines.map(line => {
        const process = processes.find(p => p.id === line.processPricesId)
        const linePrice = price?.quote.requisitions[line.key]
        return (
          <div className="card" key={line.key}>
            <div className="spread">
              <strong>{line.name}</strong>
              {/* A line with no price needs a review by the manufacturer. */}
              <span>{linePrice ? money(linePrice.price, store.currency) : 'Price after review'}</span>
            </div>
            <p className="muted">{line.size.map(value => value.toFixed(1)).join(' × ')} mm</p>

            <form action={updateLine} className="row">
              <input type="hidden" name="key" value={line.key} />
              <label>
                Process
                <select name="processPricesId" defaultValue={line.processPricesId}>
                  {processes.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.description || p.technology}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Material
                <select name="materialId" defaultValue={line.materialId}>
                  {process?.materials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.quoteOnly ? ' (quote only)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {leadTimes.length > 0 && (
                <label>
                  Lead time
                  <select name="leadTimeId" defaultValue={line.leadTimeId ?? undefined}>
                    {leadTimes.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Quantity
                <input type="number" name="quantity" min={1} defaultValue={line.quantity} />
              </label>
              <button className="secondary">Update</button>
              <button className="link" formAction={removeLine}>
                Remove
              </button>
            </form>
          </div>
        )
      })}

      {price && (
        <>
          <h2>Summary</h2>
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
              <tr className="total">
                <td>Shipping and tax</td>
                <td className="amount">Calculated at checkout</td>
              </tr>
            </tbody>
          </table>
          {!price.purchasability.canBePurchased && (
            <p className="muted">The manufacturer must review these parts. You can request a quote.</p>
          )}
          <p>
            <Link className="button" href="/checkout">
              {price.purchasability.canBePurchased ? 'Continue to checkout' : 'Request a quote'}
            </Link>
          </p>
        </>
      )}
    </>
  )
}
