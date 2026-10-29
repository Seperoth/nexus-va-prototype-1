# Nexus VA — Prototype 1

A local, working prototype for clients, virtual assistants, and administrators. The workspace follows the supplied [Nexus VA Figma reference](https://www.figma.com/design/ipg60TMOg3sqIVzvNRwpp3/Nexus-VA-%E2%80%94-Workspace-Redesign?node-id=0-1). [Canopy](https://www.getcanopy.com/) informed the connected service workflow. Payments are **always simulated**.

## Run locally

Requires Node.js 22.18+ and npm.

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). This is **Prototype 1**. The source repository is public; the application remains local and is not deployed to Railway. All payments are simulated.

On Windows, double-click **Open Nexus VA.cmd** in the project folder. It starts the local server if needed and opens the prototype in your default browser. You can also use `npm run start:local` to start the server without opening a browser. The background process runs independently of the calling terminal. Run the launcher again after restarting your PC; simply opening the web address cannot start a stopped server. Server logs are in `.local/local-server.log`, and `.local/local-server.pid` records its process ID. `npm run dev` remains available for development in an open terminal. The prototype remains local and needs this PC to be switched on.

Without Supabase environment variables, the sign-in screen offers three clearly labeled demo accounts:

| Workspace         | Account      | What to try                                                                                                                     |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Client            | Alex Morgan  | Request work, book appointments, send messages, upload documents, make test payments, approve delivery, and leave a star rating |
| Virtual assistant | Maya Bennett | Accept matching requests, chat, request and verify payment, upload work, and deliver output                                     |
| Admin             | Jordan Lee   | Review all tickets, assign staff, inspect payment/delivery combinations, and read activity logs                                 |

Use **Account menu → Switch demo account** to follow a service through all roles. Sign out returns to the demo sign-in screen. These are browser-local demo sessions, not real authenticated accounts. Demo data is shared between tabs on this browser and origin; files are stored in IndexedDB. Clearing site data resets the demo and removes uploaded files. Use sample documents only.

## Try one complete service

1. Sign in to **Client workspace**. Open **Settings & profile**, update your information, and save. Upload a sample document under **Files & documents**.
2. In **Appointments**, schedule a future appointment. The calendar uses your device’s local timezone and rejects overlaps.
3. Select **New request**. Enter a service category, a detailed description, a positive USD budget, Easy/Medium/Hard difficulty, and a due date.
4. Choose either assignment path:
   - **Automatic:** Pay the initial budget request in **Billing**. An available assistant who enabled automatic assignment and has the matching service and difficulty level is selected, preferring the lightest active workload.
   - **Manual:** Switch to **Virtual assistant**, open the available request, and select **Accept request**. The assistant must be available and have matching skills and difficulty level. Pay the initial request as the client before delivery.
5. Open **Messages**. Both parties can send messages and share files. After the initial request is paid, the assistant can request an additional payment for negotiated scope, and optionally mark that request Verified. Only one outstanding payment is allowed per ticket.
6. As the client, choose **Pay in test mode → Confirm test payment**. Pending or Verified requests can be paid. The record becomes Paid, a confirmation notification appears, and no real money moves.
7. As the assigned assistant, open **Project details**, upload an output file (or choose **Try sample output** for a built-in test document), and select **Deliver output**. All payment requests must be Paid and at least one output must be uploaded.
8. As the client, download the output, choose **Approve & leave feedback**, select 1–5 stars, optionally leave a note, and close the request.
9. Switch to **Admin → Activity logs** to inspect the outcome and audit events. The four summary groups cover Paid/Delivered, Paid/Not delivered, Pending/Delivered, and Pending/Not delivered. Pending in these groups includes Verified, outstanding, or absent payment records. Normal workflow prevents delivery before payment, so Pending/Delivered should ordinarily stay at zero.

The seeded client workspace includes an already delivered social media content pack, active projects, a verified payment, available requests, appointments, and downloadable text documents. Sample deliverables are text examples, not generated images or PDFs.

## Connect a free Supabase project

The Supabase integration is implemented, but no project or credentials are provisioned by this repository. It is separate from demo data: browser demo records are not uploaded automatically.

