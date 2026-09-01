# XOLDOUT Beat Marketplace & Licensing System

## 1. Overview

The XOLDOUT Beat Marketplace allows producers to upload, manage, license, and sell beats to artists and other music creators.

XOLDOUT operates as the marketplace and licensing facilitator. Unless a separate copyright assignment is expressly executed, the producer remains the copyright owner of the underlying work.

The system must support:

- Producer onboarding
- Beat uploads
- Ownership declarations
- Collaborator and split management
- Sample declarations
- Multiple license packages
- Beat purchases
- Automated license generation
- Secure digital downloads
- Creator earnings
- XOLDOUT commissions
- Creator withdrawals
- Copyright disputes
- Takedowns
- Exclusive licenses
- License verification
- Audit logs

---

# 2. Core Principles

### 2.1 Copyright Ownership

A producer should not transfer copyright ownership merely by listing a beat on XOLDOUT.

The platform should clearly distinguish between:

- Non-exclusive license
- Exclusive license
- Copyright assignment

An exclusive license is not automatically a transfer of copyright ownership.

### 2.2 Producer Responsibility

The producer must confirm that they:

- Own the beat; or
- Have sufficient rights to license it; and
- Have authorization from all relevant collaborators; and
- Have disclosed samples; and
- Have obtained required sample clearances for commercial use.

### 2.3 XOLDOUT Responsibility

XOLDOUT facilitates:

- Marketplace listing
- Licensing
- Payment collection
- License issuance
- Digital delivery
- Revenue accounting
- Creator payouts
- Dispute handling

---

# 3. Producer Onboarding

Before selling beats, a producer should create and complete a producer profile.

## Required Information

- Full/legal name
- Producer/stage name
- Email
- Phone number
- Country
- Address
- Profile image
- Biography
- Payment/payout information
- Tax information where required

## Producer Agreement

The producer must accept the XOLDOUT Producer Agreement before their first beat can be published.

The agreement should authorize XOLDOUT to:

- Display the producer's beats
- Promote the beats
- Facilitate licenses
- Collect payments
- Deduct agreed platform fees
- Pay the producer
- Issue licenses to buyers
- Process permitted refunds
- Remove disputed/infringing content
- Suspend or terminate listings that violate the agreement

---

# 4. Beat Upload

## Beat Information

Every beat listing should contain:

- Beat title
- Producer
- Genre
- Mood
- BPM
- Musical key
- Description
- Tags
- Cover artwork
- Preview audio
- Full master file
- Stems, if available
- Creation date
- Version
- License packages
- Copyright/ownership information

## Recommended Database Structure

```text
Beat
├── id
├── producerId
├── title
├── slug
├── description
├── genre
├── mood
├── bpm
├── key
├── artworkUrl
├── previewUrl
├── masterFile
├── stemsFile
├── ownershipStatus
├── sampleStatus
├── status
├── version
├── createdAt
├── updatedAt
└── publishedAt
```

---

# 5. Ownership Declaration

Before publishing a beat, the producer must confirm:

> I confirm that I own or control the rights necessary to license this beat through XOLDOUT and that the information provided about ownership, collaborators, and samples is accurate.

The producer should select an ownership status:

```text
creator_owned
jointly_owned
licensed_to_producer
```

Beats with unclear or disputed ownership should not be commercially listed until reviewed.

---

# 6. Collaborators and Splits

A beat may have multiple creators.

Example:

```text
Beat: Afro Vibes

Producer A: 60%
Producer B: 40%

Total: 100%
```

The platform should require:

```text
Total split = 100%
```

## Recommended Collaborator Fields

```text
collaboratorId
name
email
role
percentage
approvalStatus
```

Possible approval states:

```text
pending
approved
rejected
```

Where practical, collaborators should approve their ownership/split information before the beat is published.

---

# 7. Sample Declaration

During upload, ask:

### Does this beat contain samples?

```text
Yes
No
```

If **Yes**, ask:

