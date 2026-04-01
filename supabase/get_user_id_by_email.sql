-- RPC function: look up a user's id by email (for household invite flow)
-- Run this in the Supabase SQL editor to create the function.

create or replace function get_user_id_by_email(lookup_email text)
returns uuid
language sql
security definer
as $$
  select id from auth.users where email = lower(lookup_email) limit 1;
$$;
