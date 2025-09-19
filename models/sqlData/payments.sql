CREATE TABLE payments (
  payment_id INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT,
  amount DECIMAL(10,2),
  method ENUM('razorpay','paypal','stripe','card','upi'),
  status ENUM('success','failed','pending') DEFAULT 'pending',
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
);
