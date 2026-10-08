---
name: phasio-storefront
description: Set up and build a custom storefront for a Phasio store with the Phasio Auth API and Customer API. Use when the user wants to create or change their own Phasio storefront, connect a website to Phasio, add customer sign-in, part upload, instant pricing, cart, checkout, payment, or order tracking for a Phasio store, or when they debug calls to these APIs (401/403 errors, uploads that fail, missing prices, guest carts).
---

# Phasio custom storefront

A custom storefront is the user's own website for their Phasio store. It uses two APIs:

- **Auth API** (`AUTH_SERVER`): gives access tokens for guests and customers. Called from the storefront **server** with storefront credentials (HTTP Basic).
- **Customer API** (`API_BASE` + `/api/customer/v1`): store settings, parts, prices, carts, orders, payments. Called with the access token (Bearer) and the header `X-Store-Name`.

Read the reference that fits the task before you write code. Do not guess endpoint paths or field names.

| Reference | Read it when |
|---|---|
| `references/authentication.md` | Credentials, guest sessions, sign-up, sign-in, tokens, rate limits |
| `references/purchase-flow.md` | The sequence of calls from upload to payment, with examples |
| `references/customer-api.md` | Endpoint list, data shapes, store settings, error formats |

## Procedure

### 1. Collect the configuration

The storefront needs five server-side values:

| Variable | Value |
|---|---|
| `STORE_NAME` | The unique name of the store (case-sensitive) |
| `AUTH_SERVER` | `https://auth.eu.phas.io` (EU) or `https://auth.us.phas.io` (US) |
| `API_BASE` | `https://c-api.eu.phas.io` (EU) or `https://c-api.us.phas.io` (US) |
| `AUTH_CLIENT_ID` | Client ID of the storefront credentials (`sf_…`) |
| `AUTH_CLIENT_SECRET` | Client secret of the storefront credentials (`sfs_…`) |

