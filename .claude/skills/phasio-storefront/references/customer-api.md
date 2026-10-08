# Customer API reference

The Customer API is the API that a storefront uses for all store data: settings, parts, prices, carts, orders, and payments.

For the order of the calls, refer to [The purchase flow](purchase-flow.md). For tokens, refer to [Authentication](authentication.md).

## Conventions

### Base URL

```
<API_BASE>/api/customer/v1
```

All paths on this page are relative to this base URL.

### Headers

| Header | When | Value |
|---|---|---|
| `X-Store-Name` | **Always** | Your store name. It must be the same as the `operator-name` claim of the token. |
| `Authorization` | All endpoints that are not public | `Bearer <access token>` |
| `Content-Type` | Requests with a JSON body | `application/json` |

### Access levels

| Level | Meaning |
|---|---|
| **Public** | No token is necessary. `X-Store-Name` is necessary. |
| **Guest** | A guest token (`ANONYMOUS`) or a customer token (`CUSTOMER`) |
| **Customer** | A customer token (`CUSTOMER`) |

If you send a token to a public endpoint, the API validates it. An expired token gives `401` on a public endpoint too.

A customer sees only the data of the customer's own organisation. A guest sees only the parts and carts of the guest's own session.

### Words

| Word | Meaning |
|---|---|
| Operator | The manufacturer that owns the store (you) |
| Part revision | One uploaded version of a part |
| Process | A manufacturing process of the store (for example SLS or CNC) with its price list. Its ID is the `processPricesId`. |
| Requisition | One line of a quote or an order |
| Quote / order | One resource. `state` is `QUOTE` until the customer pays or accepts; then it is `ORDER`. |
| Thread | The conversation that belongs to an order or a project |

### Data formats

- Dates and times are ISO 8601 strings.
- Prices are decimal numbers in the given currency.
- Numeric IDs are JSON numbers. UUID IDs are strings.
- Enumerations are upper-case strings.
- Responses can contain fields that are not in this reference. Ignore them.
- In request bodies, send optional fields with the value `null` when you do not use them.

### Browser or server

The Customer API accepts cross-origin calls, so a browser can call it directly with a Bearer token. The Auth API does not. If you call the Customer API from the browser, your scripts hold the access token. If you call it from your server, you can keep the token in an `HttpOnly` cookie. The example storefront uses the server.

### Errors

The standard error body:

```json
{ "error": "CART_NOT_OPEN", "message": "Cart is not open" }
```

Use `error` (a stable code) and the HTTP status in your logic. Validation errors can add a `fields` object.

Exceptions that you must handle:

| Case | Response |
|---|---|
| Missing, invalid, or expired token | `401`, empty body |
| A guest token on a customer endpoint | `403`, empty body |
| `X-Store-Name` is missing or does not match the token | `401` or `403` |
| Some "not permitted" and "not found" cases | `400`, `404`, or `409` with an **empty body** |
| Cart item endpoints | `{ "error": "<text for a person>" }` with no `message` field |
| Unexpected error | `500` `{ "error": "INTERNAL_ERROR", … }` |

Always check the HTTP status first. Do not assume that a body is present.

Common error codes:

| Code | Status |
|---|---|
| `UNSUPPORTED_FILE_TYPE` | 400 |
| `ANALYSIS_NOT_FOUND`, `PART_REVISION_NOT_FOUND` | 404 |
| `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND` | 404 |
| `CART_NOT_OPEN`, `CART_ALREADY_CLAIMED`, `CART_NOT_CLAIMED` | 409 |
| `CART_FILE_TOO_LARGE` | 400 |
| `ADDRESS_NOT_FOUND`, `SHIPPING_METHOD_NOT_FOUND`, `SHIPPING_RATE_NOT_FOUND` | 404 |
| `INVALID_SHIPPING`, `SHIPPING_ERROR` | 400 |
| `ORDER_HAS_NO_ITEMS`, `ORDER_ERROR` | 400 |
| `ORDER_NOT_FOUND` | 404 |
| `ORDER_WRONG_STATE` | 409 |
| `REQUEST_VALIDATION_FAILED`, `REQUEST_BODY_UNREADABLE` | 400 |

