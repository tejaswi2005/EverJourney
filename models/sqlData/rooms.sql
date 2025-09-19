CREATE TABLE rooms (
    room_id INT AUTO_INCREMENT PRIMARY KEY,
    hotel_id INT,
    type ENUM('single', 'double', 'suite', 'deluxe'),
    amenities TEXT,
    price_per_night DECIMAL(10,2),
    occupancy INT,
    photos JSON,
    availability BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE
);
