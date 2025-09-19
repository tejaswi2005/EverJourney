CREATE TABLE bookings (
  booking_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL, -- MongoDB _id stored as string
  hotel_id INT,
  room_id INT,
  cab_id INT,
  booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  checkin_date DATE,
  checkout_date DATE,
  pickup_location VARCHAR(255),
  drop_location VARCHAR(255),
  pickup_datetime DATETIME,
  total_amount DECIMAL(10,2),
  payment_status ENUM('pending','paid','refunded') DEFAULT 'pending',
  FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id),
  FOREIGN KEY (cab_id) REFERENCES cabs(cab_id)
);
