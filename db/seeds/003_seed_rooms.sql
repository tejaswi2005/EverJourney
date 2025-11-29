-- ROOMS (5)
INSERT INTO rooms (hotel_id, room_type, bed_type, title, description, base_price, currency, total_units, max_guests)
SELECT id, 'DOUBLE','QUEEN','Deluxe Queen Room','Spacious room with balcony',4500,'INR',10,2 FROM hotels LIMIT 5;

-- ROOM INVENTORY (5 dates)
INSERT INTO room_inventory (room_id, date, available, price, currency)
SELECT r.id, CURRENT_DATE + (g::int), 10, (r.base_price + (g*200)), 'INR'
FROM rooms r, generate_series(0,4) g;
