-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Order statuses (extensible lookup table)
create table order_statuses (
  id   serial primary key,
  name text not null unique
);

insert into order_statuses (name) values
  ('Đã hoàn thành'),
  ('Đã hủy');

-- Reports (monthly containers)
create table reports (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Clients
create table clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Commission % per client per report
create table report_clients (
  id                 uuid primary key default gen_random_uuid(),
  report_id          uuid not null references reports(id) on delete cascade,
  client_id          uuid not null references clients(id) on delete cascade,
  commission_percent integer not null default 50,
  unique (report_id, client_id)
);

-- Orders
create table orders (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references reports(id) on delete cascade,
  order_id     text not null,
  product_name text,
  status_id    integer not null references order_statuses(id),
  commission   bigint not null default 0,
  ordered_at   timestamptz not null,
  client_id    uuid references clients(id) on delete set null,
  is_manual    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (report_id, order_id)
);

create index on orders(report_id);
create index on orders(client_id);
create index on report_clients(client_id);
