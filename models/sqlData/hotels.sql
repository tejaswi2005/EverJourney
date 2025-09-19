CREATE TABLE hotels (
    hotel_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    address TEXT,
    pin_code VARCHAR(20),
    latitude DECIMAL(10, 6),
    longitude DECIMAL(10, 6),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    website VARCHAR(255),
    type ENUM('budget', 'luxury', 'resort', 'boutique', 'homestay'),
    star_rating INT
);
