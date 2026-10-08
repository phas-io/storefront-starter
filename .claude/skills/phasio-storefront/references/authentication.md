# Authentication

This page tells you how a custom storefront signs customers in and gets access tokens for the Customer API.

## Overview

A custom storefront does not use an OAuth redirect flow. There is no hosted login page for customers. You build the login screens, and your **server** calls the Auth API.

1. An owner or admin of your Phasio organisation creates **storefront credentials** (a client ID and a client secret).
2. Your storefront server calls the Auth API with these credentials.
3. The Auth API returns an **access token** (a signed JWT) for a guest or for a signed-in customer.
4. Your storefront sends the access token to the Customer API as a Bearer token.

```
Browser  ->  Your storefront server  ->  Auth API       (client ID + client secret)
Browser  ->  Your storefront server  ->  Customer API   (access token)
```

> **Keep the client secret on your server.** Do not put it in browser code, in a mobile app, or in a public repository. The Auth API does not accept calls from browsers (it sends no CORS headers).

## Base URLs

| Name | Value |
|---|---|
| Auth API base URL (`AUTH_SERVER`) | Given by Phasio for your region, for example `https://auth.eu.phas.io` |
| Customer API base URL (`API_BASE`) | Given by Phasio for your region, for example `https://c-api.eu.phas.io` |

The Auth API base URL is also the token **issuer** (`iss` claim). A token from one region is not valid in a different region.

## Create storefront credentials

1. Sign in to your Phasio account page at `<AUTH_SERVER>/account?tab=custom-storefronts`. You must be an **owner** or **admin** of the organisation.
2. In **Custom storefronts**, type a storefront name (for example `Main website`) and select **Create credentials**.
3. Copy the **Client ID** (`sf_…`) and the **Client secret** (`sfs_…`). The secret shows **one time only**.
4. Set them as environment variables on your storefront server:

