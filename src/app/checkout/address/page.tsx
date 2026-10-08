import { redirect } from 'next/navigation'
import { saveAddress } from '@/app/actions'
import { getCountries, getJurisdictions, getStore } from '@/lib/customer-api'
import { one, type SearchParams } from '@/lib/params'
import { getCustomerSession } from '@/lib/session'

export default async function AddressPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const session = await getCustomerSession()
  if (!session) redirect('/login?next=/checkout/address')

  const [store, countries] = await Promise.all([getStore(), getCountries()])
  const sorted = countries.toSorted((a, b) => a.name.localeCompare(b.name))

  // The country comes first, because the list of states or regions depends on it.
  const country = one(params.country) || countries.find(c => c.alpha2Code === store.country)?.country || ''
  const jurisdictions = country ? await getJurisdictions(session.token, country).catch(() => []) : []

  return (
    <>
      <h1>Add an address</h1>

      <form method="get" className="row">
        <label>
          Country
          <select name="country" defaultValue={country}>
            {sorted.map(c => (
              <option key={c.country} value={c.country}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary">Change country</button>
      </form>

      <form action={saveAddress} className="stack" style={{ marginTop: 24 }}>
        <input type="hidden" name="country" value={country} />
        <label>
          Contact name
          <input name="name" required defaultValue={`${session.customer.firstName} ${session.customer.lastName}`.trim()} />
        </label>
        <label>
          Company (optional)
          <input name="company" />
        </label>
        {store.isTaxIDEnabled && (
          <label>
            Tax ID (optional)
            <input name="taxId" />
          </label>
        )}
        <label>
          Street
          <input name="street1" required />
        </label>
        <label>
          Street, line 2 (optional)
          <input name="street2" />
        </label>
        <label>
          Postal code
          <input name="zip" required />
        </label>
        <label>
          City
          <input name="city" required />
        </label>
        {jurisdictions.length > 0 ? (
          <label>
            State or region
            <select name="jurisdictionIsoCode" required>
              {jurisdictions.map(j => (
                <option key={j.iso} value={j.iso}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="jurisdictionIsoCode" value="" />
        )}
        <label>
          State or region name (optional)
          <input name="state" />
        </label>
        <label>
          Phone
          <input name="phone" type="tel" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required defaultValue={session.customer.email} />
        </label>
        <label className="check">
          <input type="checkbox" name="residential" /> This is a residential address
        </label>
        <button>Save address</button>
      </form>
    </>
  )
}
