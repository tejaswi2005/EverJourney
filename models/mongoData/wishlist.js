import mongoose from "mongoose";

const wishlistSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [{
    entity_type: { type: String, enum: ["hotel", "room", "cab"], required: true },
    entity_id: { type: Number, required: true } // SQL ID
  }]
}, { timestamps: true });

export default mongoose.model("Wishlist", wishlistSchema);
