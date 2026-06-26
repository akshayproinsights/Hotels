-- ──────────────────────────────────────────
-- EXTENSIONS
-- ──────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists btree_gist; -- required for EXCLUDE constraint

-- ──────────────────────────────────────────
-- ROOMS
-- ──────────────────────────────────────────
create table rooms (
  id              uuid primary key default uuid_generate_v4(),
  number          text not null unique,
  floor           int  not null,
  room_type       text not null check (room_type in (
                    'AC Deluxe', 'Non AC Deluxe',
                    'AC Standard', 'Non AC Standard')),
  base_price      numeric(10,2) not null,
  extra_bed_price numeric(10,2) not null default 500,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────
-- GUESTS
-- ──────────────────────────────────────────
create table guests (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  phone        text not null unique,
  email        text,
  address      text,
  age          int,
  last_visit   date,
  total_visits int  not null default 0,
  created_at   timestamptz not null default now()
);

-- ──────────────────────────────────────────
-- BOOKINGS
-- ──────────────────────────────────────────
create table bookings (
  id              uuid primary key default uuid_generate_v4(),
  booking_number  text not null unique,         -- e.g. SP-0001, auto-generated
  room_id         uuid not null references rooms(id),
  guest_id        uuid not null references guests(id),
  check_in        timestamptz not null,
  check_out       timestamptz not null,
  adults          int  not null default 1,
  children        int  not null default 0,
  extra_beds      int  not null default 0,
  room_price      numeric(10,2) not null,        -- price per night at time of booking
  extra_bed_total numeric(10,2) not null default 0,
  total_amount    numeric(10,2) not null,
  paid_amount     numeric(10,2) not null default 0,
  payment_mode    text check (payment_mode in ('Cash', 'UPI', 'Pending')),
  payment_status  text not null default 'unpaid'
                  check (payment_status in ('paid', 'unpaid', 'partial', 'hold')),
  deposit_amount  numeric(10,2) default 0,
  occupation      text,
  notes           text,
  status          text not null default 'active'
                  check (status in ('active', 'checked_out', 'cancelled')),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Prevents double-booking same room for overlapping dates
  constraint no_overlap
    exclude using gist (
      room_id with =,
      tstzrange(check_in, check_out, '[)') with &&
    ) where (status = 'active')
);

-- ──────────────────────────────────────────
-- DOCUMENTS (guest ID proofs)
-- ──────────────────────────────────────────
create table documents (
  id          uuid primary key default uuid_generate_v4(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  guest_id    uuid not null references guests(id),
  r2_key      text not null,           -- e.g. docs/2026/06/booking-uuid/aadhar.jpg
  file_name   text not null,
  doc_type    text not null default 'id_proof',
  uploaded_at timestamptz not null default now()
);

-- ──────────────────────────────────────────
-- ROW LEVEL SECURITY (all authenticated staff can read/write)
-- ──────────────────────────────────────────
alter table rooms     enable row level security;
alter table guests    enable row level security;
alter table bookings  enable row level security;
alter table documents enable row level security;

create policy "staff_all" on rooms     for all to authenticated using (true) with check (true);
create policy "staff_all" on guests    for all to authenticated using (true) with check (true);
create policy "staff_all" on bookings  for all to authenticated using (true) with check (true);
create policy "staff_all" on documents for all to authenticated using (true) with check (true);

-- ──────────────────────────────────────────
-- INDEXES
-- ──────────────────────────────────────────
create index idx_bookings_room_dates on bookings(room_id, check_in, check_out);
create index idx_bookings_status     on bookings(status);
create index idx_bookings_dates      on bookings(check_in, check_out);
create index idx_guests_phone        on guests(phone);

-- ──────────────────────────────────────────
-- AUTO-UPDATE updated_at
-- ──────────────────────────────────────────
create or replace function fn_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_bookings_updated_at
  before update on bookings
  for each row execute function fn_updated_at();

-- ──────────────────────────────────────────
-- AUTO-GENERATE booking_number (SP-0001 format)
-- ──────────────────────────────────────────
create sequence booking_seq start 1;

create or replace function fn_booking_number()
returns trigger language plpgsql as $$
begin
  new.booking_number := 'SP-' || lpad(nextval('booking_seq')::text, 4, '0');
  return new;
end;
$$;

create trigger trg_booking_number
  before insert on bookings
  for each row execute function fn_booking_number();
