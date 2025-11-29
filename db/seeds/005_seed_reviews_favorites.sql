-- REVIEWS
INSERT INTO reviews (user_id, hotel_id, rating, title, body)
SELECT
  (SELECT id FROM users ORDER BY random() LIMIT 1),
  h.id,
  floor(random()*2)+4,
  'Amazing stay',
  'Loved the ambience and service'
FROM hotels h LIMIT 5;

-- FAVORITES
INSERT INTO favorites (user_id, hotel_id)
SELECT
  (SELECT id FROM users ORDER BY random() LIMIT 1),
  h.id
FROM hotels h LIMIT 5;
