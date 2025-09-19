// init/sampleData/reviews.js
// Reviews stored in MongoDB but reference SQL entity IDs (hotel_id / room_id / cab_id)
const reviews = [
  {
    // userId should match some user._id from users.js
    userId: "<replace-with-user-uuid>", 
    entityType: "hotel",
    entityId: 1, // SQL hotel_id
    rating: 4,
    comment: "Nice location and helpful staff."
  },
  {
    userId: "<replace-with-user-uuid>",
    entityType: "room",
    entityId: 2, // SQL room_id
    rating: 5,
    comment: "Spacious room and clean linens."
  },
  {
    userId: "<replace-with-user-uuid>",
    entityType: "cab",
    entityId: 1, // SQL cab_id
    rating: 4,
    comment: "Driver was punctual and polite."
  }
];

export default reviews;
