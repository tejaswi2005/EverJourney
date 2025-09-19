// init/sampleData/bookings.js
// booking_id are provided here for easier insertion mapping.
// user_id must be the UUID string from users.js (replace placeholders).
const bookings = [
  {
    booking_id: 1,
    user_id: "<replace-with-user-uuid>", // e.g. users[0]._id
    hotel_id: 1,
    room_id: 1,
    cab_id: null,
    driver_id: null,
    booking_date: new Date().toISOString(),
    check_in: "2025-10-10",
    check_out: "2025-10-12",
    travel_date: null,
    payment_status: "pending",
    total_amount: 15000.00
  },
  {
    booking_id: 2,
    user_id: "<replace-with-user-uuid>",
    hotel_id: null,
    room_id: null,
    cab_id: 2,
    driver_id: 2,
    booking_date: new Date().toISOString(),
    check_in: null,
    check_out: null,
    travel_date: "2025-11-05",
    payment_status: "pending",
    total_amount: 4500.00
  }
];

export default bookings;
