-- PACKAGES
INSERT INTO packages (title, description, price, currency, duration_days)
VALUES
('Goa Getaway','3N/4D Beachside Stay',15000,'INR',4),
('Himalayan Escape','5N/6D Hill Adventure',30000,'INR',6),
('Royal Rajasthan','4N/5D Heritage Tour',25000,'INR',5),
('City Lights','2N/3D Urban Experience',12000,'INR',3),
('South Serenity','3N/4D Coastal Journey',18000,'INR',4);

-- TRANSPORTS
INSERT INTO transports (mode, src, dest, depart_ts, arrive_ts, price, currency)
VALUES
('FLIGHT','Mumbai','Goa',CURRENT_TIMESTAMP + INTERVAL '1 day',CURRENT_TIMESTAMP + INTERVAL '1 day 1 hour',5500,'INR'),
('TRAIN','Delhi','Jaipur',CURRENT_TIMESTAMP + INTERVAL '2 days',CURRENT_TIMESTAMP + INTERVAL '2 days 5 hours',1200,'INR'),
('BUS','Pune','Bengaluru',CURRENT_TIMESTAMP + INTERVAL '3 days',CURRENT_TIMESTAMP + INTERVAL '3 days 12 hours',800,'INR'),
('FLIGHT','Goa','Delhi',CURRENT_TIMESTAMP + INTERVAL '4 days',CURRENT_TIMESTAMP + INTERVAL '4 days 2 hours',6000,'INR'),
('FLIGHT','Delhi','Goa',CURRENT_TIMESTAMP + INTERVAL '5 days',CURRENT_TIMESTAMP + INTERVAL '5 days 2 hours',6000,'INR');
