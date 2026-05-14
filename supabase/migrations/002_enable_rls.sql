-- Lock down all public tables.
-- This app has no auth and all DB access goes through Next.js Server Actions
-- using the service_role key (which bypasses RLS). Enabling RLS with no
-- policies denies anon/authenticated access via the Data API.

alter table order_statuses enable row level security;
alter table reports        enable row level security;
alter table clients        enable row level security;
alter table report_clients enable row level security;
alter table orders         enable row level security;
