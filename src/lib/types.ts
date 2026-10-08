/** Types for the Customer API. Only the fields that this example uses are listed. */

export type MeasurementUnit = 'MILLIMETERS' | 'CENTIMETERS' | 'METRES' | 'INCHES' | 'FEET'

export type Store = {
  name: string
  currency: string
  acceptedCurrencies: string[]
  country: string
  loginStage: 'BEFORE_PRICE' | 'AFTER_PRICE'
  loginMethod: 'EMAIL' | 'PHONE' | 'ANY'
  paymentProvider: string
  isPayByInvoiceEnabled: boolean
  isPayByPurchaseOrderEnabled: boolean
  isInvoiceDownloadEnabled: boolean
  isTaxIDEnabled: boolean
  maximumFileSize: number | null
  termsOfServiceLink: string | null
  landingPageMessage: string | null
}

export type Color = { id: number; name: string; code: string }
export type Material = { id: number; name: string; isDefault: boolean; quoteOnly: boolean; colors: Color[] }
export type Infill = { id: number; name: string; value: number; default: boolean }
export type Precision = { id: number; name: string; price: number; isActive: boolean }
export type PostProcessing = { id: number; name: string; isDefault: boolean; purchasable: boolean; incompatibleMaterialIds: number[] }

export type Process = {
  id: string
  technology: string
  description: string | null
  isDefault: boolean
  materials: Material[]
  infills: Infill[]
  precisions: Precision[]
  postProcessings: PostProcessing[]
}

export type LeadTime = { id: string; name: string; isDefault: boolean; isDeleted: boolean }

export type AnalysisStatus =
  | 'SENT_FOR_ANALYSIS'
  | 'ANALYSIS_STARTED'
  | 'REPAIR_STARTED'
  | 'REPAIR_COMPLETED'
  | 'ANALYSIS_COMPLETED'
  | 'RESULT_READY'
  | 'ANALYSIS_FAILED'
  | 'DESIGN_DOES_NOT_EXIST'

export type AnalysisResult = {
  partRevisionId: string
  fileName: string
  width: number
  height: number
  length: number
  volume: number
  watertight: boolean
}

export type CartItem = {
  id?: number
  partRevisionId: string
  name: string | null
  quantity: number
  units: MeasurementUnit
  processPricesId: string
  materialId: number
  colorId: number | null
  infillId: number | null
  /** This field is `precisionId` in pre-order and order lines. */
  precisionPricesId: number | null
  leadTimeId: string | null
  postProcessingIds: number[]
}

export type Cart = { cartId: string; status: 'OPEN' | 'DELETED' | 'CONVERTED'; items: CartItem[] }

export type CreateShipping =
  | { shippingMode: 'SELF_COLLECTION'; shippingMethodId: number }
  | { shippingMode: 'FIXED_PRICE' | 'CARRIER_ACCOUNT'; shippingMethodId: number; rateId: string; toAddressId: number }

export type CreateRequisition = {
  sequence: number
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
  comments: never[]
  name: string | null
}

export type CreateOrder = {
  currency: string
  requisitions: Record<string, CreateRequisition>
  shipping: CreateShipping | null
  shippingId: null
  billingAddressId: number | null
  discountId: null
  operatorNote: string | null
  affiliate: null
  cartId: string | null
  intent?: 'CHECKOUT'
}

export type Quote = {
  currency: string
  price: number
  subtotal: number
  shipping: number
  discount: number
  topUp: number | null
  tax: { totalPrice: number }
  requisitions: Record<string, { price: number; unitPrice: number; quantity: number } | null>
  expectedDispatchDate: string | null
}

export type Purchasability = {
  canBePurchased: boolean
  isPriceReviewRequired: boolean
  withinMaximumOrderValue: boolean
}

export type PreOrder = { quote: Quote; purchasability: Purchasability }

export type Address = {
  addressId: number
  name: string
  company: string
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  country: string
  isDeleted?: boolean
}

export type NewAddress = Omit<Address, 'addressId' | 'isDeleted'> & {
  jurisdictionIsoCode: string
  phone: string
  email: string
  residential: boolean
  taxId: string | null
  isBillingAddress: boolean
  isShippingAddress: boolean
}

export type Country = { country: string; name: string; alpha2Code: string }
export type Jurisdiction = { country: string; name: string; iso: string }

export type ShippingMethod = {
  shippingMethodId: number
  shippingMode: 'SELF_COLLECTION' | 'FIXED_PRICE' | 'CARRIER_ACCOUNT' | 'CUSTOMER_ACCOUNT'
  name?: string
  isDefault?: boolean
}

export type ShippingRate = { id: string; rate: number; currency: string; serviceName: string; shippingMethodId: number }
export type ShippingRates = { shippingMethodId: number | null; tooLargeForBoxes: boolean; errorWithCarrier: boolean; rates: ShippingRate[] }

export type Order = {
  id: number
  state: 'QUOTE' | 'ORDER'
  quoteNumber: string | null
  orderNumber: string | null
  price: number | null
  currency: string
  paymentStatus: 'UNPAID' | 'PROCESSING' | 'PAID' | 'REFUNDED' | 'EXTERNALLY_TRACKED'
  isReviewRequired: boolean
  isVoided: boolean
  purchaseOrderNumber: string | null
  kanbanColumn: { name: string } | null
  shipping: { expectedDispatchDate: string | null } | null
  shipments: { id: string; tracking?: { provider: string; trackingNumber: string; trackingUrl: string | null } | null }[]
  createdAt: string
}

export type Requisition = { id: number; name: string; quantity: number; pricePaid: number | null }

export type CustomerProfile = { customerId: number; customerType: 'PRO_FORMA' | 'ACCOUNT' | 'INTERNAL' }

export type Payment = { id: string; provider: string; finalPrice: number; currency: string }
