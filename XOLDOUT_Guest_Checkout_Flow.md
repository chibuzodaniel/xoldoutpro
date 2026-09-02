# XOLDOUT — Guest Checkout & Post-Purchase Account Conversion

## Task

Implement a complete guest purchase flow for XOLDOUT.

### Core requirement

> Do not force a customer to create an account or log in before purchasing a product.

A customer must be able to click an artist's direct purchase link, complete payment as a guest, immediately access the purchased product, and optionally create or log into a XOLDOUT account afterward.

This must work without breaking the existing authentication, marketplace, creator, orders, payments, purchase library, listening, downloading, or UI systems.

Before making changes, inspect the existing codebase and reuse existing models, services, components, payment logic, authentication utilities, API patterns, and database structures wherever possible.

Do not duplicate existing functionality unnecessarily.

---

# 1. Core User Experience

The complete flow should be:

```text
Artist shares product link
        ↓
Fan clicks link
        ↓
Direct checkout
        ↓
No login required
        ↓
Customer enters basic information
        ↓
Customer pays
        ↓
Backend verifies payment
        ↓
Purchase is created
        ↓
Customer gets immediate access
        ↓
Purchase success page
        ↓
Listen / Download
        ↓
Encourage account creation
        ↓
Customer can:
    - Create account
    - Log in
    - Continue as guest
        ↓
If account is created/logged in:
Attach guest purchase to user account
        ↓
Purchase appears in user's library
```

The core principle is:

```text
DISCOVER → BUY → RECEIVE VALUE → CREATE ACCOUNT
```

Not:

```text
DISCOVER → CREATE ACCOUNT → VERIFY → LOGIN → BUY
```

---

# 2. Direct Purchase URL

Artists should be able to share a direct purchase URL.

Example:

```text
https://xoldout.app/buy/xyz
```

The route should identify the product and display the checkout experience.

Expected route:

```text
/buy/[productId]
```

If an equivalent route already exists, reuse it rather than creating a duplicate.

---

# 3. Direct Checkout Page

When a guest opens the purchase link, display a clean, simple checkout page.

Example:

```text
--------------------------------------------

Buy [SONG NAME]

[Song Artwork]

by [ARTIST NAME]

₦500

Customer Information

Full Name
[________________________]

Email Address
[________________________]

Phone Number (optional)
[________________________]

Payment Method

[ Available Payment Methods ]

--------------------------------------------

Total                     ₦500

[ PAY ₦500 ]

--------------------------------------------
```

The checkout must NOT require:

- Account creation
- Login
- Username
- Password
- Profile completion

The customer email should be collected because it can be used for:

- Purchase confirmation
- Delivery/access information
- Guest purchase recovery
- Claiming the purchase after account creation

---

# 4. Logged-In Users

The system must continue supporting logged-in users.

If a user is authenticated:

```text
userId = authenticatedUser.id
```

The purchase should automatically belong to that user.

Do not force logged-in users through unnecessary guest logic.

---

# 5. Guest Users

If the customer is not authenticated:

```text
userId = null
```

The purchase must still be completely valid.

Example:

```json
{
  "userId": null,
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "08000000000"
}
```

Do not create fake users/accounts simply because someone makes a purchase.

---

# 6. Create Pending Order

When the customer begins payment, create a pending order before redirecting/opening the payment gateway.

Recommended structure:

```text
Order
├── id
├── userId
├── customerName
├── customerEmail
├── customerPhone
├── totalAmount
├── currency
├── paymentProvider
├── paymentReference
├── status
├── paymentStatus
├── createdAt
├── updatedAt
└── paidAt
```

Initial state:

```text
status = PENDING
paymentStatus = PENDING
```

Generate a unique internal order ID and unique payment reference.

Do not trust order amounts sent from the frontend.

The backend must retrieve the actual product price from the database.

---

# 7. Order Items

Create an order item associated with the order.

Recommended structure:

```text
OrderItem
├── id
├── orderId
├── productId
├── creatorId
├── productName
├── quantity
├── unitPrice
└── totalPrice
```

For a single digital product:

```text
quantity = 1
```

The backend must determine:

```text
unitPrice = product.price
```

Never trust:

```text
price = request.body.price
```

from the client.

---

# 8. Payment Initialization

The frontend should call the XOLDOUT backend to initialize payment.

Use the existing payment API if available.

Example:

```text
POST /api/orders
```

The backend should:

1. Validate the product.
2. Confirm the product is available for purchase.
3. Retrieve the actual price.
4. Create the pending order.
5. Generate the payment reference.
6. Initialize the payment provider.
7. Return the required checkout information.

Never expose payment provider secret keys to the frontend.

---

# 9. Payment Verification

Payment confirmation must happen server-side.

Do NOT rely solely on a frontend payment response such as:

```text
payment successful
```

The backend must verify the transaction with the payment provider and/or process the provider webhook.

At minimum verify:

- Payment reference
- Transaction status
- Amount
- Currency
- Merchant/account
- Associated order

The expected amount must match the order amount.

Example:

```text
Expected: ₦500
Received: ₦500
→ Valid
```

If:

```text
Expected: ₦500
Received: ₦100
```

the order must NOT be marked as paid.

---

# 10. Webhook / Callback

Use the existing payment webhook infrastructure if available.

Webhook processing must be idempotent.

If the same payment webhook is received multiple times:

```text
Webhook #1 → Process
Webhook #2 → Detect duplicate
Webhook #3 → Detect duplicate
```

Do not create multiple purchases for the same transaction.

Use the payment reference and existing order/payment identifiers for uniqueness and idempotency.

---

# 11. Successful Payment

After successful server-side verification:

```text
paymentStatus = PAID
status = COMPLETED
paidAt = current timestamp
```

Then create the purchase/access record.

Do not grant digital access before payment is verified.

---

# 12. Purchase Record

Create a purchase record.

Recommended structure:

```text
Purchase
├── id
├── orderId
├── productId
├── creatorId
├── userId
├── customerName
├── customerEmail
├── customerPhone
├── amount
├── currency
├── paymentReference
├── accessStatus
├── deliveryToken
├── purchasedAt
├── createdAt
└── updatedAt
```

For guest purchases:

```text
userId = null
```

For authenticated purchases:

```text
userId = authenticated user ID
```

---

# 13. Purchase Status

Recommended access statuses:

```text
ACTIVE
REVOKED
REFUNDED
```

After successful payment:

```text
accessStatus = ACTIVE
```

If access must be removed following a refund:

```text
accessStatus = REVOKED
```

Follow any existing XOLDOUT refund rules.

---

# 14. Secure Delivery Token

For guest purchases, generate a secure, unpredictable delivery/access token.

Use a cryptographically secure random value.

Do NOT use:

```text
productId
orderId
email
timestamp
```

as the access token.

Example access URL:

```text
https://xoldout.app/purchase/access/[secure-token]
```

The token must:

- Be unique
- Be unpredictable
- Be associated with one purchase
- Not expose sensitive information
- Be revocable where appropriate
- Be protected against unauthorized access

---

# 15. Guest Access

After payment is verified, the customer should immediately receive access.

For digital music:

```text
[ Listen Now ]

[ Download ]
```

The customer must NOT be forced to create an account before accessing what they paid for.

The backend should verify:

```text
purchase.accessStatus = ACTIVE
```

before allowing access.

---

# 16. Purchase Success Page

After successful payment, display:

```text
# 🎉 Purchase Successful

Your music is ready.

[ Listen Now ]

[ Download ]
```

Below the listen/download actions, display the account conversion section.

---

# 17. Account Conversion Section

Display:

```text
## Want more from XOLDOUT?

Create a free account to get more from your purchase.
```

Benefits:

- Save your purchases
- Access your purchase library
- Follow your favourite artists
- Join communities
- Get notifications
- Buy merch
- Buy tickets
- Manage your XOLDOUT activity

Buttons:

```text
[ Create Account ]

[ Log In ]
```

Secondary option:

```text
Continue without an account
```

Account creation should be strongly encouraged but should not block access to the completed purchase.

---