### Has the sample been cleared for the intended commercial use?

```text
Yes
No
Unknown
```

A beat with uncleared samples should not be offered with commercial licensing that the producer does not have the right to grant.

The producer remains responsible for accurately declaring samples and obtaining required permissions.

---

# 8. Beat Review

New beats should enter a review workflow before publication.

## Statuses

```text
draft
pending_review
approved
published
rejected
suspended
disputed
removed
```

## Review Checklist

Admin/reviewer should be able to check:

- Ownership declaration
- Collaborator splits
- Sample declaration
- Audio quality
- Artwork
- Metadata
- License configuration
- Prohibited content
- Copyright complaints
- Duplicate/disputed content

---

# 9. License Types

XOLDOUT should allow producers to create multiple license packages for each beat.

The exact price and rights can be configured by the producer within platform rules.

## Example License Packages

### Basic Lease

Example price: ₦20,000

Possible rights:

- MP3/WAV
- Commercial use
- Limited distribution
- Non-exclusive license
- Producer retains copyright
- Producer credit required

### Premium Lease

Example price: ₦50,000

Possible rights:

- High-quality WAV
- Stems
- Commercial release
- Higher distribution limit
- Music video use
- Social media/content use
- Producer credit required
- Non-exclusive license

### Unlimited License

Example price: ₦100,000

Possible rights:

- WAV
- Stems
- Unlimited streams
- Commercial release
- Music videos
- Live performances
- Social media/content monetization
- Producer credit required
- Non-exclusive license

### Exclusive License

Example price: ₦500,000+

Possible rights:

- Exclusive use according to agreement
- WAV
- Stems
- Commercial release
- Music videos
- Live performances
- Content monetization
- Producer credit
- Beat removed from future marketplace licensing after sale, subject to existing licenses and contract terms

---

# 10. License Configuration

Each license package should support configurable fields.

```text
License
├── id
├── beatId
├── name
├── price
├── currency
├── licenseType
├── duration
├── territory
├── streamingLimit
├── salesLimit
├── commercialUse
├── musicVideoUse
├── livePerformance
├── socialMediaUse
├── stemsIncluded
├── wavIncluded
├── mp3Included
├── attributionRequired
├── exclusive
├── restrictions
└── active
```

---

# 11. Buyer Purchase Flow

The artist should be able to:

1. Open a beat
2. Listen to preview
3. Compare licenses
4. Select a license
5. Add buyer information
6. Proceed to checkout
7. Pay
8. Receive payment confirmation
9. Receive license
10. Download permitted files

Example:

```text
Beat
 ↓
Choose License
 ↓
Checkout
 ↓
Payment
 ↓
Payment Verification
 ↓
Order Created
 ↓
License Generated
 ↓
Download Access Granted
```

---

# 12. Payment Processing

XOLDOUT may collect the buyer's payment and calculate the platform's commission before crediting the creator.

Example:

```text
Beat License: ₦100,000

Gross Sale:          ₦100,000
XOLDOUT Commission:  ₦15,000
Creator Share:       ₦85,000
```

The actual calculation must also account for:

- Payment gateway fees
- Refunds
- Chargebacks
- Taxes/withholding obligations
- Other approved deductions

The commercial agreement should clearly explain the calculation.

---

# 13. Creator Wallet

Each producer should have a wallet/earnings dashboard.

```text
Creator Wallet

Pending Balance       ₦150,000
Available Balance     ₦350,000
Withdrawn             ₦800,000
Total Earnings        ₦1,300,000
```

## Earnings Status

```text
pending
available
withdrawal_requested
processing
paid
failed
reversed
```

A new transaction should normally enter:

```text
pending
```

before becoming:

```text
available
```

This provides protection against payment disputes, chargebacks, fraud and refunds.

---

# 14. Secure Beat Files

Original beat files must never be publicly exposed.

Recommended structure:

```text
R2
├── beats
│   ├── private
│   │   ├── masters
│   │   └── stems
│   │
│   └── previews
│       └── watermarked
```

