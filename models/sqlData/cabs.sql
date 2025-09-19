CREATE TABLE cabs (
    cab_id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_type ENUM('sedan', 'SUV', 'hatchback', 'tempo_traveler', 'luxury_car'),
    brand VARCHAR(100),
    model VARCHAR(100),
    capacity INT,
    ac BOOLEAN,
    price_per_km DECIMAL(10,2),
    price_per_hour DECIMAL(10,2),
    availability BOOLEAN DEFAULT TRUE
);
