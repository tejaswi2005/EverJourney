-- Reviews
CREATE TABLE reviews (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id   BIGINT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  rating     INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title      VARCHAR(120),
  body       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_hotel_review UNIQUE (user_id, hotel_id)
);

-- Favorites / Wishlists
CREATE TABLE favorites (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id BIGINT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, hotel_id)
);