# 18. Recommended Account Prompt

Use copy similar to:

```text
Create your XOLDOUT account

Your purchase is already secured.
Create an account to save it to your personal library
and access it anytime.

[ Create Account ]

[ Log In ]

Continue without an account
```

---

# 19. Guest Purchase Access Without Account

If the customer selects:

```text
Continue without an account
```

they should still have access to their purchase.

Access may be provided through:

- Secure purchase token
- Secure purchase URL
- Email delivery link
- Purchase access page

Example:

```text
https://xoldout.app/purchase/access/[secure-token]
```

Do not expose permanent public storage URLs when doing so would allow unauthorized access.

---

# 20. Purchase Confirmation Email

After successful payment, send a confirmation email.

Include:

```text
XOLDOUT

Purchase Confirmed 🎉

You purchased:

[Song Name]

Artist:
[Artist Name]

Amount:
₦500

Payment Reference:
[REFERENCE]

[ Listen Now ]

[ Download ]

Want to keep your purchases in one place?

[ Create XOLDOUT Account ]
```

Do not expose payment secrets or unnecessary sensitive information.

---

# 21. Account Creation After Purchase

If the customer clicks:

```text
Create Account
```

preserve the purchase context securely.

Use a secure purchase token or temporary reference where necessary.

Do not expose sensitive payment information.

Flow:

```text
Guest Purchase
      ↓
Create XOLDOUT Account
      ↓
Verify Email
      ↓
Identify Existing Purchase
      ↓
Attach Purchase to userId
      ↓
Add Purchase to Library
```

The customer must NOT have to purchase the product again.

---

# 22. Claim Guest Purchase

After account creation:

1. Verify the customer's account email.
2. Identify eligible guest purchases.
3. Confirm ownership securely.
4. Attach the purchase to the new `userId`.
5. Make the purchase visible in the user's library.

Primary matching mechanism:

```text
verified account email
        =
guest purchase customerEmail
```

If a secure purchase token is used, it can also be used to explicitly claim the purchase.

---

# 23. Purchase Claim Security

Do not allow arbitrary purchase lookup by email.

Do NOT implement an unrestricted endpoint like:

```text
GET /api/purchases?email=john@example.com
```

Purchase claiming must require secure proof of ownership.

Use:

- Verified account email and/or
- Secure purchase token

Do not expose another user's purchases.

---

# 24. Existing User Login

If the customer selects:

```text
Log In
```

allow normal XOLDOUT authentication.

After authentication:

```text
Login
  ↓
Verify purchase ownership
  ↓
Attach eligible guest purchase
  ↓
Purchase added to Library
```

Do not charge the customer again.

---

# 25. Continue Without Account

If the customer selects:

```text
Continue without an account
```

keep them as a guest.

They should still be able to:

- Listen
- Download
- Access their purchase
- Receive purchase information by email

---

# 26. Purchase Library

When a guest purchase is attached to an account, it should appear in:

```text
XOLDOUT → Library → Purchases
```

Example:

```text
My Library

--------------------------------

[Artwork]

Song Name
Artist Name

Purchased:
September 2, 2026

[ Listen ]

[ Download ]

--------------------------------
```

The customer must not have to purchase it again.

---

# 27. Multiple Guest Purchases

A customer may make several guest purchases before creating an account.

Example:

```text
Guest Purchase #1
Guest Purchase #2
Guest Purchase #3
Guest Purchase #4
```

After account creation:

```text
Create Account
      ↓
Verify Account
      ↓
Claim Eligible Purchases
      ↓
All Eligible Purchases → User Library
```

Do not create duplicate purchases.

---

# 28. Logged-In Purchase Flow

For an authenticated customer:

```text
Logged-in User
      ↓
Checkout
      ↓
Payment
      ↓
Payment Verified
      ↓
Purchase Created
      ↓
Purchase → userId
      ↓
Library
```

---

# 29. Failed Payment

If payment fails, display:

```text
# Payment Failed

Your payment could not be completed.

Your order has not been confirmed.

[ Try Again ]

[ Return to Product ]
```

Do not:

