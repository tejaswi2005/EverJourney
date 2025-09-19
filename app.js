import express from "express";
import path from "path";
import expressLayouts from "express-ejs-layouts";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import User from "./models/mongoData/user.js"; 
import mysql from "mysql2/promise";
import mongoose from "mongoose";
import session from "express-session";
import dotenv from "dotenv";
import { setUser, requireLogin, requireAdmin, requireUser } from "./middleware/auth.js";
import Queries from "./models/mongoData/queries.js";

dotenv.config();

// ----------------- MySQL Connection -----------------
const db = await mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Coder@132005",
  database: "everjourney"
});

// ----------------- MongoDB Connection -----------------
const mongoURI = "mongodb://127.0.0.1:27017/everjourney";
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ MongoDB connection error:", err)); 

// ----------------- Express Setup -----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(expressLayouts);
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "your_secret_key",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Custom Middleware
app.use(setUser);

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/boilerplate");

// ----------------- Routes -----------------

// Home
app.get("/home", async (req, res) => {
  try {
    // Fetch FAQs from MongoDB
    const queries = await Queries.find().lean(); // lean() gives plain JS objects

    // Optional: fetch hotels if needed
    const [hotels] = await db.query("SELECT * FROM hotels LIMIT 6");

    // Check if user is logged in
    const user = req.session.user || null;

    // Render home page with queries and hotels
    res.render("home", { queries, hotels, user });
  } catch (err) {
    console.error("Home Route Error:", err);
    res.status(500).send("Server Error");
  }
});

// Auth page
app.get("/auth", (req, res) => res.render("auth/auth"));

// --------- USER AUTH ---------
app.post("/user/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, role: "user" });

    if (!user || user.password !== password) {
      return res.send("❌ Invalid email or password!");
    }

    req.session.user = { id: user._id, name: user.name, role: "user" };
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error logging in!");
  }
});

app.post("/user/signup", async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword, dob, country, preferences, newsletter } = req.body;

    if (password !== confirmPassword) return res.send("❌ Passwords do not match!");

    const newUser = new User({
      _id: uuidv4(),
      name,
      email,
      phone,
      password,
      dob,
      country,
      preferences: Array.isArray(preferences) ? preferences : [preferences],
      newsletter: newsletter === "on",
      role: "user"
    });

    await newUser.save();
    req.session.user = { id: newUser._id, name: newUser.name, role: "user" };
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error signing up!");
  }
});

// --------- ADMIN AUTH ---------
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await User.findOne({ email, role: "admin" });

    if (!admin || admin.password !== password) {
      return res.send("❌ Invalid admin credentials!");
    }

    req.session.user = { id: admin._id, name: admin.name, role: "admin" };
    res.redirect("/admin/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error logging in!");
  }
});

app.post("/admin/signup", async (req, res) => {
  try {
    const { name, email, password, confirmPassword, secretKey } = req.body;

    if (password !== confirmPassword) return res.send("❌ Passwords do not match!");
    if (!secretKey || secretKey !== process.env.ADMIN_SECRET) 
      return res.send("❌ Invalid admin secret key!");

    const newAdmin = new User({
      _id: uuidv4(),
      name,
      email,
      password,
      role: "admin",
      secretKey
    });

    await newAdmin.save();
    req.session.user = { id: newAdmin._id, name: newAdmin.name, role: "admin" };
    res.redirect("/admin/profile");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error signing up!");
  }
});

// --------- LOGOUT ---------
app.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("❌ Error logging out!");
    res.redirect("/auth");
  });
});

// --------- PROFILE PAGES ---------
app.get("/profile", requireLogin, requireUser, (req, res) => {
  res.render("profile/userProfile", { user: req.session.user });
});

app.get("/admin/profile", requireLogin, requireAdmin, (req, res) => {
  res.render("profile/adminProfile", { admin: req.session.user });
});

// ----------------- HOTELS (MySQL) -----------------
app.get("/hotels", async (req, res) => {
  try {
    const [hotels] = await db.query("SELECT * FROM hotels");
    res.render("hotels/hotels", { hotels });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error fetching hotels");
  }
});

app.get("/hotels/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [[hotel]] = await db.query("SELECT * FROM hotels WHERE hotel_id = ?", [id]);
    const [rooms] = await db.query("SELECT * FROM rooms WHERE hotel_id = ?", [id]);

    if (!hotel) return res.status(404).send("Hotel not found");

    res.render("hotels/hotelDetails", { hotel, rooms });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error fetching hotel details");
  }
});

app.get("/rooms/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [[room]] = await db.query("SELECT * FROM rooms WHERE room_id = ?", [id]);

    if (!room) return res.status(404).send("Room not found");

    res.render("hotels/roomDetails", { room });
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error fetching room details");
  }
});

// ----------------- START SERVER -----------------
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