### Lists

List endpoints return a full JSON array. Only `GET /project` uses pages.

## Store settings

### `GET /operator` — Public

Returns the settings of your store.

| Field | Type | Meaning and what to do |
|---|---|---|
| `name` | string | Your store name |
| `currency` | string | Default currency |
| `acceptedCurrencies` | string[] | Currencies that a customer can select. Send the selected one in price and order calls. |
| `country` | string | Country of the store (ISO alpha-2) |
| `loginStage` | `BEFORE_PRICE` \| `AFTER_PRICE` | `BEFORE_PRICE`: ask for sign-in before the visitor uploads parts or sees prices. `AFTER_PRICE`: guests can upload and see prices; sign-in is necessary to order. **Your storefront must apply this rule.** |
| `loginMethod` | `EMAIL` \| `PHONE` \| `ANY` | The sign-in identifier that the store prefers. New customers always sign up with an email address. |
| `paymentProvider` | string | `STRIPE`, `PAYPAL`, `PAYPAL_SINGLE_PARTY`, `RAZORPAY_SINGLE_PARTY`, `FLYWIRE`, or `NONE`. `NONE` means no online payment. |
| `isPayByInvoiceEnabled` | boolean | Offer "pay by invoice" |
| `isPayByPurchaseOrderEnabled` | boolean | Offer "pay by purchase order" |
| `maximumFileSize` | number \| null | Maximum size of an uploaded part file, in megabytes. **Check this in your storefront before the upload.** |
| `termsOfServiceLink` | string \| null | Show this link where the customer uploads files and signs in |
| `landingPageMessage` | string \| null | A message from the manufacturer for the first page |
| `videoLink` | string \| null | A help video |
| `storefrontTheme` | `SYSTEM` \| `LIGHT` \| `DARK` | The colour mode that the manufacturer prefers |
| `isTaxIDEnabled` | boolean | Show a tax ID field on addresses |
| `isInvoiceDownloadEnabled` | boolean | If `false`, the invoice PDF is not available (`403`) |
| `isCustomerLineItemDeletionEnabled` | boolean | Customers can remove lines from a quote |
| `isOrientationConstraintEnabled` | boolean | Offer "keep my part orientation" |

Limits that are not in this response reach you through the price calls:

| Store rule | Where you see it |
|---|---|
| Minimum order amount | `quote.topUp` (an added amount) |
| Maximum order amount | `purchasability.withinMaximumOrderValue` |
| Manual price review, quote-only materials | `purchasability.canBePurchased`, `isPriceReviewRequired`, `isMaterialPurchasable`, `isPostProcessingPurchasable` |
| Approval of new customers | `WAIT_FOR_APPROVAL` from the Auth API |

### `GET /operator/logo` — Public

Returns the logo image of the store as bytes. `400` if the store has no logo.

### `GET /operator/processes` — Public

Returns the configuration options: `Process[]`.

```ts
type Process = {
  id: string                    // UUID. This is the processPricesId.
  technology: string            // for example 'FDM', 'SLS', 'MJF', 'SLA', 'CNC', 'SHEET_METAL'
  description: string | null
  isDefault: boolean
  materials: Material[]
  infills: Infill[]
  precisions: Precision[]
  postProcessings: PostProcessing[]
  bulkPricingQuantities: number[]
}

type Material = {
  id: number
  name: string
  datasheetSummary: string | null
  isDefault: boolean
  quoteOnly: boolean            // true: no instant purchase with this material
  colors: Color[]
  wallThicknessWarning: number | null
  wallThicknessLimit: number | null
}

type Color = { id: number; name: string; code: string }
type Infill = { id: number; name: string; value: number; default: boolean }
type Precision = { id: number; name: string; price: number; isActive: boolean }

type PostProcessing = {
  id: number
  name: string
  isDefault: boolean
  purchasable: boolean                   // false: no instant purchase with this option
  colors: Color[]
  incompatibleMaterialIds: number[]      // do not offer with these materials
  mutuallyExclusiveGroup: string | null  // offer one option only from each group
}
```

If you send a customer token, the list can be specific to that customer's organisation.