- Create an active purchase
- Grant access
- Mark the order as paid

The order should remain in an appropriate failed/pending state.

---

# 30. Abandoned Payment

If the customer starts payment but does not complete it:

```text
paymentStatus = PENDING
```

Do not create an active purchase.

Do not grant access.

Allow the customer to retry if supported by the existing payment architecture.

---

# 31. Refunds

If a completed purchase is refunded:

```text
Order.status = REFUNDED
```

Where appropriate:

```text
Purchase.accessStatus = REVOKED
```

Use the existing XOLDOUT refund policy if one exists.

---

# 32. Duplicate Payment Protection

Prevent duplicate purchases caused by:

- Double-clicking the Pay button
- Multiple payment callbacks
- Duplicate webhooks
- Browser refreshes
- Payment provider retries
- Network retries

A single successful payment should create exactly one completed purchase.

Use payment reference/order identifiers and database constraints where appropriate.

---

# 33. Product Validation

Before creating an order, verify:

- Product exists
- Product is active
- Product is purchasable
- Product has a valid price
- Creator exists
- Digital content exists where required

Do not trust product information sent by the frontend.

---

# 34. Price Validation

The backend must calculate the final amount.

Example:

```text
Frontend:
price = ₦500

Backend:
Database price = ₦500

→ Charge ₦500
```

If the frontend sends:

```text
price = ₦1
```

but the database says:

```text
price = ₦500
```

the backend must still charge:

```text
₦500
```

---

# 35. Creator Revenue

Guest purchases must continue using the existing XOLDOUT creator revenue and payout system.

Example:

```text
Customer pays ₦500
        ↓
Transaction recorded
        ↓
Calculate XOLDOUT platform share
        ↓
Calculate creator share
        ↓
Record creator earnings
        ↓
Existing payout process
```

Do not bypass or replace the existing creator payout logic.

---

# 36. Database Requirements

Use the existing database architecture.

Before creating new tables, collections, or models:

1. Inspect the existing schema.
2. Identify the existing User model.
3. Identify the existing Product model.
4. Identify the existing Order model.
5. Identify the existing Payment model.
6. Identify the existing Purchase/Library model.
7. Identify existing creator/artist relationships.
8. Extend existing models where appropriate.

Only create new models when there is no suitable existing model.

---

# 37. Recommended Order Structure

If compatible with the existing architecture:

```text
Order
├── id
├── userId nullable
├── customerName
├── customerEmail
├── customerPhone nullable
├── totalAmount
├── currency
├── paymentProvider
├── paymentReference
├── paymentStatus
├── status
├── createdAt
├── updatedAt
└── paidAt nullable
```

---

# 38. Recommended Purchase Structure

If compatible with the existing architecture:

```text
Purchase
├── id
├── orderId
├── productId
├── creatorId
├── userId nullable
├── customerEmail
├── customerName
├── amount
├── currency
├── paymentReference
├── accessStatus
├── deliveryToken
├── purchasedAt
├── createdAt
└── updatedAt
```

Do not duplicate data unnecessarily if existing Order/OrderItem relationships already provide it.

---

# 39. Payment Statuses

Recommended:

```text
PENDING
PAID
FAILED
CANCELLED
REFUNDED
```

Only verified successful payments should result in:

```text
paymentStatus = PAID
```

---

# 40. API Design

Reuse existing API conventions.

Only create new endpoints if equivalent functionality does not already exist.

Possible endpoints:

```text
POST /api/orders
```

Create pending order and initialize payment.

```text
POST /api/payments/verify
```

Verify payment if required by the existing payment architecture.

```text
POST /api/webhooks/[provider]
```

Process payment provider webhook.

```text
GET /api/purchases/access/[token]
```

Secure guest purchase access.

```text
POST /api/purchases/claim
```

Claim a guest purchase after authentication.

Do not create duplicate APIs when existing equivalents are available.

---

# 41. Frontend Routes

Expected:

```text
/buy/[productId]
```

Guest checkout.

```text
/purchase/success
```

Successful purchase.

```text
/purchase/access/[token]
```

Guest purchase access if required.

