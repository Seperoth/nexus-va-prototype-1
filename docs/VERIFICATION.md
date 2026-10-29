# Prototype verification

Verified locally on October 28, 2026.

## Automated checks

- TypeScript and Vite production build.
- 12 domain tests covering valid service journeys, automatic and manual assignment, payment ownership and duplicate payment rejection, staff skill preferences, delivery requirements, closure and star ratings, suspension, scheduling conflicts, and invalid input.
- 8 embedded PostgreSQL integration tests executing the actual Supabase migration. These check signup privilege isolation, transaction behavior, row-level security, direct table write denial, automatic matching, staff chat and payment tracking, private upload ownership, delivery and closure, appointment conflicts, and admin-only audit access.
- Dependency audit: no known vulnerabilities at verification time.

## Browser checks

Performed through the real UI in Chrome:

1. Entered the client demo account and created **Client onboarding guide**, Medium difficulty, $125 test budget.
2. Confirmed the initial test payment in Billing and verified automatic assignment to Maya Bennett.
3. Switched to the assistant, opened the request, and stored a sample output in browser IndexedDB through **Try sample output**.
4. Sent a message from the assistant to the client and delivered the output.
5. Switched to the client, triggered the download, approved the delivery, left five stars and written feedback, and closed the request.
6. Booked **Onboarding guide review** and verified it appeared on FullCalendar.
7. Updated the client profile and checked the admin audit log and Paid/Delivered/Completed classification.
8. Checked the client dashboard at a 390 px mobile viewport with no document-level horizontal overflow, and verified mobile navigation.

These actions leave a completed sample request and review appointment in the browser demo so you can inspect the outcome.

Chrome’s extension denied automated selection of a local file because **Allow access to file URLs** was disabled. The built-in sample output exercised the same file storage and delivery path, but arbitrary file-picker automation was not verified. Normal user file selection remains available through the app.

Supabase-hosted Auth, service-backed Storage uploads, live multi-user synchronization, and Resend email sending require project configuration and remain unverified against external services. Nothing was hosted on Railway or published to a GitHub remote.
