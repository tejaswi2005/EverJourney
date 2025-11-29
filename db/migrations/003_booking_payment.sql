-- Bookings
CREATE TABLE bookings (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  hotel_id        BIGINT REFERENCES hotels(id) ON DELETE RESTRICT,
  room_id         BIGINT REFERENCES rooms(id) ON DELETE RESTRICT,
  -- for transport-only bookings, hotel_id/room_id will be NULL; see transport_booking_legs
  checkin_date    DATE,
  checkout_date   DATE,
  guests          INT CHECK (guests > 0),
  subtotal_amount NUMERIC(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  currency        currency_code NOT NULL DEFAULT 'INR',
  status          booking_status NOT NULL DEFAULT 'PENDING',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT
);

-- Booking room-night allocations (to reduce inventory)
CREATE TABLE booking_nights (
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  room_id    BIGINT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  date       DATE NOT NULL,
  qty        INT  NOT NULL CHECK (qty > 0),
  PRIMARY KEY (booking_id, room_id, date)
);

-- Payments
CREATE TABLE payments (
  id               BIGSERIAL PRIMARY KEY,
  booking_id       BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider         VARCHAR(40) NOT NULL, -- e.g. razorpay, stripe
  provider_ref     VARCHAR(120),         -- gateway payment id
  amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency         currency_code NOT NULL DEFAULT 'INR',
  status           payment_status NOT NULL DEFAULT 'INITIATED',
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refund_ref       VARCHAR(120),
  meta             JSONB DEFAULT '{}'
);

CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);