Use the existing routing architecture if different.

---

# 42. Authentication Rules

Authentication is optional for checkout.

Before payment:

```text
Auth required = NO
```

After successful payment:

```text
Auth required = NO
```

For account-specific features:

```text
Auth required = YES
```

Examples:

```text
Save purchase → YES
Follow artist → YES
Join community → YES
Notifications → YES
Purchase library → YES
Manage profile → YES
```

---

# 43. UI/UX Requirements

The checkout must be:

- Fast
- Minimal
- Mobile-friendly
- Responsive
- Clear
- Trustworthy
- Consistent with the existing XOLDOUT branding

Do not make the checkout look like an account registration page.

The primary CTA should clearly show the actual amount:

```text
[ Pay ₦500 ]
```

The amount must be dynamic.

---

# 44. Loading States

During payment initialization:

```text
[ Processing Payment... ]
```

Disable the Pay button while processing.

Prevent multiple submissions.

---

# 45. Error Handling

Handle:

- Invalid product
- Product unavailable
- Invalid amount
- Payment initialization failure
- Payment cancellation
- Payment failure
- Payment verification failure
- Webhook failure
- Duplicate payment
- Network error
- Expired guest access
- Invalid access token
- Already claimed purchase
- Unauthorized purchase access

Use clear user-facing messages.

Do not expose:

- Stack traces
- Database errors
- API secrets
- Payment provider credentials
- Internal implementation details

---

# 46. Security Requirements

Implement:

### Server-side payment verification

Never trust frontend payment success.

### Secure tokens

Use cryptographically secure random tokens.

### Authorization

Users must only access purchases they own.

### Guest access

Guest access must require a secure purchase token.

### Rate limiting

Protect sensitive endpoints such as:

- Payment initialization
- Payment verification
- Purchase access
- Purchase claiming

### Idempotency

Prevent duplicate orders and purchases.

### Input validation

Validate:

- Name
- Email
- Phone
- Product ID
- Order ID
- Payment reference
- Purchase token

### Secrets

Never expose:

- Payment secret keys
- Webhook secrets
- Database credentials
- Private API keys

to the frontend.

---

# 47. Download Protection

If the product is a downloadable digital file:

Do not expose a permanent public storage URL if that would allow unauthorized access.

Prefer:

```text
Registered user
    ↓
Backend authorization
    ↓
Temporary/signed download URL
```

For guests:

```text
Secure token
    ↓
Backend validates purchase
    ↓
Temporary/signed download URL
```

If XOLDOUT already uses a storage provider such as Cloudflare R2, use the existing secure/signed URL mechanism where appropriate.

---

# 48. Listen Protection

If listening is restricted to purchasers:

The backend must verify:

```text
purchase exists
AND
accessStatus = ACTIVE
```

before granting access.

---

# 49. Email and Account Claiming

The email entered during checkout should be the primary recovery/claiming mechanism.

Example:

```text
Guest Purchase:
john@example.com

Account Created:
john@example.com

→ Eligible purchase found
→ Attach purchase.userId
```

Require email verification before attaching purchases where security requires it.

---

# 50. Different Email During Account Creation

If the customer creates an account using a different email from the purchase:

Do NOT automatically attach the purchase based only on account creation.

Instead, require a secure purchase claim mechanism using the purchase/access token.

---

# 51. Payment Success but Browser Closes

If payment succeeds but the frontend does not receive the success response:

The webhook/backend verification must still complete the order.

Expected:

```text
Payment webhook
    ↓
Verify payment
    ↓
Order = PAID
    ↓
Purchase created
    ↓
Email sent
```

The purchase must not depend on the customer staying on the browser.

---

# 52. Duplicate Webhooks

If the payment provider sends the same webhook multiple times:

```text
Webhook A
→ Process

Webhook B
→ Detect existing payment reference
→ Do not create another purchase
```

Return an appropriate success response to the payment provider after safely handling the duplicate.

---

# 53. Success Page Security

Do not trust a URL such as:

```text
/success?paid=true
```

as proof of payment.

Instead, the success page should use a secure order identifier and retrieve verified order status from the backend.

