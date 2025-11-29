-- ENUM types (create these BEFORE any table uses them)
CREATE TYPE user_role       AS ENUM ('ADMIN','VENDOR','CUSTOMER');
CREATE TYPE gender_type     AS ENUM ('MALE','FEMALE','OTHER','UNSPECIFIED');
CREATE TYPE room_type       AS ENUM ('SINGLE','DOUBLE','TWIN','SUITE','FAMILY','DORM');
CREATE TYPE bed_type        AS ENUM ('SINGLE','DOUBLE','QUEEN','KING','BUNK','SOFA');
CREATE TYPE booking_status  AS ENUM ('PENDING','CONFIRMED','CANCELLED','COMPLETED','FAILED','REFUNDED');
CREATE TYPE payment_status  AS ENUM ('INITIATED','SUCCESS','FAILED','REFUNDED','PARTIAL');
CREATE TYPE transport_mode  AS ENUM ('BUS','TRAIN','FLIGHT');
CREATE TYPE currency_code   AS ENUM ('INR','USD','EUR','GBP','JPY','AED');

-- Extensions (must be pre-installed by superuser; you already did this)
-- Keep these lines harmless with IF NOT EXISTS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
