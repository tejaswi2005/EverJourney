// init/sampleData/rooms.js
const rooms = [
  {
    room_id: 1,
    hotel_id: '3c91a531-e63b-4bf4-b699-d657decc13f', // EverJourney Resort
    type: "suite",
    amenities: JSON.stringify(["WiFi", "AC", "Breakfast", "TV"]),
    price_per_night: 7500.00,
    occupancy: 3,
    photos: JSON.stringify(["/images/hotels/1/room1.jpg"]),
    availability: JSON.stringify({ from: null, to: null }) // keep flexible
  },
  {
    room_id: 2,
    hotel_id: '3c91a531-e63b-4bf4-b699-d657decc13f',
    type: "double",
    amenities: JSON.stringify(["WiFi", "AC", "TV"]),
    price_per_night: 4500.00,
    occupancy: 2,
    photos: JSON.stringify(["/images/hotels/1/room2.jpg"]),
    availability: JSON.stringify({ from: null, to: null })
  },
  {
    room_id: 3,
    hotel_id: '3c91a531-e63b-4bf4-b699-d657decc13f', // Sunny Stay Hotel
    type: "double",
    amenities: JSON.stringify(["WiFi", "AC"]),
    price_per_night: 2500.00,
    occupancy: 2,
    photos: JSON.stringify(["/images/hotels/2/room1.jpg"]),
    availability: JSON.stringify({ from: null, to: null })
  },
  {
    room_id: 4,
    hotel_id: '3c91a531-e63b-4bf4-b699-d657decc13f',
    type: "single",
    amenities: JSON.stringify(["WiFi"]),
    price_per_night: 1500.00,
    occupancy: 1,
    photos: JSON.stringify(["/images/hotels/2/room2.jpg"]),
    availability: JSON.stringify({ from: null, to: null })
  }
];

export default rooms;
