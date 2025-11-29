-- 002_core_tables.sql  (PostgreSQL-only, no CREATE TYPE / CREATE EXTENSION here)

-- Users & authentication
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role          user_role NOT NULL DEFAULT 'CUSTOMER',
  full_name     VARCHAR(120) NOT NULL,
  email         CITEXT UNIQUE NOT NULL,
  phone         VARCHAR(20),
  gender        gender_type DEFAULT 'UNSPECIFIED',
  password_hash TEXT NOT NULL,
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_addresses (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line1        VARCHAR(200) NOT NULL,
  line2        VARCHAR(200),
  city         VARCHAR(80) NOT NULL,
  state        VARCHAR(80),
  country      VARCHAR(80) NOT NULL,
  postal_code  VARCHAR(20),
  is_default   BOOLEAN NOT NULL DEFAULT FALSE
);

-- Vendors (hotel owners / travel partners)
CREATE TABLE IF NOT EXISTS vendors (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(150) NOT NULL,
  gstin        VARCHAR(20),
  pan          VARCHAR(15),
  verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Locations (normalize for search/filter)
CREATE TABLE IF NOT EXISTS locations (
  id           BIGSERIAL PRIMARY KEY,
  country      VARCHAR(80) NOT NULL,
  state        VARCHAR(80),
  city         VARCHAR(80) NOT NULL,
  area         VARCHAR(120),
  latitude     NUMERIC(9,6),
  longitude    NUMERIC(9,6)
  -- ❌ Do NOT put UNIQUE with expressions here
);

-- ✅ Unique *index* on expressions instead of a table constraint
-- This enforces uniqueness on (country, coalesce(state,''), city, coalesce(area,''))
CREATE UNIQUE INDEX IF NOT EXISTS uq_loc
  ON locations (country, (COALESCE(state, '')), city, (COALESCE(area, '')));

-- Hotels
CREATE TABLE IF NOT EXISTS hotels (
  id            BIGSERIAL PRIMARY KEY,
  vendor_id     UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  name          VARCHAR(160) NOT NULL,
  description   TEXT,
  location_id   BIGINT NOT NULL REFERENCES locations(id),
  address       VARCHAR(220) NOT NULL,
  star_rating   NUMERIC(2,1) CHECK (star_rating BETWEEN 0 AND 5),
  checkin_time  TIME DEFAULT '14:00',
  checkout_time TIME DEFAULT '11:00',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hotel amenities (tag-like)
CREATE TABLE IF NOT EXISTS amenities (
  id         SMALLSERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,  -- e.g. WIFI, PARKING, POOL
  label      VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS hotel_amenities (
  hotel_id   BIGINT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  amenity_id SMALLINT NOT NULL REFERENCES amenities(id) ON DELETE RESTRICT,
  PRIMARY KEY (hotel_id, amenity_id)
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id            BIGSERIAL PRIMARY KEY,
  hotel_id      BIGINT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type     room_type NOT NULL,
  bed_type      bed_type NOT NULL,
  title         VARCHAR(160),
  description   TEXT,
  base_price    NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  currency      currency_code NOT NULL DEFAULT 'INR',
  total_units   INT NOT NULL CHECK (total_units >= 0),
  max_guests    INT NOT NULL CHECK (max_guests > 0),
  is_refundable BOOLEAN NOT NULL DEFAULT TRUE
);

-- Room images
CREATE TABLE IF NOT EXISTS room_images (
  id        BIGSERIAL PRIMARY KEY,
  room_id   BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  url       TEXT NOT NULL,
  position  INT NOT NULL DEFAULT 1
);

-- Per-day inventory & price (dynamic pricing)
CREATE TABLE IF NOT EXISTS room_inventory (
  room_id     BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  available   INT  NOT NULL CHECK (available >= 0),
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  currency    currency_code NOT NULL DEFAULT 'INR',
  PRIMARY KEY (room_id, date)
);

-- Indexes for search
CREATE INDEX IF NOT EXISTS idx_hotels_loc ON hotels(location_id);
CREATE INDEX IF NOT EXISTS idx_hotels_name_trgm ON hotels USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rooms_price ON rooms(base_price);
CREATE INDEX IF NOT EXISTS idx_room_inventory_date ON room_inventory(date);