### `GET /operator/lead-times` — Public

```ts
type LeadTime = { id: string; name: string; isDefault: boolean; isDeleted: boolean }
```

Do not offer lead times that have `isDeleted: true`.

### `GET /operator/shipping-methods` — Customer

```ts
type ShippingMethod =
  | { shippingMethodId: number; shippingMode: 'SELF_COLLECTION'; isDefault: boolean; name: string; enableContactInfoCollection: boolean }
  | { shippingMethodId: number; shippingMode: 'FIXED_PRICE'; isDefault: boolean; name: string; price: number | null }
  | { shippingMethodId: number; shippingMode: 'CARRIER_ACCOUNT'; isDefault: boolean; carrierAccountProvider: string }
  | { shippingMethodId: number; shippingMode: 'CUSTOMER_ACCOUNT'; isDefault: boolean; name: string; countries: string[] }
```

### `GET /countries` — Public

```ts
type Country = { country: string; name: string; alpha2Code: string; alpha3Code: string }
```

Use the `country` value in address calls.

### `GET /countries/{country}/jurisdictions` — Customer

States, provinces, or regions of a country. `{country}` is the `country` value from `GET /countries`.

```ts
type Jurisdiction = { country: string; name: string; iso: string }
```

## Parts

### `PUT /part-revision/upload` — Guest

Uploads one part file and starts the analysis.

| Item | Value |
|---|---|
| Body | `multipart/form-data`, one field `file` that contains the **gzip-compressed** file |
| Header `X-Filename` | Mandatory. The original file name, URL-encoded. |
| Response `200` | A JSON string: the analysis ID |
| Limit | 1024 MB for each request. Also apply the store setting `maximumFileSize`. |

### `GET /part-revision/upload/status?analysisIds={id},{id}` — Guest

