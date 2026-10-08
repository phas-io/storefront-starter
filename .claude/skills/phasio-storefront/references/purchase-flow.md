# The purchase flow

This page shows the full sequence of Customer API calls, from the first visit to a paid order. For field-level detail, refer to the [Customer API reference](customer-api.md).

All paths on this page are relative to:

```
<API_BASE>/api/customer/v1
```

All examples use these shell variables:

```bash
API="$API_BASE/api/customer/v1"
STORE="your-store-name"
TOKEN="<access token from the Auth API>"
```

## Sequence

| Step | Call | Token |
|---|---|---|
| 1. Read the store settings | `GET /operator` | None |
| 2. Read the configuration options | `GET /operator/processes`, `GET /operator/lead-times` | None |
| 3. Get a guest token | Auth API: `POST /customer/anonymous` | - |
| 4. Upload a part | `PUT /part-revision/upload` | Guest or customer |
| 5. Wait for the analysis | `GET /part-revision/upload/status` | Guest or customer |
| 6. Read the analysis result (one time) | `GET /part-revision/upload/{analysisId}/results` | Guest or customer |
| 7. Create a cart and add the part | `POST /cart`, `POST /carts/{cartId}/items` | Guest or customer |
| 8. Get a price | `POST /pre-order` | Guest or customer |
| 9. Sign in, then claim the guest cart | Auth API, then `PATCH /cart/{cartId}/claim` | Customer |
| 10. Addresses and shipping | `GET`/`POST /address`, `GET /operator/shipping-methods`, `POST /shipping/rate` | Customer |
| 11. Get the final price | `POST /pre-order` | Customer |
| 12. Create the order | `POST /order` | Customer |
| 13. Pay | `POST /order/{id}/payment`, or invoice, or purchase order | Customer |
| 14. Follow the order | `GET /order/{id}` | Customer |

If your store setting `loginStage` is `BEFORE_PRICE`, ask the visitor to sign in before step 4 and skip the guest steps.

## 1. Read the store settings

```bash
curl "$API/operator" -H "X-Store-Name: $STORE"
```

