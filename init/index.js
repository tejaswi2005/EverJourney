// const mongoose = require("mongoose");
// const mysql = require("mysql2/promise");

// // MongoDB connection
// async function connectMongo() {
//   try {
//     await mongoose.connect("mongodb://127.0.0.1:27017/travelApp", {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//     });
//     console.log("✅ MongoDB connected");
//   } catch (err) {
//     console.error("❌ MongoDB connection error:", err);
//   }
// }

// // MySQL connection + table creation
// async function connectMySQL() {
//   try {
//     const db = await mysql.createConnection({
//       host: "localhost",
//       user: "root",
//       password: "yourpassword",
//       database: "travelApp",
//     });

//     console.log("✅ MySQL connected");

//     // Create Hotels Table
//     await db.execute(`
//       CREATE TABLE IF NOT EXISTS hotels (
//         hotel_id INT AUTO_INCREMENT PRIMARY KEY,
//         name VARCHAR(255) NOT NULL,
//         location VARCHAR(255),
//         city VARCHAR(100),
//         state VARCHAR(100),
//         country VARCHAR(100),
//         address TEXT,
//         pin_code VARCHAR(20),
//         latitude DECIMAL(10,6),
//         longitude DECIMAL(10,6),
//         contact_phone VARCHAR(20),
//         contact_email VARCHAR(100),
//         website VARCHAR(255),
//         type ENUM('budget','luxury','resort','boutique','homestay'),
//         star_rating INT
//       )
//     `);

//     // Create Rooms Table
//     await db.execute(`
//       CREATE TABLE IF NOT EXISTS rooms (
//         room_id INT AUTO_INCREMENT PRIMARY KEY,
//         hotel_id INT,
//         type ENUM('single','double','suite','deluxe'),
//         amenities TEXT,
//         price_per_night DECIMAL(10,2),
//         occupancy INT,
//         photos JSON,
//         availability JSON,
//         FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE
//       )
//     `);

//     // Create Cabs Table
//     await db.execute(`
//       CREATE TABLE IF NOT EXISTS cabs (
//         cab_id INT AUTO_INCREMENT PRIMARY KEY,
//         vehicle_type ENUM('sedan','SUV','hatchback','tempo_traveler','luxury_car'),
//         brand VARCHAR(100),
//         model VARCHAR(100),
//         capacity INT,
//         ac BOOLEAN,
//         price_per_km DECIMAL(10,2),
//         price_per_hour DECIMAL(10,2),
//         availability BOOLEAN DEFAULT TRUE
//       )
//     `);

//     // Create Drivers Table
//     await db.execute(`
//       CREATE TABLE IF NOT EXISTS drivers (
//         driver_id INT AUTO_INCREMENT PRIMARY KEY,
//         name VARCHAR(100),
//         license_number VARCHAR(50) UNIQUE,
//         contact_phone VARCHAR(20),
//         rating DECIMAL(2,1)
//       )
//     `);

//     // Create Bookings Table
//     await db.execute(`
//       CREATE TABLE IF NOT EXISTS bookings (
//         booking_id INT AUTO_INCREMENT PRIMARY KEY,
//         user_id VARCHAR(255), -- MongoDB ObjectId as string
//         hotel_id INT NULL,
//         room_id INT NULL,
//         cab_id INT NULL,
//         driver_id INT NULL,
//         booking_date DATETIME DEFAULT CURRENT_TIMESTAMP,
//         check_in DATE,
//         check_out DATE,
//         travel_date DATE,
//         payment_status ENUM('pending','paid','refunded') DEFAULT 'pending',
//         total_amount DECIMAL(10,2),
//         FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE SET NULL,
//         FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE SET NULL,
//         FOREIGN KEY (cab_id) REFERENCES cabs(cab_id) ON DELETE SET NULL,
//         FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE SET NULL
//       )
//     `);

//     // Create Payments Table
//     await db.execute(`
//       CREATE TABLE IF NOT EXISTS payments (
//         payment_id INT AUTO_INCREMENT PRIMARY KEY,
//         booking_id INT,
//         amount DECIMAL(10,2),
//         status ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
//         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//         FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
//       )
//     `);

//     console.log("✅ All SQL tables ensured");
//   } catch (err) {
//     console.error("❌ MySQL connection error:", err);
//   }
// }

// // Run both
// (async () => {
//   await connectMongo();
//   await connectMySQL();
// })();








// init/index.js
import mysql from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import hotelsData from "./sampleData/hotels.js";
import cabsData from "./sampleData/cabs.js";
import roomsData from "./sampleData/rooms.js";
import queriesData from "./sampleData/queries.js";


// 1. Create connection and insert data
async function insertData() {
  const pool = await mysql.createPool({
    host: "localhost",
    user: "root",
    password: "Coder@132005",
    database: "everjourney", // replace with your DB name
  });

  // 2. Insert Hotels
  async function insertHotels() {
    for (const hotel of hotelsData) {
      await pool.query(
        `INSERT INTO hotels (id, name, location, address, contact, type, star_rating) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          hotel.name,
          hotel.location,
          hotel.address,
          hotel.contact,
          hotel.type,
          hotel.star_rating,
        ]
      );
    }
    console.log("✅ Hotels inserted");
  }

  // 3. Insert Cabs
  async function insertCabs() {
    for (const cab of cabsData) {
      await pool.query(
        `INSERT INTO cabs (id, cab_type, capacity, price_per_km, driver_id) 
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), cab.cab_type, cab.capacity, cab.price_per_km, cab.driver_id]
      );
    }
    console.log("✅ Cabs inserted");
  }

  // 4. Insert Rooms
  async function insertRooms() {
    for (const room of roomsData) {
      await pool.query(
        `INSERT INTO rooms (id, hotel_id, room_type, price, availability) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          room.hotel_id,
          room.type,
          room.amenities,
          room.price_per_night,
          room.occupancy,
          room.photos,
          room.availability
        ]
      );
    }
    console.log("✅ Rooms inserted");
  }

  async function insertFAQs() {
  for (const queries of queriesData) {
    await pool.query(
      `INSERT INTO faqs (question, answer) VALUES (?, ?)`,
      [queries.question, queries.answer]
    );
  }
  console.log("✅ FAQs inserted");
}

  // Run all inserts
  try {
    // await insertHotels();
    // await insertCabs();
    // await insertRooms();
    insertFAQs()
    console.log("All sample data inserted successfully!");
    process.exit();
  } catch (err) {
    console.error("Error inserting data:", err);
    process.exit(1);
  }
}

// Run seeder
insertData();

