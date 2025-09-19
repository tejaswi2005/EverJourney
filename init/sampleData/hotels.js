// init/sampleData/hotels.js
// hotel_id must map to SQL table auto-increment IDs if you insert them manually.
const hotels = [
  {
    hotel_id: 1,
    name: "EverJourney Resort",
    location: "Marine Drive",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    address: "123 Beach Road, Marine Drive",
    pin_code: "400001",
    latitude: 19.0228,
    longitude: 72.8170,
    contact_phone: "02212345678",
    contact_email: "info@everjourney.com",
    website: "https://everjourney.example",
    type: "resort",
    star_rating: 5
  },
  {
    hotel_id: 2,
    name: "Sunny Stay Hotel",
    location: "Camp",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    address: "45 Central Road, Camp",
    pin_code: "411001",
    latitude: 18.5196,
    longitude: 73.8553,
    contact_phone: "02012345678",
    contact_email: "contact@sunnystay.example",
    website: "https://sunnystay.example",
    type: "budget",
    star_rating: 3
  }
];

export default hotels;
