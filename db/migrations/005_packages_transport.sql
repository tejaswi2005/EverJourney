-- Travel packages (hotel + transport + activities)
CREATE TABLE packages (
  id            BIGSERIAL PRIMARY KEY,
  vendor_id     UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  title         VARCHAR(160) NOT NULL,
  description   TEXT,
  origin_loc_id BIGINT REFERENCES locations(id),
  dest_loc_id   BIGINT NOT NULL REFERENCES locations(id),
  nights        INT NOT NULL CHECK (nights > 0),
  base_price    NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  currency      currency_code NOT NULL DEFAULT 'INR',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Package inclusions (hotel stay, meals, sightseeing, etc.)
CREATE TABLE package_inclusions (
  id          BIGSERIAL PRIMARY KEY,
  package_id  BIGINT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  label       VARCHAR(160) NOT NULL
);

-- Transport listings (generic across modes)
CREATE TABLE transports (
  id            BIGSERIAL PRIMARY KEY,
  vendor_id     UUID REFERENCES vendors(id) ON DELETE SET NULL,
  mode          transport_mode NOT NULL,
  operator_name VARCHAR(120) NOT NULL, -- Airline/Train/Bus operator
  code          VARCHAR(20),           -- flight no / train no / bus code
  origin_loc_id BIGINT NOT NULL REFERENCES locations(id),
  dest_loc_id   BIGINT NOT NULL REFERENCES locations(id),
  departure_ts  TIMESTAMPTZ NOT NULL,
  arrival_ts    TIMESTAMPTZ NOT NULL,
  base_price    NUMERIC(12,2) NOT NULL CHECK (base_price >= 0),
  currency      currency_code NOT NULL DEFAULT 'INR',
  seats_total   INT NOT NULL CHECK (seats_total > 0),
  seats_left    INT NOT NULL CHECK (seats_left >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- If a booking is transport-only or a package, we record legs
CREATE TABLE transport_booking_legs (
  id           BIGSERIAL PRIMARY KEY,
  booking_id   BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  transport_id BIGINT NOT NULL REFERENCES transports(id) ON DELETE RESTRICT,
  seat_qty     INT NOT NULL CHECK (seat_qty > 0),
  price        NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  currency     currency_code NOT NULL DEFAULT 'INR'
);

-- Packages ↔ hotels / rooms mapping (optional specific hotels)
CREATE TABLE package_hotels (
  package_id BIGINT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  hotel_id   BIGINT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  nights     INT NOT NULL CHECK (nights > 0),
  PRIMARY KEY (package_id, hotel_id)
);

-- Packages ↔ transports (recommended/optional legs)
CREATE TABLE package_transports (
  package_id  BIGINT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  transport_id BIGINT NOT NULL REFERENCES transports(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, transport_id)
);
