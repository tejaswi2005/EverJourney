import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    entityType: { type: String, enum: ["hotel", "room", "cab", "driver"], required: true },
    entityId: { type: Number, required: true }, // from SQL (hotel_id, cab_id, etc.)
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Review", reviewSchema);
