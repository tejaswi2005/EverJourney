// init/sampleData/users.js
const { v4: uuidv4 } = require("uuid");

// NOTE: password fields here are plain placeholders. Hash them before inserting into production DB.
const users = [
  {
    _id: uuidv4(),
    name: "Tejaswi Shinde",
    email: "tejaswi@example.com",
    phone: "9123456780",
    password: "password123", // hash before saving
    address: "123 College Road, Pune, Maharashtra",
    pastBookings: [] // push SQL booking_id strings later
  },
  {
    _id: uuidv4(),
    name: "Amit Sharma",
    email: "amit@example.com",
    phone: "9876501234",
    password: "password123",
    address: "45 MG Road, Mumbai",
    pastBookings: []
  },
  {
    _id: uuidv4(),
    name: "Nisha Patel",
    email: "nisha@example.com",
    phone: "9988776655",
    password: "password123",
    address: "78 Residency Lane, Ahmedabad",
    pastBookings: []
  }
];

export default users;
