# Maintainability Notes

**Scope:** Storefront, admin, provider, vendor Partner OS, superadmin, and API.
**Relationship to security:** These are maintainability, operational-integrity,
and UX follow-ups. They are not launch-security findings and are not included
in the severity totals in [SECURITY_AUDIT.md](./SECURITY_AUDIT.md).

| Priority | Area | Observation | Follow-up |
|----------|------|-------------|-----------|
| P2 | JSON-file writes | `backend/db/src/routes/client-categories.ts` reads the whole JSON file, appends in memory, then overwrites it. Concurrent admin POSTs can lose one update; `Date.now()` is also not a collision-proof ID. The global API gate keeps this off the public route surface, so this is an integrity/operability risk rather than an auth defect. | Move the data to MySQL, or serialize writes and use collision-resistant IDs plus atomic temp-file replacement. |
| P2 / future-proofing | Uniqueness / idempotency | The schema has no unique `(vendor_id, booking_id)` key on `offers` and no unique key on `jobs.offer_id`. Current offer acceptance uses a conditional status transition inside a transaction, but the database cannot independently prevent duplicate fan-out rows or jobs if another write path/retry is added. | Before adding constraints, check and clean existing duplicates; then add keys for the intended one-offer-per-vendor/booking and one-job-per-offer invariants. |
| P2 | Duplicated chat and helpers | Customer and provider SPAs maintain separate `BookingMessaging` components with independently implemented polling, send, and cleanup flows. The customer version now aborts stale requests; the provider version still has an effect that omits `token` from its dependencies and only clears the interval. Similar date/status utilities are copied across apps. | Extract shared chat behavior behind app-specific auth/API adapters, and consolidate pure date/status helpers with explicit timezone contracts. |
| P2 | Oversized modules | Current large files include `src/pages/ServiceDetail.jsx` (2,879 lines), `backend/db/src/routes/vendor.ts` (4,526), and `superadmin/src/pages/CatalogServices.tsx` (3,218). Their size raises review, test, and regression costs; this is not itself a launch defect. | Split by domain (picker/booking flow, vendor route groups, catalog editor sections) as nearby changes make that practical. |
| P2 | Type safety | A source scan found about 800 explicit TypeScript `any` annotations/casts, concentrated in the API and superadmin app. This weakens compile-time checks around SQL rows and API payloads. | Replace incrementally with typed row interfaces and shared API DTOs, starting at booking, payout, and catalog boundaries. |
| P2 | Naming/contracts | Database/API fields are commonly `snake_case`; the customer context transforms them to `camelCase`, while provider code consumes raw `scheduled_at`/`booking_id` fields and other apps apply their own mappings. This is workable but makes cross-app contract drift easier. | Define and document typed DTOs at API boundaries; keep DB naming internal and normalize once per client. |
| P3 | Status semantics | `provider/src/utils/bookings.js` contains a `confirmed` label, but the persisted booking status enum is `upcoming | completed | cancelled` and no provider code currently uses `confirmed`. In superadmin, overdue rows remain in the `Upcoming` count/tab and receive a separate `Missed` badge. | Remove or formally support the stale `confirmed` state; decide whether the superadmin tab/count should mean “open” or strictly future, then label it consistently. |

## Evidence

- JSON read-modify-write: `backend/db/src/routes/client-categories.ts:20-35`.
- Missing offer/job uniqueness: `backend/db/db.sql:925-986`; the guarded acceptance path is in `backend/db/src/routes/vendor.ts:1220-1320`.
- Customer/provider chat copies: `src/components/BookingMessaging.jsx` and `provider/src/components/BookingMessaging.jsx`.
- Repeated occurrence/local-date helpers: `src/pages/Bookings.jsx`, `src/pages/BookingDetail.jsx`, and `provider/src/utils/bookings.js`.
- Persisted booking status enum: `backend/db/db.sql:207-227`.
- The superadmin upcoming count and the separate missed badge are at `superadmin/src/pages/Orders.tsx:240-245, 392-400`; missed calculation is at `52-53`.