1. Create or choose a free Supabase project.
2. Run `supabase/migrations/202610270001_workspace.sql` **once in a new project** using the SQL editor, or use the Supabase CLI migration flow. The migration installs the schema, role types, signup trigger, row-level security, workflow RPC, appointment exclusion constraints, and private `documents` storage bucket.
3. Copy `.env.example` to `.env.local` and fill in:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   ```

   Only a public anon/publishable key belongs in the frontend. Never put a service-role key or Resend key in a `VITE_` variable. `.env.local` is ignored by Git.

4. Restart `npm run dev`. The app uses Supabase email/password login and client signup, with session restoration and logout. Configure the local URL in Supabase Auth URL settings; keep email confirmation enabled as appropriate.
5. Register the test accounts using the app or create them in Supabase Auth. New users always receive the **client** role regardless of supplied metadata.
6. In the Supabase SQL editor, use the actual Auth user IDs to designate your test assistant and admin. Example:

   ```sql
   update public.profiles
   set role = 'staff', available = true, "autoAssign" = true,
       "skillLevel" = 'Hard',
       skills = array['Administrative support','Content & marketing','Design & creative',
                      'Customer support','Research & data','Web & technology']
   where id = 'YOUR_ASSISTANT_AUTH_USER_UUID';

   update public.profiles set role = 'admin'
   where id = 'YOUR_ADMIN_AUTH_USER_UUID';
   ```

7. Sign in using each account to follow the service journey. Use different browser profiles for separate simultaneous users. The app refreshes shared Supabase data every 15 seconds and immediately after its own mutations.

Connected mode deliberately has no role-switch menu. Account roles come from the database. Tables expose read access through RLS; mutations run through a transactional RPC that derives the actor from `auth.uid()`. Users cannot change roles, mark arbitrary payments Paid, close another client’s work, or upload output as an unrelated assistant. Private file downloads follow document visibility. Account-level documents are reviewable by staff; ticket files are limited to participants and admins. Uploads are capped at 10 MB, and active web/executable extensions are blocked.

## Optional Resend payment emails

In-app confirmation notifications work in both modes. Sending email requires configuration; no email is sent from the local demo.

1. Create a Resend API key and configure a sender. For initial testing, Resend’s default test sender can only send to authorized test recipients; use your verified domain for other recipients.
2. Deploy `supabase/functions/payment-notification` with the Supabase CLI when you are ready to enable email.
3. Set these **Edge Function secrets**, not frontend variables: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PAYMENT_WEBHOOK_SECRET`, and `APP_URL`. Supabase provides its project URL and service-role key to deployed functions.
4. Configure a database webhook on `public.payments` UPDATE events targeting the function URL. Add the header `x-webhook-secret` equal to `PAYMENT_WEBHOOK_SECRET`. The function uses this secret instead of JWT verification, which is disabled for this function in `supabase/config.toml`.
5. The function ignores unrelated events, verifies the current Paid record in the database, resolves the client from the ticket, and sends a plain-text confirmation. It supplies a payment-specific Resend idempotency key to prevent duplicate email on webhook retries within Resend’s idempotency window. Monitor webhook delivery and function logs for failures; in-app notifications remain available.

## Technology and checks

React + TypeScript + Vite, Lucide icons, FullCalendar (free plugins), TanStack Table, Supabase Auth/Postgres/Storage, and a Supabase Edge Function for Resend.

```powershell
npm run build
npm test
npm audit
```

Tests cover the demo state transitions and run the unmodified Supabase migration in embedded PostgreSQL (PGlite), with minimal mock Supabase-owned Auth and Storage schemas. They verify RLS, unauthorized mutations, signup privilege isolation, automatic assignment, payment guards, document visibility, delivery, feedback, audit access, and scheduling conflicts. They do not replace live verification of Supabase Auth emails, Storage service upload behavior, the deployed Resend webhook, or internet hosting.

The initial build is intentionally local. Deployment, a public GitHub remote, production payment processing, password reset UI, antivirus scanning, and email deliverability setup are outside Prototype 1.
