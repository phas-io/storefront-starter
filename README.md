# Phasio storefront starter

A minimal custom storefront for a [Phasio](https://phas.io) store, and a Claude Code skill that helps you build your own.

- **The example storefront** is a small Next.js application. It shows the full flow with as little code as possible: part upload, instant prices, sign-in, checkout, payment by invoice or purchase order, and order tracking.
- **The `phasio-storefront` skill** gives Claude Code the setup procedure, the API rules, and the API reference.

Documentation: [docs.phas.io/developers/storefronts](https://docs.phas.io/developers/storefronts)

## Run the example

You need Node.js 20 or later, a Phasio store, and storefront credentials.

1. Create storefront credentials at `<AUTH_SERVER>/account?tab=custom-storefronts`. You must be an owner or admin of the organisation. The client secret shows one time only.
2. Configure and start the application:

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev
```

3. Open http://localhost:3000.

| Variable | Value |
|---|---|
| `STORE_NAME` | Your store name |
| `AUTH_SERVER` | Base URL of the Auth API for your region |
| `API_BASE` | Base URL of the Customer API for your region |
| `AUTH_CLIENT_ID` | Client ID of your storefront credentials (`sf_…`) |
| `AUTH_CLIENT_SECRET` | Client secret of your storefront credentials (`sfs_…`) |

All variables are server-only. Do not add the `NEXT_PUBLIC_` prefix to them, and do not commit `.env.local`.

## Use the Claude Code skill

The skill is in `.claude/skills/phasio-storefront`. When you open this repository in Claude Code, the skill is available immediately. Ask Claude for what you need, for example:

- "Add colour selection to the part configuration."
- "Add Stripe payment to the order page."
- "My part upload fails. Find the cause."

To use the skill in a different project, copy it:

```bash
mkdir -p /path/to/your-project/.claude/skills
cp -r .claude/skills/phasio-storefront /path/to/your-project/.claude/skills/
```

Claude asks you to put your storefront credentials in a local environment file. Do not paste the client secret into the conversation.

## How the example is built

All calls to the two Phasio APIs go through the Next.js server. The browser does not see the client secret or the access tokens.

| File | Purpose |
|---|---|
| `src/lib/auth-api.ts` | Client for the Auth API: guest session, sign-in, sign-up |
| `src/lib/session.ts` | Access tokens in `HttpOnly` cookies; token verification with the public keys |
| `src/lib/customer-api.ts` | Client for the Customer API |
| `src/lib/basket.ts` | The storefront's own record of the cart; builds the price and order requests |
| `src/lib/shipping.ts` | Converts the selected shipping option to the `shipping` object |
| `src/app/actions.ts` | Server Actions: sign-in, sign-up, cart changes, checkout, payment |
| `src/app/api/parts/` | Route Handlers for the upload and for the analysis polling |
| `src/app/page.tsx` | Upload, configuration, and prices |
| `src/app/login/`, `src/app/sign-up/` | The login screens |
| `src/app/checkout/` | Address, shipping, final price, order creation |
| `src/app/orders/` | Order list, order detail, payment, documents |

Where to look for each API rule:

| Rule | Where |
|---|---|
| Credentials stay on the server (HTTP Basic) | `auth-api.ts` |
| Verify the token before you trust claims | `session.ts`, `verify` |
| Compress the part file with gzip; send `X-Filename` | `customer-api.ts`, `uploadPart` |
| Wait for `RESULT_READY`; read the MessagePack result one time | `api/parts/[analysisId]/route.ts`, `customer-api.ts` |
| A guest cannot read a cart back | `basket.ts` |
| `precisionPricesId` (cart) and `precisionId` (order) | `basket.ts` |
| Claim the guest cart after sign-in | `actions.ts`, `claimGuestCart` |
| Apply `loginStage` and `maximumFileSize` | `page.tsx`, `api/parts/route.ts` |
| `canBePurchased` and `intent: "CHECKOUT"` | `actions.ts`, `placeOrder` |
| Payment methods by store setting and customer type | `orders/[id]/page.tsx` |

## Limits of the example

This is an example, not a template for production.

- **Online payment is not included.** The order page shows pay by invoice and pay by purchase order. To add card payment, call `createPayment` and complete the payment with the SDK of your payment provider. Refer to [Online payment](https://docs.phas.io/developers/storefronts/customer-api#online-payment).
- **The basket is in a cookie**, which holds approximately 10 lines. Use a database in production.
- **Configuration is basic**: process, material, lead time, and quantity. Colours, infill, precision, and post-processing are not included.
- Parts are in millimetres. There is no 3D viewer and no thumbnail.
- One currency (the default currency of the store). No discount codes, messages, projects, or catalog.
- No tests, no translations, and only basic error pages.

## Repository contents

| Path | Contents |
|---|---|
| `src/` | The example storefront |
| `.claude/skills/phasio-storefront/SKILL.md` | The skill: procedure, rules, minimal client code, and a diagnosis table |
| `.claude/skills/phasio-storefront/references/` | A copy of the API documentation, for Claude |