Returns an object: analysis ID → status. Refer to [Wait for the analysis](purchase-flow.md#5-wait-for-the-analysis) for the status values.

### `GET /part-revision/upload/{analysisId}/results` — Guest

<a id="analysis-result"></a>Returns the analysis result as **MessagePack** (`application/msgpack`, with `Content-Encoding: gzip`). **You can read it one time only.** Only the uploader can read it.

```ts
type AnalysisResult = {
  partRevisionId: string        // the ID for all later calls
  fileName: string
  versionNumber: number
  createdAt: string
  originalCadFileType: string
  availableAccessories: string[]

  width: number
  height: number
  length: number
  volume: number
  area: number
  convexHullVolume: number
  minBoundingBoxVolume: number
  shrinkWrapVolume: number
  minimumWallThickness: number | null
  watertight: boolean           // false: the part cannot be purchased instantly
  repaired: boolean             // the mesh was repaired automatically
  baseRotation: number[][]

  thumbnail: Uint8Array | null  // image bytes
  stl: Uint8Array               // gzip-compressed STL mesh, for a 3D viewer
  wallThickness: Uint8Array | null
  bending?: object | null       // sheet metal data
  machining?: object | null     // machining data
}
```

Dimensions are in the units of the file. You tell the API the units (`units`) when you add the part to a cart or an order.

### `POST /part-revision/manufacturability/validate` — Guest

Checks if parts are in the limits of a process and a material.

Request: an array of

```ts
{ partRevisionId: string; units: MeasurementUnit; processPricesId: string; materialId: number }
```

Response: an array of

```ts
type PartManufacturability = {
  partRevisionId: string
  limits: { withinBoundingBoxLimit: boolean; withinWallThicknessLimit: boolean }
  warnings: { hasOptimalWallThickness: boolean }
  values: { boundingBox: [number, number, number] | null; wallThicknessLimit: number | null; wallThicknessWarning: number | null }
}

type MeasurementUnit = 'MILLIMETERS' | 'CENTIMETERS' | 'METRES' | 'INCHES' | 'FEET'
```

### Part data and files for carts and orders — Customer

| Call | Returns |
|---|---|
| `GET /carts/{cartId}/items/{itemId}/part-revision` | Part data (JSON) for a cart item |
| `GET /carts/{cartId}/items/{itemId}/part-revision/thumbnail` | PNG image |
| `GET /carts/{cartId}/items/{itemId}/part-revision/download/{type}` | A part file |
| `GET /requisition/{requisitionId}` | Part data (JSON) for an order line |
| `GET /requisition/{requisitionId}/thumbnail` | PNG image |
| `GET /requisition/{requisitionId}/download/{type}` | A part file |

`{type}` is `ORIGINAL_CAD_FILE`, `CORE_GEOMETRY`, `THUMBNAIL`, `PDF_DESIGN_FILE`, or `WALL_THICKNESS_ANALYSIS`.

## Prices

### `POST /pre-order` — Guest

Calculates the price for a set of lines. Stores no data.

```ts
type CreateOrder = {
  currency: string                                 // one of acceptedCurrencies
  requisitions: Record<string, CreateRequisition>  // key: a UUID that you select for each line
  shipping: CreateShipping | null
  shippingId: null
  billingAddressId: number | null
  discountId: number | null
  operatorNote: string | null                      // a note to the manufacturer
  affiliate: string | null
  cartId: string | null                            // POST /order only
  intent?: 'CHECKOUT'                              // POST /order only
}

type CreateRequisition = {
  sequence: number              // position of the line, from 0
  partRevisionId: string
  units: MeasurementUnit
  quantity: number
  processPricesId: string
  materialId: number
  infillId: number | null
  precisionId: number | null
  colorId: number | null
  leadTimeId: string | null
  postProcessingIds: number[]
  comments: { conversationType: 'REQUISITION_TAGGED'; message: string }[]
  constraints?: { constraintType: 'FIXED_ORIENTATION' }[]
  name: string | null
}

type CreateShipping =
  | { shippingMode: 'SELF_COLLECTION'; shippingMethodId: number; contactName?: string; contactPhoneNumber?: string }
  | { shippingMode: 'FIXED_PRICE'; shippingMethodId: number; rateId: string; toAddressId: number }
  | { shippingMode: 'CARRIER_ACCOUNT'; shippingMethodId: number; rateId: string; toAddressId: number }
  | { shippingMode: 'CUSTOMER_ACCOUNT'; shippingMethodId: number; toAddressId: number; accountNumber: string }
```

A guest cannot send `shipping` or `billingAddressId` (addresses need a customer).

Response:

```ts
type PreOrder = {
  quote: Quote
  purchasability: Purchasability
  constraints: Record<string, object[]>
}

type Quote = {
  currency: string
  price: number                 // total
  subtotal: number
  shipping: number
  discount: number
  topUp: number | null          // amount added to reach the minimum order amount
  tax: {
    totalPrice: number
    totalPercentage: number
    components: { shortName: string; longName: string; percentage: number; amount: number }[]
    isTaxAppliedToShipping: boolean
    isTaxExempted: boolean
    isTaxReverseCharged: boolean
  }
  lineItems: { name: string; price: number }[]
  requisitions: Record<string, RequisitionQuote | null>   // null: no instant price for this line
  expectedDispatchDate: string | null
}

type RequisitionQuote = {
  partRevisionId: string
  quantity: number
  price: number
  unitPrice: number
  manufacturingPrice: number
  postProcessingPrice: number
  postProcessingOptions: { id: number; price: number }[]
}

type Purchasability = {
  canBePurchased: boolean       // false: offer "request a quote", not payment
  isPriceReviewRequired: boolean
  withinMaximumOrderValue: boolean
  withinBoundingBoxLimit: boolean
  withinWallThicknessLimit: boolean
  isMaterialPurchasable: boolean
  isPostProcessingPurchasable: boolean
  parts: Record<string, PartManufacturability>
}
```

`400` with an empty body: the request has no lines.

### `POST /pre-order/bulk-quote?currency={currency}` — Guest

Returns prices at the bulk quantities of the process, for one part configuration.

Request: a `CreateRequisition` without `sequence`, `quantity`, `comments`, and `name`.

```ts
type BulkQuote = { quantity: number; price: number; unitPrice: number; savingsPerUnit: number }
```

### `POST /discount/validate` — Customer

Request: `{ "discountCode": "SPRING" }`. Response `200`: the discount (`discountId`, `code`, `percentage`, …). Response `204`: the code is not valid.

## Carts

The cart endpoints use two prefixes: `/cart` for the cart, and `/carts/{cartId}/items` for the items.

| Call | Access | Purpose |
|---|---|---|
| `POST /cart` | Guest | Create an empty cart. No body. |
| `GET /cart` | Customer | List the open carts |
| `GET /cart/{cartId}` | Customer | Get one cart with its items |
| `PATCH /cart/{cartId}` | Guest | Change cart-level data |
| `DELETE /cart/{cartId}` | Customer | Delete an open cart. `204`. |
| `PATCH /cart/{cartId}/claim` | Customer | Move a guest's parts and carts to the customer. `204`. |
| `POST /carts/{cartId}/items` | Guest | Add an item |
| `PUT /carts/{cartId}/items/{itemId}` | Guest | Replace the configuration of an item |
| `DELETE /carts/{cartId}/items/{itemId}` | Guest | Remove an item. `204`. |
| `POST /carts/{cartId}/items/{itemId}/files` | Customer | Attach a file (`multipart/form-data`, field `file`) |
| `GET` / `DELETE /carts/{cartId}/items/{itemId}/files/{fileId}` | Customer | Download or delete an attached file |

```ts
type Cart = {
  cartId: string
  status: 'OPEN' | 'DELETED' | 'CONVERTED'
  items: CartItem[]
  customerId: number | null     // null: a guest cart that is not claimed
  currency: string | null
  notes: string | null
  affiliate: string | null
  discountId: number | null
  billingAddressId: number | null
  toAddressId: number | null
  shippingMethodId: number | null
  rateId: string | null
  createdAt: string
  lastUpdated: string
}

type CartItem = {
  id: number                    // omit when you create an item
  partRevisionId: string
  name: string | null
  quantity: number
  units: MeasurementUnit | null
  processPricesId: string | null
  materialId: number | null
  colorId: number | null
  infillId: number | null
  precisionPricesId: number | null   // NOTE: "precisionId" in pre-order and order lines
  leadTimeId: string | null
  postProcessingIds: number[] | null
  useOriginalOrientation: boolean | null
  files: { id: number; fileName: string | null; contentType: string | null; size: number | null }[] | null
}
```

`PATCH /cart/{cartId}` accepts `currency`, `affiliate`, `notes`, `discountId`, `billingAddressId`, `shippingMethodId`, `toAddressId`, and `rateId`. A field that you omit does not change. A field with `null` is cleared. For a guest cart, the address and rate fields give `409` `CART_NOT_CLAIMED`.

`PATCH /cart/{cartId}/claim` takes `{ "anonymousSessionToken": "<guest token>" }`. Refer to [Sign in, then claim the guest cart](purchase-flow.md#guest-to-customer).

## Customer profile

| Call | Access | Purpose |
|---|---|---|
| `GET /customer` | Customer | The signed-in customer |
| `PATCH /customer` | Customer | Change `firstName`, `lastName`, `language`, `notificationPreference` |
| `GET /customer-organisation` | Customer | The customer's organisation, with its customers and addresses |
| `PATCH /customer-organisation` | Customer | Change `name` or `language` |

```ts
type Customer = {
  customerId: number
  email: string | null
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  organisationName: string | null
  language: string
  notificationPreference: 'EMAIL' | 'SMS' | 'WHATSAPP'
  customerType: 'PRO_FORMA' | 'ACCOUNT' | 'INTERNAL'
  discountPercentage: number | null
}
```

`customerType` controls the payment methods:

| Type | Meaning |
|---|---|
| `PRO_FORMA` | Pays before production (the default) |
| `ACCOUNT` | Can always pay by invoice or by purchase order |
| `INTERNAL` | An internal customer of the manufacturer. No online payment. |

## Addresses

| Call | Access | Purpose |
|---|---|---|
| `GET /address` | Customer | List the addresses of the organisation |
| `GET /address/{addressId}` | Customer | Get one address |
| `POST /address` | Customer | Create an address |
| `DELETE /address/{addressId}` | Customer | Delete an address. `204`. |

There is no call to change an address. Create a new one.

```ts
type Address = {
  addressId: number             // omit when you create an address
  name: string                  // name of the contact person
  company: string
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  country: string               // the "country" value from GET /countries
  jurisdictionIsoCode: string   // the "iso" value from GET /countries/{country}/jurisdictions
  phone: string
  email: string
  residential: boolean
  taxId: string | null
  isBillingAddress: boolean
  isShippingAddress: boolean
  countryAlpha2Code: string     // response only
  countryAlpha3Code: string     // response only
}
```

Send all fields when you create an address. Use an empty string for text fields that the customer leaves empty.

## Shipping

### `POST /shipping/rate` — Customer

```ts
// Request
{
  currency: string
  toAddressId: number
  parts: { partRevisionId: string; units: MeasurementUnit; quantity: number; processPricesId: string; materialId: number }[]
}

// Response
type ShippingRates = {
  shippingMethodId: number | null
  tooLargeForBoxes: boolean     // the parts do not fit the boxes of the manufacturer
  errorWithCarrier: boolean     // the carrier gave no rate
  rates: { id: string; rate: number; currency: string; serviceType: string; serviceName: string; shippingMethodId: number }[]
}[]
```

A rate `id` is the `rateId` of the `shipping` object. A rate belongs to the customer's organisation.

## Orders

| Call | Access | Purpose |
|---|---|---|
| `POST /order` | Customer | Create a quote / order. Body: `CreateOrder`. |
| `GET /order` | Customer | All quotes and orders of the organisation, newest first |
| `GET /order/{orderId}` | Customer | One order |
| `GET /order/{orderId}/quote` | Customer | Price breakdown (`Quote`). The keys of `requisitions` are requisition IDs. |
| `GET /order/{orderId}/purchasability` | Customer | Can the order be paid now (`Purchasability`) |
| `GET /requisition?orderId={orderId}` | Customer | The lines of an order |
| `PATCH /order/{orderId}/shipping` | Customer | Set or replace the shipping. Body: `CreateShipping`. |
| `PATCH /order/{orderId}/discount/{discountId}/apply` | Customer | Apply a discount. `204`. |
| `PATCH /order/{orderId}/discount/remove` | Customer | Remove the discount. `204`. |
| `PATCH /order/{orderId}/requisitions/remove` | Customer | Remove lines. Body: `{ "requisitionIds": [1, 2] }`. |

```ts
type Order = {
  id: number
  state: 'QUOTE' | 'ORDER'
  quoteNumber: string | null
  orderNumber: string | null    // set when the quote becomes an order
  price: number | null
  currency: string
  paymentStatus: 'UNPAID' | 'PROCESSING' | 'PAID' | 'REFUNDED' | 'EXTERNALLY_TRACKED'
  isReviewRequired: boolean
  isVoided: boolean
  isArchived: boolean
  operatorNote: string | null
  purchaseOrderNumber: string | null
  requisitionIds: number[]
  threadId: number              // for messages and files
  shipping: Shipping | null
  shipments: Shipment[]
  billingAddress: Address | null
  discount: { discountId: number; code: string | null; percentage: number } | null
  tax: object | null
  kanbanColumn: { id: string; name: string; color: string | null } | null   // production stage
  createdAt: string
  lastUpdated: string
}

type Requisition = {
  id: number
  orderId: number
  sequence: number
  name: string
  partRevisionId: string
  units: MeasurementUnit
  quantity: number
  processPricesId: string
  materialId: number
  colorId: number | null
  infillId: number | null
  precisionId: number | null
  leadTimeId: string | null
  postProcessingIds: number[]
  pricePaid: number | null
  watertight: boolean
}

type Shipment = {
  id: string
  type: 'COURIER' | 'COLLECTION'
  fulfilledAt: string
  destination: object
  parcels: object[]
  tracking?: { provider: string; providerService: string; trackingNumber: string; trackingUrl: string | null } | null
}
```

`Shipping` in a response is the `CreateShipping` object plus read-only fields such as `rate`, `name`, `toAddress`, and `expectedDispatchDate`.

`POST /order` response:

```ts
{ order: Order; requisitionMapping: Record<string, Requisition> }   // key: your line key
```

## Payment

### Online payment

`POST /order/{orderId}/payment` — Customer. No body.

```ts
type Payment = {
  id: string
  provider: string              // the paymentProvider of the store
  finalPrice: number
  tax: number
  currency: string
  clientSecret?: string | null
  paymentPrincipal?: string | null
  merchantAccount?: string | null
  flywireGatewayUrl?: string | null
  stripePaymentIntentStatus?: string | null
}
```

| Provider | `id` | `clientSecret` | `paymentPrincipal` | `merchantAccount` |
|---|---|---|---|---|
| `STRIPE` | Payment intent ID | Payment intent client secret | - | Connected account ID of the store |
| `PAYPAL` | PayPal order ID | - | PayPal order ID | Merchant ID of the store |
| `RAZORPAY_SINGLE_PARTY` | Razorpay order ID | - | Razorpay order ID | Razorpay key ID |
| `FLYWIRE` | - | - | - | - (open `flywireGatewayUrl`) |

Errors: `404` `ORDER_NOT_FOUND`; `400` `INTERNAL_ORDER_NOT_PAYABLE`; `400` `ORDER_ERROR` (also when the order cannot be paid).

After the customer completes the payment with the provider, poll `GET /order/{orderId}` until `paymentStatus` changes.

> To complete a Stripe or PayPal payment in your storefront, you need the Phasio platform key for the provider SDK. Contact Phasio support to get it.

### `PATCH /order/{orderId}/payment/invoice` — Customer

No body. Returns the `Order`. `400` with an empty body if the method is not permitted.

### `PATCH /order/{orderId}/payment/purchase-order` — Customer

`multipart/form-data` with optional fields `purchaseOrderNumber`, `message`, and `file`. Returns the `Order`. `400` with an empty body if the method is not permitted.

## Documents

| Call | Access | Returns |
|---|---|---|
| `GET /document/order/{orderId}/estimate` | Customer | Quote PDF |
| `GET /document/order/{orderId}/confirmation` | Customer | Order confirmation PDF |
| `GET /document/order/{orderId}/invoice` | Customer | Invoice PDF. `403` if `isInvoiceDownloadEnabled` is `false`. `404` if there is no invoice. |

## Messages and files

Each order has a thread (`Order.threadId`).

| Call | Access | Purpose |
|---|---|---|
| `GET /activity/thread/{threadId}` | Customer | Messages and events of the thread, oldest first |
| `POST /activity` | Customer | Send a message |
| `GET /thread-file/thread/{threadId}` | Customer | List the files of the thread |
| `PUT /thread-file/thread/{threadId}?name={name}` | Customer | Upload a file (`multipart/form-data`, field `file`) |
| `GET /thread-file/thread/{threadId}/{fileId}` | Customer | Download a file |

Send a message:

```json
{ "activityType": "CONVERSATION", "conversationType": "GENERIC", "threadId": 880, "message": "When will you ship?" }
```

## Projects

A project groups orders and files for a customer.

| Call | Access | Purpose |
|---|---|---|
| `GET /project?page=0&size=20&sort=createdAt,desc&status=ACTIVE` | Customer | List projects (in pages) |
| `GET /project/{projectId}` | Customer | Get a project |
| `POST /project` | Customer | Create a project: `{ "name": "…", "description": "…", "status": "ACTIVE" }` |
| `GET /order/project/{projectId}` | Customer | Orders of a project |

Page response:

```ts
type Page<T> = { content: T[]; totalElements: number; totalPages: number; pageNumber: number; pageSize: number; isEmpty: boolean; isFirst: boolean; isLast: boolean }
```

## Catalog

A catalog contains parts with agreed prices for one customer organisation.

| Call | Access | Purpose |
|---|---|---|
| `GET /catalog` | Customer | The catalog of the organisation: `{ parts: CatalogItem[] }` |
| `GET /catalog/{catalogItemId}/part-revision` | Customer | Part data |
| `GET /catalog/{catalogItemId}/thumbnail` | Customer | PNG image |
