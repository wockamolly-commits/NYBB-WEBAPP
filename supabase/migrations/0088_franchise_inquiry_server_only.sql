-- 0088_franchise_inquiry_server_only.sql
--
-- The franchise form's rate limit could be stepped around.
--
-- submit_franchise_inquiry (0045) was granted to anon so the form could write
-- through the public client. What bounds a flood of junk leads is the address
-- limit in lib/franchise/submit.ts, twelve an hour per connection, because the
-- database cannot see a client address and the function authorizes nothing by
-- design. But the anon key ships to every browser, so anybody could call
-- /rest/v1/rpc/submit_franchise_inquiry directly and never meet that limit.
-- Found in the pre-launch audit of 2026-10-15.
--
-- The fix is to make the server the only caller. The Server Action already
-- runs the limit and then calls this; it now calls it with the service role,
-- and anon and authenticated lose the grant. Nothing about the function itself
-- changes. Same grant shape as rate_limit_hit and resolve_active_staff_email,
-- the other functions only the server may reach.

revoke execute on function
  submit_franchise_inquiry(text, text, text, text, text) from public, anon, authenticated;

grant execute on function
  submit_franchise_inquiry(text, text, text, text, text) to service_role;