Example:

```text
/success?orderId=XXXX
```

Backend verifies:

```text
order.paymentStatus === PAID
```

Only then show:

```text
Purchase Successful
Listen
Download
```

---

# 54. Analytics

If XOLDOUT already has analytics, track:

```text
guest_checkout_started
payment_initialized
payment_successful
payment_failed
purchase_completed
guest_accessed_purchase
account_signup_after_purchase
guest_purchase_claimed
```

Use these metrics to measure:

```text
Guest checkout conversion
→ Account conversion
→ Repeat purchases
```

Do not add unnecessary personal data collection.

---

# 55. Conversion Metrics

Track:

```text
Total guest checkouts
Total successful guest purchases
Guest → account conversion rate
Guest repeat purchase rate
Account → purchase rate
```

The purpose is to determine whether removing the login barrier improves purchase conversion.

---

# 56. Mobile Experience

The entire flow must work properly on mobile.

Artist purchase links may be opened from:

- Instagram
- TikTok
- WhatsApp
- X
- Facebook
- Telegram
- SMS
- Mobile browsers

The checkout must therefore be optimized for small screens.

The payment CTA should remain visible and obvious.

---

# 57. Complete Customer Journey

The intended customer journey:

```text
ARTIST
  ↓
Shares XOLDOUT Purchase Link
  ↓
FAN CLICKS LINK
  ↓
Direct Checkout
  ↓
Enter Name + Email
  ↓
Select Payment Method
  ↓
Pay
  ↓
Payment Gateway
  ↓
Backend Verifies Payment
  ↓
Order Marked PAID
  ↓
Purchase Created
  ↓
Access Granted
  ↓
🎉 Purchase Successful
  ↓
Listen / Download
  ↓
--------------------------------
Want more from XOLDOUT?
  ↓
Create Account
OR
Log In
OR
Continue Without Account
  ↓
IF ACCOUNT CREATED
  ↓
Attach Guest Purchase
  ↓
Purchase Appears in Library
```

---

# 58. Final UX Example

Artist shares:

```text
🎵 Buy My Song — ₦500

https://xoldout.app/buy/xyz
```

Fan opens it:

```text
Buy My Song

₦500

Full Name
[________________]

Email Address
[________________]

Payment Method
[________________]

[ Pay ₦500 ]
```

Payment succeeds:

```text
🎉 Purchase Successful

Your music is ready.

[ Listen Now ]

[ Download ]

--------------------------------

Want more from XOLDOUT?

Create a free account to:

✓ Save your purchases
✓ Follow artists
✓ Join communities
✓ Get notifications
✓ Access your purchase library
✓ Buy merch & tickets

[ Create Account ]

[ Log In ]

Continue without an account
```

---

# 59. Final Architecture

```text
                    XOLDOUT
                       │
                       ▼
              Artist Product Link
                       │
                       ▼
                Guest Checkout
                       │
                       ▼
              Create Pending Order
                       │
                       ▼
                Payment Gateway
                       │
                       ▼
             Server-Side Verification
                       │
                 ┌─────┴─────┐
                 │           │
               FAIL        SUCCESS
                 │           │
                 ▼           ▼
          Payment Failed   Order PAID
                             │
                             ▼
                       Create Purchase
                             │
                             ▼
                       Grant Access
                             │
                             ▼
                    Purchase Success
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
             Listen       Download    Create Account
                                           │
                                           ▼
                                         Login
                                           │
                                           ▼
                                  Claim Guest Purchase
                                           │
                                           ▼
                                    Attach userId
                                           │
                                           ▼
                                   User Purchase Library
```

---

# 60. Implementation Priority

Implement in this order.

## Phase 1 — Guest Checkout

- Direct purchase route
- Guest checkout UI
- Customer information
- Payment initialization
- Pending order

## Phase 2 — Payment Verification

- Server-side verification
- Webhook processing
- Idempotency
- Payment status updates

## Phase 3 — Purchase Creation

- Purchase record
- Guest purchase support
- Secure access token
- Access control

## Phase 4 — Success Experience