The preview can contain an audible XOLDOUT/producer watermark.

Purchased files should be delivered using temporary signed URLs or another secure access mechanism.

The public API should never expose permanent private storage credentials or unrestricted master-file URLs.

---

# 15. Order Structure

Recommended order fields:

```text
Order
├── id
├── buyerId
├── producerId
├── beatId
├── licenseId
├── amount
├── currency
├── platformFee
├── gatewayFee
├── creatorAmount
├── paymentReference
├── paymentStatus
├── orderStatus
├── licenseId
├── purchasedAt
└── completedAt
```

Example:

```text
Order ID: XOL-829382
Beat: Afrobeat Vibes
Buyer: John Doe
Producer: Producer X
License: Premium
Amount: ₦50,000
Status: Paid
License: XOL-LIC-2026-000182
```

---

# 16. Automated License Generation

Every successful purchase should generate a unique license record.

Example:

```text
XOL-LIC-2026-000182
```

The license should include:

- License ID
- Buyer name
- Producer name
- Beat title
- Beat ID
- License type
- Purchase price
- Purchase date
- Permitted uses
- Distribution limits
- Streaming limits
- Territory
- Duration
- Restrictions
- Attribution requirements
- Copyright ownership statement
- Agreement version
- Order ID

The buyer should receive a downloadable PDF license.

The producer should also have access to the license record.

---

# 17. License Verification

Create a public verification endpoint/page.

Example:

```text
xoldout.com/verify/XOL-LIC-2026-000182
```

The page should show:

```text
✓ Valid XOLDOUT License

License ID:
XOL-LIC-2026-000182

Beat:
Afrobeat Vibes

Producer:
Producer X

Licensed To:
John Doe

License Type:
Premium

Issued:
September 1, 2026

Status:
Active
```

Do not expose unnecessary private buyer information.

---

# 18. Download Access

After successful payment:

```text
My Purchases
```

Example:

```text
Afrobeat Vibes

Premium License

[Download WAV]
[Download Stems]
[Download License PDF]
```

Downloads should be tied to the purchase/license record.

Recommended protections:

- Authentication
- Signed URLs
- Expiring download links
- Download logging
- Rate limiting
- Purchase ownership verification

---

# 19. Exclusive Beat Handling

When an exclusive license is successfully completed:

```text
Beat Status:
exclusive_sold
```

The beat should no longer be available for new licenses unless the agreement specifically allows otherwise.

Important:

Existing valid non-exclusive licenses should not automatically disappear simply because a later exclusive sale occurs.

The license terms must explain how existing licenses are treated.

---

# 20. Dispute System

Users should be able to report a beat.

Example:

```text
Report Beat
├── Copyright infringement
├── Unauthorized sample
├── Stolen beat
├── False ownership claim
├── Duplicate content
└── Other
```

## Dispute Workflow

```text
Report submitted
 ↓
Case created
 ↓
Beat flagged
 ↓
Evidence requested
 ↓
Producer response
 ↓
Admin review
 ↓
Decision
 ↓
Restore / Suspend / Remove
```

Possible dispute statuses:

```text
open
under_review
awaiting_response
resolved
rejected
removed
```

---

# 21. Copyright Takedown

XOLDOUT should have a clear copyright complaint process.

A complaint should collect:

- Complainant name
- Contact information
- Beat URL
- Description of alleged infringement
- Evidence of ownership
- Supporting documents
- Declaration that the complaint is truthful

Admin should be able to:

- Restrict the beat
- Freeze related payouts where appropriate
- Request evidence
- Communicate with affected parties
- Resolve the case
- Reinstate or remove content

XOLDOUT should have legal counsel review the final takedown procedure and notices.

---

# 22. Refunds and Chargebacks

The platform should have a defined refund policy.

Important considerations:

- Whether digital downloads have already been accessed
- Unauthorized transactions
- Duplicate payments
- Payment gateway reversals
- Fraud
- Copyright disputes
- Technical delivery failures

