import Link from 'next/link'
import { completeSignUp, startSignUp } from '@/app/actions'
import { one, type SearchParams } from '@/lib/params'

const errors: Record<string, string> = {
  code: 'The code is not correct, or it is expired.',
  company: 'A company with this name already exists. Use a different name, then request a new code.',
  rate: 'Too many attempts. Try again later.',
  failed: 'Sign-up failed. Try again.'
}

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const email = one(params.email)
  const next = one(params.next) || '/'
  const error = errors[one(params.error)]
  const codeStep = one(params.step) === 'code' && email

  return (
    <>
      <h1>Create an account</h1>
      {error && <p className="error">{error}</p>}

      {!codeStep ? (
        // Step 1: send a code to the email address.
        <form action={startSignUp} className="stack">
          <input type="hidden" name="next" value={next} />
          <label>
            Email
            <input type="email" name="email" defaultValue={email} required autoComplete="email" />
          </label>
          <button>Send me a code</button>
        </form>
      ) : (
        // Step 2: the code and the customer details. There is no password at sign-up.
        <form action={completeSignUp} className="stack">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={email} />
          <p className="muted">We sent a code to {email}. The code is valid for 5 minutes.</p>
          <label>
            Code (7 digits)
            <input name="otp" required inputMode="numeric" pattern="[0-9]{7}" autoComplete="one-time-code" />
          </label>
          <label>
            First name
            <input name="firstName" required autoComplete="given-name" />
          </label>
          <label>
            Last name
            <input name="lastName" required autoComplete="family-name" />
          </label>
          <label>
            Company (optional)
            <input name="companyName" autoComplete="organization" />
          </label>
          <button>Create account</button>
        </form>
      )}

      <p className="muted">
        Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>.
      </p>
    </>
  )
}