- Success page
- Listen
- Download
- Purchase confirmation
- Email confirmation

## Phase 5 — Account Conversion

- Create account
- Login
- Claim guest purchase
- Attach purchase to user
- Add to library

## Phase 6 — Security & Edge Cases

- Duplicate payment prevention
- Secure token handling
- Authorization
- Rate limiting
- Validation
- Error handling

## Phase 7 — Testing

Test every scenario in the acceptance criteria.

---

# 61. Acceptance Criteria

## Guest Checkout

- [ ] A guest can open `/buy/[productId]`.
- [ ] Guest does not need an account.
- [ ] Guest can enter name/email.
- [ ] Guest can pay.
- [ ] Correct product price is used.
- [ ] Payment is verified server-side.
- [ ] Successful payment creates exactly one purchase.
- [ ] Guest receives access immediately.
- [ ] Guest can listen/download.
- [ ] Purchase confirmation is sent.

## Account Conversion

- [ ] Guest can create an account after purchase.
- [ ] Guest can log in after purchase.
- [ ] Guest purchase can be claimed.
- [ ] Purchase appears in library.
- [ ] Customer is not charged again.
- [ ] Multiple guest purchases can be claimed.
- [ ] Already claimed purchases cannot be duplicated.

## Payment

- [ ] Failed payment does not create an active purchase.
- [ ] Cancelled payment does not create an active purchase.
- [ ] Duplicate webhook does not create duplicate purchase.
- [ ] Duplicate button clicks do not create duplicate orders.
- [ ] Amount is verified server-side.
- [ ] Payment reference is verified.
- [ ] Payment status is determined by backend verification.

## Security

- [ ] Guest access uses secure tokens.
- [ ] Users cannot access another customer's purchases.
- [ ] Purchase claiming is protected.
- [ ] Payment secrets remain server-side.
- [ ] Download URLs are protected.
- [ ] API inputs are validated.
- [ ] Sensitive errors are not exposed.
- [ ] Guest purchase enumeration is prevented.

## Existing System

- [ ] Existing login still works.
- [ ] Existing registration still works.
- [ ] Existing marketplace still works.
- [ ] Existing creator earnings still work.
- [ ] Existing payout system still works.
- [ ] Existing purchase library still works.
- [ ] Existing listen/download functionality still works.
- [ ] Existing payment integration still works.
- [ ] No unrelated functionality is broken.

---

# 62. Non-Negotiable Business Rule

## A customer who has successfully paid must receive the product they paid for without being forced to create an account.

Account creation is a conversion opportunity, not a checkout barrier.

The ideal XOLDOUT experience is:

```text
CLICK
  ↓
BUY
  ↓
GET MUSIC
  ↓
DISCOVER XOLDOUT
  ↓
CREATE ACCOUNT
  ↓
BECOME A XOLDOUT USER
```

---

# 63. Developer Instruction

Before making any code changes:

1. Inspect the existing XOLDOUT project structure.
2. Identify the existing authentication implementation.
3. Identify the existing payment gateway integration.
4. Identify the existing payment webhook implementation.
5. Identify existing User, Product, Order, Payment, Purchase, and Library models.
6. Identify existing creator revenue/payout logic.
7. Identify existing listen/download APIs.
8. Identify existing storage/download protection.
9. Reuse existing components and services.
10. Avoid rewriting unrelated code.

Implement the guest checkout as an extension of the current architecture, not as a separate parallel system.

After implementation:

1. Run the existing type checks.
2. Run linting.
3. Run tests.
4. Fix any errors introduced by the implementation.
5. Verify guest checkout manually.
6. Verify logged-in checkout.
7. Verify payment success.
8. Verify payment failure.
9. Verify webhook idempotency.
10. Verify guest access.
11. Verify account creation after purchase.
12. Verify login after purchase.
13. Verify purchase claiming.
14. Verify purchase appears in the user's library.
15. Verify no duplicate purchase is created.
16. Verify existing functionality remains intact.

Do not stop at the UI. Implement the complete end-to-end flow from checkout → payment → backend verification → purchase creation → access → account claiming → library.
