-- USERS (5)
INSERT INTO users (id, role, full_name, email, phone, gender, password_hash, is_verified)
VALUES
  (uuid_generate_v4(), 'CUSTOMER', 'Tejaswi Shinde', 'tejaswi@example.com', '9999911111', 'FEMALE', 'hashed_pw1', TRUE),
  (uuid_generate_v4(), 'CUSTOMER', 'Vishakha Yeole', 'vishakha@example.com', '9999922222', 'FEMALE', 'hashed_pw2', TRUE),
  (uuid_generate_v4(), 'CUSTOMER', 'Khushi Mulla', 'khushi@example.com', '9999933333', 'FEMALE', 'hashed_pw3', TRUE),
  (uuid_generate_v4(), 'VENDOR', 'Hotel Owner', 'vendor1@example.com', '9999944444', 'MALE', 'hashed_pw4', TRUE),
  (uuid_generate_v4(), 'ADMIN', 'System Admin', 'admin@example.com', '9999955555', 'OTHER', 'hashed_pw5', TRUE);

-- USER ADDRESSES (5)
INSERT INTO user_addresses (user_id, line1, city, state, country, postal_code, is_default)
SELECT id, '123 Street', 'Pune', 'Maharashtra', 'India', '411001', TRUE FROM users LIMIT 5;

-- VENDORS (2)
INSERT INTO vendors (id, user_id, company_name, gstin, pan, verified)
SELECT uuid_generate_v4(), id, 'Goa Stays Pvt Ltd', 'GSTIN12345', 'ABCDE1234F', TRUE
FROM users WHERE role = 'VENDOR'
UNION ALL
SELECT uuid_generate_v4(), id, 'Himalaya Travels', 'GSTIN98765', 'XYZAB6789C', TRUE
FROM users WHERE email = 'admin@example.com'; -- treat admin as vendor for demo