If a transaction is refunded:

```text
Order → refunded
Creator earning → reversed
License → revoked/marked inactive where legally and contractually appropriate
Download access → disabled
```

The exact effect should be governed by the applicable license and refund terms.

---

# 23. Versioning

Beats may be updated.

Example:

```text
Beat
├── Version 1
├── Version 2
└── Version 3
```

Every purchase should reference the specific beat/license version applicable to the transaction.

Existing licenses should not silently change when a producer uploads a new version.

---

# 24. Producer Dashboard

Recommended dashboard:

```text
Producer Dashboard

Overview
├── Total Earnings
├── Available Balance
├── Pending Balance
├── Total Sales
├── Total Beats
└── Active Licenses

My Beats
├── Published
├── Drafts
├── Pending Review
├── Disputed
└── Exclusive

Sales
├── Orders
├── Licenses
├── Revenue
└── Payouts

Wallet
├── Available
├── Pending
├── Withdraw
└── Transactions

Profile
└── Producer Agreement
```

---

# 25. Admin Dashboard

Recommended admin structure:

```text
XOLDOUT ADMIN

Marketplace
├── All Beats
├── Pending Approval
├── Published
├── Suspended
├── Removed
└── Exclusive

Rights & Licensing
├── Licenses
├── Exclusive Sales
├── License Templates
├── Verification
└── Rights Records

Disputes
├── Open
├── Under Review
├── Resolved
└── Copyright Reports

Payments
├── Transactions
├── Creator Earnings
├── Payouts
├── Refunds
└── Chargebacks

Creators
├── Producers
├── Verification
├── Collaborators
└── Suspended Accounts

Audit
└── Audit Logs
```

---

# 26. Audit Logs

Important actions should be logged.

Examples:

```text
producer uploaded beat
producer edited beat
admin approved beat
license created
payment confirmed
download generated
download completed
exclusive license sold
beat suspended
dispute opened
dispute resolved
payout requested
payout completed
refund processed
```

Recommended fields:

```text
AuditLog
├── id
├── actorId
├── actorRole
├── action
├── entityType
├── entityId
├── metadata
├── ipAddress
├── userAgent
└── createdAt
```

---

# 27. Recommended API Endpoints

## Producer

```text
POST   /api/producers/profile
GET    /api/producers/me
PATCH  /api/producers/me
```

## Beats

```text
POST   /api/beats
GET    /api/beats
GET    /api/beats/:id
PATCH  /api/beats/:id
DELETE /api/beats/:id
POST   /api/beats/:id/submit-review
```

## Licenses

```text
POST   /api/beats/:id/licenses
GET    /api/beats/:id/licenses
PATCH  /api/licenses/:id
GET    /api/licenses/:id
GET    /api/licenses/:id/pdf
GET    /api/licenses/verify/:licenseId
```

## Orders

```text
POST   /api/orders
GET    /api/orders
GET    /api/orders/:id
```

## Payments

```text
POST   /api/payments/initialize
POST   /api/webhooks/payment
GET    /api/payments/:reference
```

## Downloads

```text
GET    /api/purchases/:id/download
GET    /api/purchases/:id/stems
GET    /api/purchases/:id/license
```

## Wallet

```text
GET    /api/wallet
GET    /api/wallet/transactions
POST   /api/wallet/withdraw
```

## Disputes

```text
POST   /api/disputes
GET    /api/disputes
GET    /api/disputes/:id
POST   /api/disputes/:id/respond
```

## Admin

```text
GET    /api/admin/beats
POST   /api/admin/beats/:id/approve
POST   /api/admin/beats/:id/reject
POST   /api/admin/beats/:id/suspend

GET    /api/admin/disputes
POST   /api/admin/disputes/:id/resolve

GET    /api/admin/payouts
POST   /api/admin/payouts/:id/approve
```

---

# 28. Recommended Database Relationships

