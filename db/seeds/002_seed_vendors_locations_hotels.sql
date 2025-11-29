-- LOCATIONS
INSERT INTO locations (country, state, city, area, latitude, longitude) VALUES
('India','Maharashtra','Pune','Shivajinagar',18.5204,73.8567),
('India','Goa','Panaji','Campal',15.4909,73.8278),
('India','Delhi','New Delhi','Connaught Place',28.6139,77.2090),
('India','Karnataka','Bengaluru','Indiranagar',12.9716,77.5946),
('India','Rajasthan','Jaipur','C-Scheme',26.9124,75.7873);

-- AMENITIES
INSERT INTO amenities (code,label) VALUES
('WIFI','Free Wi-Fi'),
('POOL','Swimming Pool'),
('PARK','Parking'),
('AC','Air Conditioning'),
('BREAKFAST','Complimentary Breakfast');

-- HOTELS (5)
INSERT INTO hotels (vendor_id, name, description, location_id, address, star_rating, checkin_time, checkout_time, is_active)
SELECT
  (SELECT id FROM vendors LIMIT 1),
  'Ocean View Resort','Beachside resort with sea view', l.id,'Goa Beach Road',4.5,TIME '14:00',TIME '11:00',TRUE
FROM locations l WHERE city='Panaji'
UNION ALL
SELECT (SELECT id FROM vendors OFFSET 1 LIMIT 1),
  'Hilltop Retreat','Luxury stay with mountain views', l.id,'Shimla Hills',5.0,TIME '13:00',TIME '11:00',TRUE
FROM locations l WHERE city='Jaipur'
UNION ALL
SELECT (SELECT id FROM vendors LIMIT 1),
  'City Comfort Inn','Affordable business hotel', l.id,'MG Road',3.5,TIME '14:00',TIME '11:00',TRUE
FROM locations l WHERE city='Bengaluru'
UNION ALL
SELECT (SELECT id FROM vendors LIMIT 1),
  'Sunrise Suites','Elegant stay for families', l.id,'Main Street',4.0,TIME '14:00',TIME '11:00',TRUE
FROM locations l WHERE city='Pune'
UNION ALL
SELECT (SELECT id FROM vendors OFFSET 1 LIMIT 1),
  'Royal Palace','5-star luxury hotel', l.id,'Connaught Circle',5.0,TIME '13:00',TIME '11:00',TRUE
FROM locations l WHERE city='New Delhi';
