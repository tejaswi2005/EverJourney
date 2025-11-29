-- BOOKINGS (5)
INSERT INTO bookings (user_id, hotel_id, room_id, checkin_date, checkout_date, status, total_amount, currency)
SELECT
  (SELECT id FROM users ORDER BY random() LIMIT 1),
  h.id,
  (SELECT id FROM rooms WHERE hotel_id=h.id LIMIT 1),
  CURRENT_DATE + 1,
  CURRENT_DATE + 3,
  'CONFIRMED',
  9000,
  'INR'
FROM hotels h LIMIT 5;

-- PAYMENTS
INSERT INTO payments (booking_id, status, amount, currency, method, reference)
SELECT b.id, 'SUCCESS', b.total_amount, 'INR', 'CARD', 'TXN-' || floor(random()*10000)
FROM bookings b LIMIT 5;