```bash
AUTH_CLIENT_ID=sf_xxxxxxxxxxxxxxxxxxxxxxxx
AUTH_CLIENT_SECRET=sfs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Rules:

- One set of credentials works for **your store only**. A call for a different store gets the same answer as a call for an unknown store.
- You can have a maximum of 20 active sets of credentials. Use one set for each storefront or environment.
- There is no "rotate" button. To rotate: create new credentials, deploy them, then revoke the old credentials.
- **Revoke** takes effect immediately. The storefront that uses the revoked credentials loses access.

## Your store name

Each call identifies your store by its **store name**. This is the unique name of your store, the same name that appears in the URL of your Phasio-hosted storefront. The store name must match exactly (it is case-sensitive).

## Call conventions

All endpoints in this section, except `PATCH /customer/login/reset`:

- use the method `POST`
- need the header `Authorization: Basic base64(<client ID>:<client secret>)`
- need the header `Content-Type: application/json`
- accept a JSON body of maximum 100 KB

Do not forward browser cookies or the browser `Origin` header to the Auth API.

A successful sign-in returns a **token response**:

```json
{
  "scope": "CUSTOMER",
  "access_token": "<JWT>",
  "refresh_token": "",
  "token_type": "Bearer",
  "expires_in": 32400
}
```

- `scope` is `CUSTOMER` for a signed-in customer and `ANONYMOUS` for a guest.
- `expires_in` is 32400 seconds (9 hours).
- `refresh_token` is always empty. There is no refresh. Refer to [Token lifetime, refresh and sign-out](#token-lifetime-refresh-and-sign-out).

Errors return a JSON body with a `message` field. Use the HTTP status code in your logic, not the message text.

```json
{ "message": "valid storefront credentials are required" }
```

Missing, incorrect, or revoked credentials always give `401`.

## Guest sessions

A guest session lets a visitor use the storefront before sign-in, for example to upload parts and to build a cart.

### `POST /customer/anonymous`

Request:

```json
{ "store": "your-store-name" }
```

Response `200`: a token response with `"scope": "ANONYMOUS"`.

| Status | Meaning |
|---|---|
| `400` | `store` is empty |
| `404` | The store is unknown, or the credentials are not for this store |
| `429` | Too many requests |

Each call makes a new, independent guest. Get one guest token for each visitor, keep it for the visit, and get a new one a short time before it expires.

When the guest signs in, move the guest's parts and carts to the customer account. Refer to [Sign in, then claim the guest cart](purchase-flow.md#guest-to-customer).

## Sign-up

Sign-up uses a one-time code sent by email. The customer does not set a password during sign-up. The customer can add a password later (refer to [Change the login method](#change-the-login-method)).

### Step 1: `POST /customer/signup/otp/send`

```json
{ "store": "your-store-name", "email": "jane@example.com", "requestedLocale": "en" }
```

`requestedLocale` is optional. It sets the language of the email.

Response `200`: `{ "sent": true }`. The customer receives a 7-digit code. The code is valid for 5 minutes. A new code replaces the old code.

| Status | Meaning |
|---|---|
| `400` | `store` is empty, or `email` is not a valid email address |
| `404` | The store is unknown, or the credentials are not for this store |
| `409` | A customer with this email already exists for this store. Send the customer to sign-in. |
| `429` | Too many codes requested |

### Step 2: `POST /customer/sign-up`

```json
{
  "store": "your-store-name",
  "email": "jane@example.com",
  "otp": "1234567",
  "firstName": "Jane",
  "lastName": "Doe",
  "companyName": "Example Ltd",
  "language": "EN",
  "notificationPreference": "EMAIL"
}
```

Only `store`, `email` and `otp` are mandatory. Do not send a `password` field (the API rejects it with `400`). If `companyName` is empty, the organisation name becomes `"<firstName> <lastName>"`. The default `language` is `EN`. The default `notificationPreference` is `EMAIL`.

Response `200`, customer approved (the customer is now signed in):

```json
{
  "approved": true,
  "scope": "CUSTOMER",
  "access_token": "<JWT>",
  "refresh_token": "",
  "token_type": "Bearer",
  "expires_in": 32400
}
```

Response `200`, approval necessary (your store requires approval of new customers):

```json
{ "approved": false, "result": ["WAIT_FOR_APPROVAL"] }
```

The account exists, but there is no token. Show a "wait for approval" message.

| Status | Meaning |
|---|---|
| `400` | A `password` field was sent |
| `401` | The code is incorrect or expired |
| `404` | The store is unknown, or the credentials are not for this store |
| `409` | A customer with this email already exists |
| `409` with `"code": "CUSTOMER_ORGANISATION_DUPLICATE_NAME"` | An organisation with this name already exists. The code is used up. Ask for a different company name and send a new code. |
| `429` | Too many attempts. Request a new code. |

## Sign-in

### Step 1: `POST /customer/login/pre-auth`

This call tells you which factors the customer must give.

```json
{ "username": "jane@example.com", "storeName": "your-store-name" }
```

> The field names are `username` and `storeName` on this endpoint only. All other endpoints use `email` and `store`.

Response `200`:

| `result` | Meaning |
|---|---|
| `["OTP"]` | Sign in with a one-time code |
| `["PASSWORD"]` | Sign in with a password |
| `["PASSWORD", "OTP"]` | **Both** a password and a one-time code are necessary |

| Status | Meaning |
|---|---|
| `400` | `username` or `storeName` is empty |
| `404` | No account found. Offer sign-up. |
| `429` | Too many requests |

This call does not tell you if the customer is approved.

### Step 2 (if a code is necessary): `POST /customer/otp/send`

```json
{ "store": "your-store-name", "email": "jane@example.com" }
```

Response: always `200` `{ "sent": true }`, also when the customer does not exist. The code has 7 digits, is valid for 5 minutes, and works one time.

| Status | Meaning |
|---|---|
| `429` | Too many codes requested |

### Step 3: `POST /customer/sign-in`

```json
{ "store": "your-store-name", "email": "jane@example.com", "password": "…", "otp": "1234567" }
```

Send `password`, `otp`, or the two together, as the pre-auth result tells you.

Response `200`: a token response with `"scope": "CUSTOMER"`, or `{ "result": ["WAIT_FOR_APPROVAL"] }` if the customer is not approved yet.

| Status | Meaning |
|---|---|
| `400` | No factor was sent, or the account needs two factors and one is missing |
| `401` | Incorrect credentials, or an incorrect, expired, or used code |
| `429` | Too many attempts |

### Forgotten password

There is no separate "forgot password" endpoint. Use a one-time code:

1. Call `POST /customer/otp/send`.
2. Call `POST /customer/sign-in` with the `otp` only.
3. Optional: let the customer set a new password with `PATCH /customer/login/reset`. This step needs a second, new code.

This procedure does not apply to accounts that require a password **and** a code.

## Change the login method

### `PATCH /customer/login/reset`

A signed-in customer uses this call to set a password, to change a password, or to remove a password.

This endpoint uses the **customer access token**, not the storefront credentials:

```
Authorization: Bearer <customer access token>
Content-Type: application/json
```

Call it from your server. Browsers cannot call the Auth API.

```json
{
  "newLoginMethod": "PASSWORD",
  "newPassword": "a-new-password",
  "passwordGuess": "the-current-password",
  "otpGuess": null
}
```

| Field | Meaning |
|---|---|
| `newLoginMethod` | `PASSWORD`, `OTP`, or `OTP_AND_PASSWORD` |
| `newPassword` | Mandatory for `PASSWORD` and `OTP_AND_PASSWORD`. Minimum 8 characters. |
| `passwordGuess` | The current password |
| `otpGuess` | A new code from `POST /customer/otp/send` |

The customer must prove identity again with `passwordGuess` **or** `otpGuess`. The access token alone is not sufficient.

Response `200`: `{ "status": true }`.

| Status | Meaning |
|---|---|
| `400` | No proof was sent, the new password is too short, or the method is not supported |
| `401` | The token is missing, invalid, or a guest token; or the password or code is incorrect |
| `429` | Too many attempts |

## Access tokens

Access tokens are JWTs signed with **RS256**.

| Item | Value |
|---|---|
| Public keys (JWKS) | `<AUTH_SERVER>/.well-known/jwks.json` |
| Issuer (`iss`) | `<AUTH_SERVER>` |
| Lifetime | 9 hours |

The JWKS can contain more than one key. Select the key by the `kid` header. Standard JWT libraries do this for you.

### Verify a token on your server

Verify the signature, the issuer, and the expiry before you trust a claim. Example with the `jose` library:

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const jwks = createRemoteJWKSet(new URL(`${process.env.AUTH_SERVER}/.well-known/jwks.json`))

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, { issuer: process.env.AUTH_SERVER })
  return payload
}
```

