CREATE TABLE drivers (
  driver_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  license_number VARCHAR(50) UNIQUE,
  phone VARCHAR(20),
);
