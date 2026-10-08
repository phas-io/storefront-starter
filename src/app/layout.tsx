import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/app/actions'
import { getStore } from '@/lib/customer-api'
import { getCustomerSession } from '@/lib/session'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getStore()).name }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [store, session] = await Promise.all([getStore(), getCustomerSession()])

  return (
    <html lang="en">
      <body>
        <header className="site">
          <Link href="/" className="store">
            {store.name}
          </Link>
          <nav>
            <Link href="/">Parts</Link>
            {session ? (
              <>
                <Link href="/orders">Orders</Link>
                <span className="muted">{session.customer.email}</span>
                <form action={signOut}>
                  <button className="link">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/login">Sign in</Link>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
