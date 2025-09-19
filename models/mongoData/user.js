import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    _id: 
    { 
        type: String 
    },
    name: 
    { 
        type: String, 
        required: true 
    },
    email: 
    { 
        type: String, 
        required: true, 
        unique: true 
    },
    phone: String,
    password: 
    { 
        type: String, 
        required: true 
    },
    newsletter: 
    { 
        type: Boolean, 
        default: false 
    },
    // New role field (user | admin)
  role: 
  { 
    type: String, 
    enum: ["user", "admin"], 
    default: "user" 
  },
    // Optional: secret key for admins
   secretKey: String 

}, 
{ timestamps: true });

export default mongoose.model("User", userSchema);