```text
User
 │
 ├── ProducerProfile
 │       │
 │       └── Beats
 │              │
 │              ├── Collaborators
 │              ├── LicensePackages
 │              └── BeatVersions
 │
 └── Purchases
          │
          ├── Order
          ├── License
          └── Downloads

Producer
 │
 └── Wallet
       ├── Earnings
       └── Withdrawals
```

---

# 29. Security Requirements

The beat marketplace should implement:

- Server-side payment verification
- Webhook signature verification
- Authentication
- Authorization
- Role-based access control
- Rate limiting
- Input validation
- File-type validation
- File-size limits
- Malware scanning where appropriate
- Private object storage
- Signed download URLs
- Secure payout processing
- Audit logs
- Fraud monitoring
- Idempotent payment processing
- Protection against duplicate orders

Never mark an order as paid based only on a frontend response.

The server must verify the transaction through the payment provider/webhook before delivering the purchased files.

---

# 30. Legal Documents

Before launch, XOLDOUT should have legally reviewed versions of:

1. XOLDOUT Terms of Service
2. Producer Agreement
3. Buyer/Artist Terms
4. Beat License Agreement
5. Exclusive License Agreement
6. Copyright Assignment Agreement, if supported
7. Privacy Policy
8. Refund Policy
9. Copyright Infringement/Takedown Policy
10. Creator Payout Terms

Legal counsel should specifically review the Nigerian copyright, contract, consumer, payment, tax and data-protection implications of the marketplace.

---

# 31. Recommended MVP

For the first production release, implement:

### Producer

- Producer profile
- Beat upload
- Ownership declaration
- Sample declaration
- Collaborator splits
- Beat review
- License package creation

### Marketplace

- Beat discovery
- Search/filter
- Beat player
- License comparison
- Checkout

### Licensing

- Automatic license generation
- Unique license ID
- PDF license
- License verification
- Purchase history

### Payments

- Payment gateway integration
- Server-side payment verification
- Webhooks
- XOLDOUT commission
- Creator earnings
- Payout requests

### Storage

- Private master files
- Private stems
- Watermarked previews
- Signed download URLs

### Admin

- Beat moderation
- Producer management
- Order management
- Payout management
- Disputes
- Copyright reports
- Audit logs

---

# 32. Recommended Production Flow

```text
PRODUCER
    │
    ▼
Create Account
    │
    ▼
Complete Producer Profile
    │
    ▼
Accept Producer Agreement
    │
    ▼
Upload Beat
    │
    ├── Ownership Declaration
    ├── Collaborators & Splits
    ├── Sample Declaration
    └── License Packages
    │
    ▼
XOLDOUT Review
    │
    ▼
Beat Published
    │
    ▼
ARTIST
    │
    ▼
Select Beat
    │
    ▼
Choose License
    │
    ▼
Checkout
    │
    ▼
Payment Gateway
    │
    ▼
Server Verification
    │
    ▼
Order Confirmed
    │
    ├── Generate License
    ├── Generate License ID
    ├── Record Revenue Split
    └── Grant Download Access
    │
    ▼
Creator Earnings
    │
    ▼
Pending
    │
    ▼
Available
    │
    ▼
Withdrawal
```

---

# 33. Final Product Goal

The XOLDOUT Beat Marketplace should provide a complete and auditable process from:

**Beat Creation → Rights Declaration → Marketplace Listing → License Selection → Payment → License Issuance → Secure Download → Revenue Split → Creator Payout**

The platform should make it clear at every stage:

- Who created the beat
- Who owns/control the rights
- What license was purchased
- What the buyer is allowed to do
- How much was paid
- How much XOLDOUT retained
- How much the creator earned
- Which files were delivered
- Which license version applies
- Whether the license is active
- Whether the beat is disputed or exclusive

This structure should be treated as the product/engineering specification. Legal agreements and the final commercial terms should be reviewed by qualified Nigerian legal and tax professionals before launch.
