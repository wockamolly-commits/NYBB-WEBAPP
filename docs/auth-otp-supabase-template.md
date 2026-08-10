# Supabase email OTP setup

The storefront verifies a six-digit email code on `/login`. Supabase must send `{{ .Token }}` in
the email body. A magic-link-only template will send the customer a URL while the screen waits for
a number, so this dashboard setting is part of the deployment rather than optional copy.

Use [`supabase/email-templates/customer-otp.html`](../supabase/email-templates/customer-otp.html)
as the body for these Supabase Auth templates:

- Magic Link
- Confirm Signup
- Invite, before staff invitations are enabled in Phase 2

In the Supabase dashboard, open Authentication, Email Templates, then replace each template body.
Keep `{{ .Token }}` and remove `{{ .ConfirmationURL }}`. Set the subject to `Your NYBB sign-in
code`.

After saving, verify the flow with an email address the project owner controls:

1. Open `/login` on the production build.
2. Request a code once. The application enforces a 60-second resend cooldown and a five-request
   window per email and network address.
3. Confirm the email contains a six-digit code rather than a sign-in link.
4. Enter the code and confirm the browser lands on `/account`.
5. Save a pickup name and phone, then open `/checkout` and confirm both are prefilled.
6. Place a staging order and confirm `orders.user_id` matches the Auth user.

Do not paste access tokens, refresh tokens, service-role keys, or the received OTP into logs or
screenshots.