### Customer token claims (`scope: "CUSTOMER"`)

| Claim | Type | Meaning |
|---|---|---|
| `iss` | string | Auth API base URL |
| `sub` | string | Customer ID, as a string |
| `iat`, `exp` | number | Issue time and expiry time, in seconds |
| `scope` | string | `CUSTOMER` |
| `type` | string | `customer` |
| `operator-id` | number | ID of your organisation (the manufacturer) |
| `operator-name` | string | Your store name |
| `customer-id` | number | Customer ID |
| `customer-principal` | string | Sign-in identifier (the email address, in lower case) |
| `customer-organisation-id` | number | ID of the customer's organisation |
| `client-id` | string | Client ID of the storefront credentials |
| `first-name`, `last-name` | string | Customer name |
| `language` | string | Customer language, in lower case (default `en`) |
| `notification-preference` | string | Default `EMAIL` |
| `has-custom-pricing` | boolean | The customer has custom pricing |
| `is-approved` | boolean | Always `true` (customers who are not approved get no token) |

Claims are read at sign-in. A change to the customer profile shows in the token after the next sign-in.

### Guest token claims (`scope: "ANONYMOUS"`)

`iss`, `sub` (a random ID for this guest), `iat`, `exp`, `scope` (`ANONYMOUS`), `type` (`anonymous`), `operator-id`, `operator-name`, `client-id`.

## Token lifetime, refresh and sign-out

- A token is valid for 9 hours. There is no refresh token.
- When a **customer** token expires, the customer must sign in again.
- When a **guest** token expires, get a new guest token.
- There is no sign-out endpoint. To sign a customer out, delete the token that your storefront holds.
- A token stays valid until it expires. Store tokens carefully. An `HttpOnly`, `Secure` cookie set by your server is a good choice.

## Features that are not available

- Magic links
- Social sign-in and single sign-on for customers
- Sign-up with a phone number

## Rate limits

When you exceed a limit, the API returns `429`. Some `429` responses have a `Retry-After` header (seconds). Wait, then try again.

Limits for each set of storefront credentials:

| Limit | Value |
|---|---|
| All `/customer/*` calls | 600 in 1 minute |
| Guest sessions (`/customer/anonymous`) | 1200 in 15 minutes |
| Sign-in codes sent (`/customer/otp/send`) | 600 in 15 minutes |
| Sign-up codes sent (`/customer/signup/otp/send`) | 600 in 15 minutes |
| Pre-auth calls (`/customer/login/pre-auth`) | 1800 in 15 minutes |

Limits for each end customer (one email address at your store):

| Limit | Value |
|---|---|
| Sign-in codes sent | 5 in 15 minutes |
| Sign-up codes sent | 5 in 15 minutes |
| Incorrect codes | 10 in 15 minutes |
| Incorrect passwords | 10 in 15 minutes |

After a customer uses up the incorrect-code or incorrect-password limit, the correct value also gives `429` until the 15 minutes end. A new sign-in code resets the incorrect-code limit.

Guidance:

- Do not get a new guest token on each page load. Get one for each visitor and keep it.
- Show a clear "try again later" message on `429`.

## Checklist

- [ ] The client secret is only in server-side environment variables.
- [ ] All Auth API calls come from your server.
- [ ] You verify tokens (signature, issuer, expiry) before you trust claims.
- [ ] You handle `WAIT_FOR_APPROVAL` in sign-up and in sign-in.
- [ ] You handle `["PASSWORD", "OTP"]` (two factors) in sign-in.
- [ ] You handle `429` responses.
- [ ] You sign the customer out when the token expires.