- Ask the user for the region of their Phasio account (EU or US). The address of their Phasio dashboard shows it: `app.eu.phas.io` or `app.us.phas.io`. Use the two URLs of one region together. Credentials and tokens from one region do not work in the other region.
- If the user has no credentials, tell them to open `<AUTH_SERVER>/account?tab=custom-storefronts`, type a name, and select **Create credentials**. They must be an owner or admin. The secret shows one time only.
- **Do not ask the user to paste the client secret into the conversation.** Tell them to put it in the local environment file (for example `.env.local`). Make sure that this file is in `.gitignore`.
- Do not print the secret, and do not write it into source files, logs, or commit messages.
- Do not give these variables a prefix that exposes them to the browser (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`).

### 2. Check the connection

Run these checks (load the environment file first). Stop and correct the configuration if one fails.

```bash
# 1. Store settings. No token. Expect 200 and a JSON object with "name".
curl -s -o /dev/null -w "%{http_code}\n" "$API_BASE/api/customer/v1/operator" -H "X-Store-Name: $STORE_NAME"

# 2. Guest token. Expect 200 and "scope":"ANONYMOUS".
curl -s -X POST "$AUTH_SERVER/customer/anonymous" -u "$AUTH_CLIENT_ID:$AUTH_CLIENT_SECRET" \
  -H "Content-Type: application/json" -d "{\"store\":\"$STORE_NAME\"}" | head -c 60
```

| Result | Cause |
|---|---|
| Check 1 gives `401`/`403` | `STORE_NAME` is incorrect (it is case-sensitive), or `API_BASE` is for the other region |
| Check 2 gives `401` | The client ID or secret is incorrect, or the credentials are revoked |
| Check 2 gives `404` | The store name is incorrect, the credentials belong to a different store, or `AUTH_SERVER` is for the other region |
| Check 2 gives `429` | Rate limit. Wait, then try again. |

### 3. Examine the project, then plan

- Find the framework and where server code runs (Next.js Route Handlers or Server Actions, Remix loaders, SvelteKit server routes, Express, and so on).
- **The project must have a server side.** If it is a static site or a browser-only single-page application, tell the user that they must add a server or serverless functions for the Auth API calls. Do not put the client secret in browser code as a workaround.
- Read the store settings from check 1. They decide the design: `loginStage`, `paymentProvider`, `isPayByInvoiceEnabled`, `isPayByPurchaseOrderEnabled`, `maximumFileSize`, `acceptedCurrencies`.
- Ask the user which parts of the flow they want, if it is not clear. Do not build features that they did not ask for.

### 4. Build in this sequence

Build and check one layer before the next.

1. **Auth API client** (server only): guest session, pre-auth, send code, sign-in, send sign-up code, sign-up.
2. **Session storage**: access tokens in `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Verify tokens with the public keys at `<AUTH_SERVER>/.well-known/jwks.json` (RS256, check the issuer).
3. **Customer API client**: adds `X-Store-Name` and the Bearer token; handles errors with an empty body.
4. **Upload and analysis**: gzip the file, send `X-Filename`, poll the status, read the MessagePack result one time.
5. **Cart and prices**: create the cart, add items, call `POST /pre-order` after each change.
6. **Login screens**: the user builds these. There is no hosted login page.
7. **Cart claim** after sign-in and after sign-up.
8. **Checkout**: address, shipping, final price, `POST /order`.
9. **Payment and order pages.**

### 5. Verify

- Run the type check and the build of the project.
- Search the client bundle and the source for the secret prefix `sfs_`. It must not be there.
- Go through the checklist at the end of this file with the user.

## Rules that cause most defects

**Authentication**

- There is no OAuth redirect flow, no hosted login page, no refresh token, and no sign-out endpoint. Do not use `/oauth2/*` endpoints or an OIDC client library for customer sign-in.
- All Auth API calls except `PATCH /customer/login/reset` use HTTP Basic with the storefront credentials. `PATCH /customer/login/reset` uses the customer's Bearer token.
- The Auth API accepts no browser calls. Do not forward browser cookies or the `Origin` header to it.
- `POST /customer/login/pre-auth` uses the fields `username` and `storeName`. All other endpoints use `email` and `store`.
- Pre-auth result `["PASSWORD", "OTP"]` means that both factors are necessary.
- Sign-up does not accept a password. A `password` field gives `400`.
- Sign-in and sign-up can return `200` with `{"result":["WAIT_FOR_APPROVAL"]}` and no token. Check for `access_token` before you start a session.
- Tokens are valid for 9 hours. On expiry: a customer signs in again; a guest gets a new guest token.
- Get one guest token for each visitor and keep it. Do not get a new one on each page load (rate limit).

**Customer API**

- Send `X-Store-Name` on every call, also on public calls. Its value must be equal to the `operator-name` claim of the token.
- Public endpoints (no token): `/operator`, `/operator/logo`, `/operator/processes`, `/operator/lead-times`, `/countries`. All other endpoints need a guest or customer token.
- A guest token works for: upload, analysis status and result, `POST /pre-order`, `POST /cart`, `PATCH /cart/{id}`, and add/replace/remove cart items. All other endpoints need a customer token (`403` for a guest).
- **Upload**: `PUT /part-revision/upload`, `multipart/form-data`, field `file` with the **gzip-compressed** file, and the mandatory header `X-Filename` (URL-encoded original name). A file that is not compressed fails in the analysis.
- **Analysis**: poll `GET /part-revision/upload/status`. Continue until `RESULT_READY` (not `ANALYSIS_COMPLETED`). Stop on `ANALYSIS_FAILED`.
- **Result**: `GET /part-revision/upload/{id}/results` returns MessagePack, not JSON, and **works one time only**. Store `partRevisionId` and all other data that you need immediately.
- A guest cannot call `GET /cart`. Keep the cart ID and the items in the storefront.
- The cart item field is `precisionPricesId`. The pre-order and order line field is `precisionId`.
- Carts have the prefix `/cart`. Cart items have the prefix `/carts/{cartId}/items`.
- A cart has no prices. `POST /pre-order` gives prices and purchasability. The keys of `requisitions` are UUIDs that the storefront selects.
- A `null` entry in `quote.requisitions` means "no instant price". `purchasability.canBePurchased: false` means "request a quote", not payment.
- After sign-in, call `PATCH /cart/{cartId}/claim` with the customer token as Bearer and `{"anonymousSessionToken": "<guest token>"}` in the body. Treat `409` as "already claimed".
- `POST /order` creates a resource with `state: "QUOTE"`. Send `intent: "CHECKOUT"` when the customer continues to payment immediately.
- There is no "confirm payment" call. After an online payment, poll `GET /order/{id}` until `paymentStatus` changes.
- Many errors have an **empty body**. Read the HTTP status first. Cart item errors have `{"error": "<text>"}` with no `message`.

**Store settings that the storefront must apply itself**

- `loginStage: "BEFORE_PRICE"`: ask for sign-in before uploads and prices. The API does not block guests.
- `maximumFileSize` (megabytes): check before the upload. The API does not check it for part files.
- Payment methods: invoice if `isPayByInvoiceEnabled` or the customer type is `ACCOUNT`; purchase order if `isPayByPurchaseOrderEnabled` (and the type is not `INTERNAL`) or the type is `ACCOUNT`; online payment if `paymentProvider` is not `NONE` and the type is not `INTERNAL`.

## Minimal clients (TypeScript, server side)

Adapt these to the framework of the project.

```ts
// Auth API: storefront credentials, server only.
const basic = Buffer.from(`${process.env.AUTH_CLIENT_ID}:${process.env.AUTH_CLIENT_SECRET}`).toString('base64')

async function authApi(path: string, body: unknown) {
  const response = await fetch(`${process.env.AUTH_SERVER}${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => ({}))
  return response.ok ? { ok: true as const, data } : { ok: false as const, status: response.status, code: data.code }
}

