import Link from 'next/link'
import { removeLine, resetBasket, updateLine } from '@/app/actions'
import { Uploader } from '@/components/uploader'
import { availableProcesses, availableSelection, basketAccess, readBasket, toCreateOrder } from '@/lib/basket'
import { getLeadTimes, getPrice, getProcesses, getStore } from '@/lib/customer-api'
import { money } from '@/lib/format'
import { one, type SearchParams } from '@/lib/params'
import { getSession } from '@/lib/session'

export default async function PartsPage({ searchParams }: { searchParams: SearchParams }) {
  const [store, processes, leadTimes, basket, session, params] = await Promise.all([
    getStore(), getProcesses(), getLeadTimes(), readBasket(), getSession(), searchParams
  ])
  const access = basketAccess(basket, session)
  const selectable = availableProcesses(processes)
  const needsSelection = basket.lines.some(line => availableSelection(processes, line.processPricesId, line.materialId)?.changed ?? true)
  const requiresSignIn = store.loginStage === 'BEFORE_PRICE' && !session?.customer
  const canEdit = access === 'ready' && !requiresSignIn
  const price = canEdit && !needsSelection && basket.lines.length > 0 && session
    ? await getPrice(session.token, toCreateOrder(basket, store.currency)).catch(() => null)
    : null

  return (
    <>
      <h1>Get an instant quote</h1>
      {store.landingPageMessage && <p className="notice">{store.landingPageMessage}</p>}
      {access === 'guest-expired' && (
        <div className="notice" data-el="expired-guest-basket">
          <p>This guest basket can no longer be used. Start a new basket and upload your parts once more.</p>
          <form action={resetBasket}><button>Start a new basket</button></form>
        </div>
      )}
      {access === 'customer-sign-in' && <p className="notice" data-el="saved-customer-basket">Your basket is saved. <Link href="/login?next=/">Sign in again</Link> to continue.</p>}
      {access === 'different-customer' && <div className="notice" data-el="different-customer-basket">
        <p>This basket belongs to another account. Sign in with that account to continue, or start a new basket.</p>
        <form action={resetBasket}><button>Start a new basket</button></form>
      </div>}
      {requiresSignIn && access === 'ready' && <p><Link href="/login">Sign in</Link> to upload your parts and to see prices.</p>}
      {one(params.error) === 'no-processes' && <p className="notice">No processes are available right now. Try again later.</p>}
      {one(params.error) === 'selection-unavailable' && <p className="notice">That selection is no longer available. Review the available option before updating your part.</p>}
      {one(params.error) === 'update' && <p className="notice">The part could not be updated. Your previous selection is still saved. Please try again.</p>}
      {one(params.error) === 'update' && !basket.claimed && <form action={resetBasket}><button className="link">Start a new basket</button></form>}
      {one(params.error) === 'remove' && <p className="notice">The part could not be removed. Please try again.</p>}
      {canEdit && !needsSelection && basket.lines.length > 0 && !price && <p className="notice">Prices are unavailable right now. Please try again.</p>}
      {canEdit && selectable.length === 0 && <p className="notice">No processes are available right now. Please try again later.</p>}

      {canEdit && selectable.length > 0 && <Uploader maximumMegabytes={store.maximumFileSize ?? 1000} />}
      {canEdit && store.termsOfServiceLink && <p className="muted">When you upload a file, you accept the <a href={store.termsOfServiceLink}>terms of service</a>.</p>}
      {(access === 'different-customer' ? [] : basket.lines).map(line => {
        const selection = availableSelection(processes, line.processPricesId, line.materialId)
        const linePrice = price?.quote.requisitions[line.key]
        return (
          <div className="card" key={line.key} data-el="basket-line">
            <div className="spread">
              <strong>{line.name}</strong>
              <span>{linePrice ? money(linePrice.price, store.currency) : price ? 'Price after review' : 'Price unavailable'}</span>
            </div>
            <p className="muted">{line.size.map(value => value.toFixed(1)).join(' × ')} mm</p>
            {canEdit && selection?.changed && <p className="notice">A process or material for this part is no longer available. Review the available selection and update the part.</p>}
            {canEdit && !selection && <p className="notice">No process is available for this part right now. Try again later.</p>}
            {canEdit && selection && (
              <form action={updateLine} className="row">
                <input type="hidden" name="key" value={line.key} />
                <input type="hidden" name="renderedProcessPricesId" value={selection.process.id} />
                <label>Process<select name="processPricesId" defaultValue={selection.process.id}>
                  {selectable.map(process => <option key={process.id} value={process.id}>{process.description || process.technology}</option>)}
                </select></label>
                <label>Material<select name="materialId" defaultValue={selection.material.id}>
                  {selection.process.materials.map(material => <option key={material.id} value={material.id}>{material.name}{material.quoteOnly ? ' (quote only)' : ''}</option>)}
                </select></label>
                {leadTimes.length > 0 && <label>Lead time<select name="leadTimeId" defaultValue={line.leadTimeId ?? undefined}>
                  {leadTimes.map(leadTime => <option key={leadTime.id} value={leadTime.id}>{leadTime.name}</option>)}
                </select></label>}
                <label>Quantity<input type="number" name="quantity" min={1} defaultValue={line.quantity} /></label>
                <button className="secondary">Update</button>
                <button className="link" formAction={removeLine}>Remove</button>
              </form>
            )}
          </div>
        )
      })}
      {price && <>
        <h2>Summary</h2>
        <table><tbody>
          <tr><td>Parts</td><td className="amount">{money(price.quote.subtotal, store.currency)}</td></tr>
          {price.quote.topUp ? <tr><td>Minimum order surcharge</td><td className="amount">{money(price.quote.topUp, store.currency)}</td></tr> : null}
          <tr className="total"><td>Shipping and tax</td><td className="amount">Calculated at checkout</td></tr>
        </tbody></table>
        {!price.purchasability.canBePurchased && <p className="muted">The manufacturer must review these parts. You can request a quote.</p>}
        <p><Link className="button" href="/checkout">{price.purchasability.canBePurchased ? 'Continue to checkout' : 'Request a quote'}</Link></p>
      </>}
    </>
  )
}