The response tells you how your store is configured: currencies, payment provider, login rules, maximum file size, and more. Your storefront must obey these settings. Refer to [Store settings](customer-api.md#store-settings).

## 2. Read the configuration options

```bash
curl "$API/operator/processes"  -H "X-Store-Name: $STORE"
curl "$API/operator/lead-times" -H "X-Store-Name: $STORE"
```

`/operator/processes` returns a list of manufacturing processes. Each process contains its materials (with colours), infills, precisions, and post-processings. The `id` of a process is the `processPricesId` in later calls.

## 3. Get a guest token

Your server calls the Auth API. Refer to [Guest sessions](authentication.md#guest-sessions).

## 4. Upload a part

Send one file for each request, as `multipart/form-data`.

Rules:

- The form field name is `file`.
- **Compress the file with gzip before you send it.** The form field contains the gzip data.
- The header `X-Filename` is mandatory. It contains the original file name, URL-encoded. The API reads the file type from the extension of this name.
- Check the size against the store setting `maximumFileSize` (megabytes) before you upload. The API has a hard limit of 1024 MB for each request.

```bash
gzip -k bracket.step        # makes bracket.step.gz

curl -X PUT "$API/part-revision/upload" \
  -H "X-Store-Name: $STORE" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Filename: bracket.step" \
  -F "file=@bracket.step.gz"
```

Response `200`: a JSON string, the **analysis ID**.

```json
"0b6f5a0e-6f1c-4a2e-9a55-3c1f0e8d7b21"
```

A file extension that is not supported gives `400` with `"error": "UNSUPPORTED_FILE_TYPE"`.

Common extensions: `stl`, `step`, `stp`, `iges`, `igs`, `3mf`, `x_t`, `sldprt`.

## 5. Wait for the analysis

The analysis is asynchronous. Poll the status. You can ask for many IDs in one call.

```bash
curl "$API/part-revision/upload/status?analysisIds=$ANALYSIS_ID" \
  -H "X-Store-Name: $STORE" -H "Authorization: Bearer $TOKEN"
```

```json
{ "0b6f5a0e-6f1c-4a2e-9a55-3c1f0e8d7b21": "ANALYSIS_STARTED" }
```

| Status | Meaning |
|---|---|
| `SENT_FOR_ANALYSIS`, `ANALYSIS_STARTED`, `REPAIR_STARTED`, `REPAIR_COMPLETED`, `ANALYSIS_COMPLETED` | In progress. Continue to poll. |
| `RESULT_READY` | Complete. Read the result. |
| `ANALYSIS_FAILED`, `DESIGN_DOES_NOT_EXIST` | Failed. An unknown or expired ID also gives `ANALYSIS_FAILED`. |

Guidance:

- Poll one time each second.
- Do not read the result on `ANALYSIS_COMPLETED`. Wait for `RESULT_READY`.
- The status is kept for 12 minutes after the upload. Stop after that time.

## 6. Read the analysis result

```bash
curl --compressed "$API/part-revision/upload/$ANALYSIS_ID/results" \
  -H "X-Store-Name: $STORE" -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/msgpack" -o result.msgpack
```

Important:

- The body is **MessagePack**, not JSON. The response has `Content-Encoding: gzip`, which HTTP clients remove automatically.
- **You can read the result one time only.** A second call gives `404`. Keep the data that you need.
- The result contains the `partRevisionId`. You need it for all later calls.

Decode example (Node.js):

```ts
import { decode } from '@msgpack/msgpack'

const response = await fetch(`${API}/part-revision/upload/${analysisId}/results`, {
  headers: { 'X-Store-Name': store, Authorization: `Bearer ${token}`, Accept: 'application/msgpack' }
})
const result = decode(new Uint8Array(await response.arrayBuffer())) as AnalysisResult
// result.partRevisionId, result.fileName, result.width, result.height, result.length, result.volume, …
```

The result also contains binary data: `thumbnail` (image bytes), `stl` (a gzip-compressed STL mesh for a 3D viewer), and `wallThickness`. Refer to [Analysis result](customer-api.md#analysis-result).

## 7. Create a cart and add the part

A cart keeps the parts and their configuration on the server. A cart does not contain prices.

```bash
curl -X POST "$API/cart" -H "X-Store-Name: $STORE" -H "Authorization: Bearer $TOKEN"
# -> { "cartId": "…", "items": [], "status": "OPEN", … }

curl -X POST "$API/carts/$CART_ID/items" \
  -H "X-Store-Name: $STORE" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "partRevisionId": "…",
    "quantity": 1,
    "units": "MILLIMETERS",
    "processPricesId": "…",
    "materialId": 12,
    "colorId": null,
    "infillId": null,
    "precisionPricesId": null,
    "leadTimeId": null,
    "postProcessingIds": [],
    "name": "bracket.step"
  }'
```

Select a sensible default configuration: the process, material, infill, and lead time that have `isDefault` (`default` for infills), and the first active precision.

> A **guest** can create a cart and can add, change, and remove items. A guest cannot read a cart back (`GET /cart` needs a customer token). Keep the cart ID and the item data in your storefront until the visitor signs in.

## 8. Get a price

`POST /pre-order` calculates the price for a set of lines. The call is synchronous and stores no data. Call it again each time the configuration changes.

Each line has a **key that you select** (use a UUID). The response uses the same keys.

```bash
curl -X POST "$API/pre-order" \
  -H "X-Store-Name: $STORE" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "currency": "EUR",
    "requisitions": {
      "7b0c1a52-0d1e-4b0c-8f5e-0c6a1c0f3e11": {
        "sequence": 0,
        "partRevisionId": "…",
        "units": "MILLIMETERS",
        "quantity": 1,
        "processPricesId": "…",
        "materialId": 12,
        "infillId": null,
        "precisionId": null,
        "colorId": null,
        "leadTimeId": null,
        "postProcessingIds": [],
        "comments": [],
        "name": "bracket.step"
      }
    },
    "shipping": null,
    "shippingId": null,
    "billingAddressId": null,
    "discountId": null,
    "operatorNote": null,
    "affiliate": null,
    "cartId": null
  }'
```

> The precision field is `precisionPricesId` in a cart item, and `precisionId` in a pre-order or order line.

The response has three parts:

```json
{
  "quote": {
    "currency": "EUR",
    "price": 54.2,
    "subtotal": 45.0,
    "shipping": 0,
    "discount": 0,
    "topUp": null,
    "tax": { "totalPrice": 9.2, "totalPercentage": 20.44, "components": [], "isTaxExempted": false, "isTaxReverseCharged": false, "isTaxAppliedToShipping": true },
    "lineItems": [],
    "requisitions": {
      "7b0c1a52-0d1e-4b0c-8f5e-0c6a1c0f3e11": { "partRevisionId": "…", "quantity": 1, "price": 45.0, "unitPrice": 45.0, "manufacturingPrice": 45.0, "postProcessingPrice": 0, "postProcessingOptions": [] }
    },
    "expectedDispatchDate": "2026-11-02"
  },
  "purchasability": {
    "canBePurchased": true,
    "isPriceReviewRequired": false,
    "withinMaximumOrderValue": true,
    "withinBoundingBoxLimit": true,
    "withinWallThicknessLimit": true,
    "isMaterialPurchasable": true,
    "isPostProcessingPurchasable": true,
    "parts": {}
  },
  "constraints": {}
}
```

How to use the response:

- Prices are decimal numbers in the given currency (for example `45.0` is 45 euros).
- If a line in `quote.requisitions` is `null`, there is no instant price for that part. The manufacturer must review it.
- `quote.topUp` is an amount that is added to reach the minimum order amount of the store. Show it as a line.
- If `purchasability.canBePurchased` is `false`, do not offer payment. Offer "request a quote" (create the order, then the manufacturer reviews it).

## 9. Sign in, then claim the guest cart

Sign the customer in through the Auth API. Refer to [Sign-in](authentication.md#sign-in) and [Sign-up](authentication.md#sign-up).

<a id="guest-to-customer"></a>Then move the guest's parts and carts to the customer. Send the **customer** token as the Bearer token, and the **guest** token in the body:

```bash
curl -X PATCH "$API/cart/$CART_ID/claim" \
  -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d "{ \"anonymousSessionToken\": \"$GUEST_TOKEN\" }"
```

Response `204`. One call moves **all** parts and **all** open carts of that guest to the customer.

| Status | Meaning |
|---|---|
| `404` | The cart does not exist, or it is not a cart of this guest |
| `409` | The cart is already claimed, or it is not open. If your customer already owns the cart, continue. |

After the claim, discard the guest token. From this point, use the customer token for all calls.

## 10. Addresses and shipping

```bash
# Addresses of the customer's organisation
curl "$API/address" -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN"

# Shipping methods of the store
curl "$API/operator/shipping-methods" -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN"

# Rates for delivery to an address
curl -X POST "$API/shipping/rate" \
  -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "currency": "EUR",
    "toAddressId": 123,
    "parts": [
      { "partRevisionId": "…", "units": "MILLIMETERS", "quantity": 1, "processPricesId": "…", "materialId": 12 }
    ]
  }'
```

A shipping method has a `shippingMode`:

| Mode | What the customer selects | `shipping` object for the order |
|---|---|---|
| `SELF_COLLECTION` | Collection from the manufacturer. No address. | `{ "shippingMode": "SELF_COLLECTION", "shippingMethodId": 3 }` |
| `FIXED_PRICE` | A rate from `POST /shipping/rate` | `{ "shippingMode": "FIXED_PRICE", "shippingMethodId": 7, "rateId": "…", "toAddressId": 123 }` |
| `CUSTOMER_ACCOUNT` | Delivery on the customer's own carrier account | `{ "shippingMode": "CUSTOMER_ACCOUNT", "shippingMethodId": 9, "toAddressId": 123, "accountNumber": "…" }` |

To create an address, refer to [Addresses](customer-api.md#addresses).

## 11. Get the final price

Call `POST /pre-order` again. This time, include `shipping` and `billingAddressId`. The quote then includes shipping and the correct tax.

## 12. Create the order

`POST /order` uses the same body as `POST /pre-order`, plus `cartId` and `intent`.

```bash
curl -X POST "$API/order" \
  -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{ …the pre-order body…, "cartId": "…", "intent": "CHECKOUT" }'
```

- The API calculates the price again. It does not trust a price from the client.
- The new order has `"state": "QUOTE"` and `"paymentStatus": "UNPAID"`. It becomes an `ORDER` when the customer pays or accepts.
- If you give a `cartId`, the cart must be open. After the call, the cart status is `CONVERTED`.
- Send `"intent": "CHECKOUT"` when the customer continues to payment immediately. Without it, the customer gets a "your quote is ready" notification. Omit it for a "save as quote" button.

Response:

```json
{
  "order": { "id": 4711, "state": "QUOTE", "paymentStatus": "UNPAID", "quoteNumber": "Q-1042", "price": 54.2, "currency": "EUR", "threadId": 880 },
  "requisitionMapping": { "7b0c1a52-0d1e-4b0c-8f5e-0c6a1c0f3e11": { "id": 9001, "orderId": 4711 } }
}
```

## 13. Pay

First, check that the order can be paid:

```bash
curl "$API/order/$ORDER_ID/purchasability" -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN"
```

If `canBePurchased` is `false`, the manufacturer must review the quote first.

There are three ways to pay. Which ones you show depends on the store settings and on the customer type (`GET /customer`, field `customerType`).

| Method | Show it when | Call |
|---|---|---|
| Online payment | `paymentProvider` is not `NONE`, and `customerType` is not `INTERNAL` | `POST /order/{id}/payment` |
| Pay by invoice | `isPayByInvoiceEnabled` is `true`, or `customerType` is `ACCOUNT` | `PATCH /order/{id}/payment/invoice` |
| Pay by purchase order | `isPayByPurchaseOrderEnabled` is `true` (and `customerType` is not `INTERNAL`), or `customerType` is `ACCOUNT` | `PATCH /order/{id}/payment/purchase-order` |

### Online payment

```bash
curl -X POST "$API/order/$ORDER_ID/payment" -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN"
```

The response contains the data for the payment provider of your store. For Stripe:

```json
{
  "id": "pi_…",
  "provider": "STRIPE",
  "clientSecret": "pi_…_secret_…",
  "merchantAccount": "acct_…",
  "finalPrice": 54.2,
  "tax": 9.2,
  "currency": "EUR",
  "stripePaymentIntentStatus": "requires_payment_method"
}
```

Complete the payment in the browser with the SDK of the provider. There is no "confirm" call to the Customer API. The provider tells Phasio about the result. Poll `GET /order/{id}` until `paymentStatus` is `PROCESSING` or `PAID`.

Refer to [Online payment](customer-api.md#online-payment) for the provider fields.

### Pay by invoice

```bash
curl -X PATCH "$API/order/$ORDER_ID/payment/invoice" -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN"
```

No body. The response is the updated order. The quote becomes an order. If this method is not permitted, the API returns `400` with an empty body.

### Pay by purchase order

`multipart/form-data` with three optional fields: `purchaseOrderNumber`, `message`, and `file` (the purchase order document).

```bash
curl -X PATCH "$API/order/$ORDER_ID/payment/purchase-order" \
  -H "X-Store-Name: $STORE" -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -F "purchaseOrderNumber=PO-2026-118" -F "message=Please confirm the delivery date" -F "file=@po.pdf"
```

## 14. Follow the order

There is no push channel. Poll `GET /order/{id}`.

| Field | Meaning |
|---|---|
| `state` | `QUOTE` or `ORDER` |
| `paymentStatus` | `UNPAID`, `PROCESSING`, `PAID`, `REFUNDED`, `EXTERNALLY_TRACKED` |
| `isReviewRequired` | The manufacturer must review the quote |
| `kanbanColumn.name` | The production stage that the manufacturer shows |
| `shipping.expectedDispatchDate` | Expected dispatch date |
| `shipments[].tracking` | Carrier, tracking number, and tracking URL |

More calls:

- `GET /order` returns all quotes and orders of the customer's organisation.
- `GET /requisition?orderId={id}` returns the lines of an order.
- `GET /order/{id}/quote` returns the price breakdown.
- `GET /document/order/{id}/estimate`, `/confirmation`, and `/invoice` return PDF documents.
- `GET /activity/thread/{threadId}` and `POST /activity` are the messages between the customer and the manufacturer.
