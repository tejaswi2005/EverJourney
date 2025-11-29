-- 006_search_views.sql

-- Flattened search view for hotels (fast list page)
DROP MATERIALIZED VIEW IF EXISTS mv_hotel_search;

CREATE MATERIALIZED VIEW mv_hotel_search AS
SELECT
  h.id AS hotel_id,
  h.name,
  h.star_rating,
  l.city,
  l.state,
  l.country,
  COALESCE(
    /* min forward-looking price if inventory exists */
    (
      SELECT MIN(ri.price)
      FROM rooms r
      JOIN room_inventory ri
        ON ri.room_id = r.id
       AND ri.date >= CURRENT_DATE
      WHERE r.hotel_id = h.id
    ),
    /* otherwise fall back to the cheapest room's base_price */
    (
      SELECT MIN(r.base_price)
      FROM rooms r
      WHERE r.hotel_id = h.id
    )
  ) AS min_price,
  ARRAY(
    SELECT a.code
    FROM hotel_amenities ha
    JOIN amenities a ON a.id = ha.amenity_id
    WHERE ha.hotel_id = h.id
    ORDER BY a.code
  ) AS amenity_codes
FROM hotels h
JOIN locations l ON l.id = h.location_id
WHERE h.is_active = TRUE;

-- A unique index is required to use REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS mv_hotel_search_pk ON mv_hotel_search(hotel_id);
CREATE INDEX IF NOT EXISTS mv_hotel_search_city ON mv_hotel_search(city);
CREATE INDEX IF NOT EXISTS mv_hotel_search_min_price ON mv_hotel_search(min_price);

-- Refresh helper function
CREATE OR REPLACE FUNCTION refresh_mv_hotel_search()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hotel_search;
END $$;