const store = process.env.STORE_NAME
const guestToken = () => authApi('/customer/anonymous', { store })
const preAuth = (email: string) => authApi('/customer/login/pre-auth', { username: email, storeName: store })
const sendCode = (email: string) => authApi('/customer/otp/send', { store, email })
const signIn = (email: string, factors: { password?: string; otp?: string }) => authApi('/customer/sign-in', { store, email, ...factors })
```

```ts
// Customer API: access token + X-Store-Name.
async function customerApi(path: string, init: RequestInit & { token?: string } = {}) {
  const response = await fetch(`${process.env.API_BASE}/api/customer/v1${path}`, {
    ...init,
    headers: {
      'X-Store-Name': process.env.STORE_NAME!,
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...init.headers
    }
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) // the body is often empty
    throw Object.assign(new Error(body?.message ?? `HTTP ${response.status}`), { status: response.status, code: body?.error })
  }
  return response
}
```

```ts
// Upload: gzip + X-Filename. Result: MessagePack, one time only.
import { gzipSync } from 'node:zlib'
import { decode } from '@msgpack/msgpack'

async function uploadPart(token: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([gzipSync(Buffer.from(await file.arrayBuffer()))]), file.name)
  const response = await customerApi('/part-revision/upload', {
    method: 'PUT', token, body: form, headers: { 'X-Filename': encodeURIComponent(file.name) }
  })
  return response.json() // the analysis ID
}

async function readResult(token: string, analysisId: string) {
  const response = await customerApi(`/part-revision/upload/${analysisId}/results`, { token, headers: { Accept: 'application/msgpack' } })
  return decode(new Uint8Array(await response.arrayBuffer())) as { partRevisionId: string; fileName: string; width: number; height: number; length: number }
}
```

```ts
// Token verification with the public keys.
import { createRemoteJWKSet, jwtVerify } from 'jose'

const jwks = createRemoteJWKSet(new URL(`${process.env.AUTH_SERVER}/.well-known/jwks.json`))
const verify = async (token: string) => (await jwtVerify(token, jwks, { issuer: process.env.AUTH_SERVER, algorithms: ['RS256'] })).payload
// payload.scope: 'CUSTOMER' | 'ANONYMOUS'; payload['customer-id']; payload['customer-principal'] (the email)
```

## Diagnose problems

| Symptom | Probable cause |
|---|---|
| `401` on all Auth API calls | Incorrect or revoked credentials; or the call has no `Authorization: Basic` header |
| `404` from the Auth API for a store that exists | The credentials belong to a different store, or the store name has different letter case |
| `401`/`403` from the Customer API with a valid token | `X-Store-Name` is missing or is not equal to the token's `operator-name` |
| `403` with an empty body | A guest token on an endpoint that needs a customer |
| `401` on a public endpoint | An expired token was sent. Send no token, or a new one. |
| The upload gives `400` `UNSUPPORTED_FILE_TYPE` | `X-Filename` is missing an extension, or the type is not supported |
| The analysis always fails | The file was not gzip-compressed |
| The result call gives `404` | The result was already read, or a different session uploaded the file |
| JSON parse error on the result | The result is MessagePack |
| `409` `CART_NOT_CLAIMED` | An address or rate was set on a guest cart. Sign in and claim the cart first. |
| `400` with an empty body on a payment call | That payment method is not permitted for this customer or order |
| The price is missing for a line | The line needs a manual review (`null` in `quote.requisitions`) |
| `429` | Rate limit. Read `Retry-After` if it is present. Do not retry in a loop. |

## Checklist before the work is complete

- [ ] The client secret is only in server-side environment variables and is not in the repository.
- [ ] All Auth API calls come from the server.
- [ ] Tokens are in `HttpOnly` cookies (or equivalent server-side storage) and are verified before use.
- [ ] Sign-in handles: no account (`404` → sign-up), two factors, `WAIT_FOR_APPROVAL`, `401`, `429`.
- [ ] The guest cart is claimed after sign-in and after sign-up.
- [ ] `loginStage` and `maximumFileSize` are applied.
- [ ] The upload is gzip-compressed and the result is read one time.
- [ ] Checkout handles `canBePurchased: false`.
- [ ] Error handling does not assume a response body.
