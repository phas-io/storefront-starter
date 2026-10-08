import Link from 'next/link'
import { redirect } from 'next/navigation'
import { completeSignIn, startSignIn } from '@/app/actions'
import { one, type SearchParams } from '@/lib/params'
import { getCustomerSession } from '@/lib/session'

const errors: Record<string, string> = {
  credentials: 'The password or the code is not correct.',
  rate: 'Too many attempts. Try again later.',
  failed: 'Sign-in failed. Try again.'
}

const notices: Record<string, string> = {
  approval: 'Your account waits for approval by the manufacturer. You can sign in after the approval.',
  exists: 'You already have an account. Sign in.'
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const email = one(params.email)
  const factors = one(params.factors).split(',').filter(Boolean)
  const next = one(params.next) || '/'
  const error = errors[one(params.error)]
  const notice = notices[one(params.notice)]

  if (await getCustomerSession()) redirect('/')

  return (
    <>
      <h1>Sign in</h1>
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {factors.length === 0 ? (
        // Step 1: the email address. The server then asks which factors are necessary.
        <form action={startSignIn} className="stack">
          <input type="hidden" name="next" value={next} />
          <label>
            Email
            <input type="email" name="email" defaultValue={email} required autoComplete="email" />
          </label>
          <button>Continue</button>
        </form>
      ) : (
        // Step 2: the password, the code, or the two together.
        <form action={completeSignIn} className="stack">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="factors" value={factors.join(',')} />
          <p className="muted">{email}</p>
          {factors.includes('PASSWORD') && (
            <label>
              Password
              <input type="password" name="password" required autoComplete="current-password" />
            </label>
          )}
          {factors.includes('OTP') && (
            <label>
              Code from the email (7 digits)
              <input name="otp" required inputMode="numeric" pattern="[0-9]{7}" autoComplete="one-time-code" />
            </label>
          )}
          <button>Sign in</button>
          <Link href={`/login?next=${encodeURIComponent(next)}`}>Use a different email</Link>
        </form>
      )}

      <p className="muted">
        No account? <Link href={`/sign-up?next=${encodeURIComponent(next)}`}>Create one</Link>.
      </p>
    </>
  )
}
