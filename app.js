// app.js
// -------------------- Imports --------------------
import express from "express";
import expressLayouts from "express-ejs-layouts";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import session from "express-session";
import bcrypt from "bcrypt"; // npm i bcrypt
import multer from "multer";
import fs from "fs";

import { pool } from "./config/db.js"; // single source of truth for DB

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- Uploads (room / hotel images) --------------------
const uploadsDir = path.join(__dirname, "everjourney", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "-")
      .toLowerCase();
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// serve uploaded files at /uploads/...
app.use(
  "/uploads",
  express.static(path.join(__dirname, "everjourney", "uploads"))
);

// -------------------- Middleware --------------------
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "everjourney_secret",
    resave: false,
    saveUninitialized: false,
  })
);

// basic auth guards
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user && req.session.user.id) return next();
  const redirect = encodeURIComponent(req.originalUrl || "/profile");
  return res.redirect(`/auth/login?redirect=${redirect}`);
}

function ensureRole(role) {
  return function (req, res, next) {
    if (req.session && req.session.user && req.session.user.role === role)
      return next();
    return res.status(403).send("Forbidden");
  };
}

function ensureVendor(req, res, next) {
  if (req.session?.user && req.session.user.role === "vendor") return next();
  return res.status(403).send("Vendor access only");
}

// -------------------- View Engine Setup --------------------
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layouts/boilerplate");

// default title
app.use((req, res, next) => {
  res.locals.title = res.locals.title || "EverJourney";
  next();
});

// expose currentUser + activePage to EJS
app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user || null;

  if (req.path === "/") {
    res.locals.activePage = "home";
  } else {
    const parts = req.path.split("/");
    res.locals.activePage = parts[1] || "";
  }
  next();
});

// -------------------- Debug helpers --------------------
app.get("/_dbinfo", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT current_database() AS db, current_schema() AS schema;"
    );
    res.json({ ok: true, dbinfo: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/debug-db", async (req, res) => {
  const result = await pool.query(`
    SELECT current_database() AS db,
           current_schema() AS schema,
           inet_server_addr() AS host,
           inet_server_port() AS port,
           current_user AS user,
           version();
  `);
  res.json(result.rows[0]);
});



// ===================================================================
//                         HOME PAGE
// ===================================================================

app.get("/", async (req, res) => {
  try {
    // ------- Filters for search bar (same structure as hotels page) -------
    const filters = {
      q: (req.query.q || "").trim(),
      checkin: req.query.checkin || "",
      checkout: req.query.checkout || "",
      guests: req.query.guests || 2,
    };

    // ------- Top Destinations (cities with most hotels) -------
    let destinations = [];
    try {
      const destRes = await pool.query(
        `SELECT c.id,
                c.name AS city,
                COUNT(h.id)::int AS stays
         FROM cities c
         JOIN hotels h ON h.city_id = c.id
         GROUP BY c.id, c.name
         ORDER BY stays DESC, c.name ASC
         LIMIT 6;`
      );

      destinations = destRes.rows.map((row) => ({
        id: row.id,
        city: row.city,
        stays: row.stays,
        // if you have specific images per city later, plug here
        img: "/assets/destination-placeholder.jpg",
      }));
    } catch (e) {
      console.warn("HOME: destinations query failed:", e.message || e);
      destinations = [];
    }

    // ------- Featured Hotels (top rated / cheapest) -------
    let hotels = [];
    try {
      const hotelsRes = await pool.query(
        `SELECT h.id AS hotel_id,
                h.name,
                COALESCE(c.name,'') AS city,
                COALESCE(cnt.name,'') AS country,
                COALESCE(h.star_rating, 0) AS star_rating,
                -- cheapest price among its room types
                (SELECT MIN(rtr.price)
                 FROM room_type_rates rtr
                 JOIN room_types rt2 ON rtr.room_type_id = rt2.id
                 WHERE rt2.hotel_id = h.id) AS min_price,
                -- one representative image
                (SELECT ri.url
                 FROM rooms r2
                 JOIN room_images ri ON ri.room_id = r2.id
                 WHERE r2.hotel_id = h.id
                 ORDER BY ri.sort_order ASC NULLS LAST
                 LIMIT 1) AS image_url,
                -- up to a few amenity names
                ARRAY(
                  SELECT regexp_replace(lower(a.name),'\\s+',' ','g')
                  FROM hotel_amenities ha
                  JOIN amenities a ON a.id = ha.amenity_id
                  WHERE ha.hotel_id = h.id
                  ORDER BY a.name
                  LIMIT 4
                ) AS amenity_codes
         FROM hotels h
         LEFT JOIN cities c ON c.id = h.city_id
         LEFT JOIN countries cnt ON cnt.id = c.country_id
         WHERE h.status IS NULL OR h.status = 'active'
         ORDER BY star_rating DESC, h.created_at DESC
         LIMIT 6;`
      );

      hotels = hotelsRes.rows.map((h) => ({
        hotel_id: h.hotel_id,
        name: h.name,
        city: h.city,
        country: h.country,
        star_rating: Number(h.star_rating) || 0,
        min_price: h.min_price ? Number(h.min_price) : 0,
        image: h.image_url || "/assets/hotel-placeholder.jpg",
        amenity_codes: Array.isArray(h.amenity_codes) ? h.amenity_codes : [],
        // you can later add summary/short_description from hotels table if you have those columns
        summary: "",
      }));
    } catch (e) {
      console.error("HOME: featured hotels query failed:", e.message || e);
      hotels = [];
    }

    // ------- Popular Packages (optional section on home) -------
    let packages = [];
    try {
      const pkgRes = await pool.query(
        `SELECT p.id,
                p.title,
                p.description,
                p.base_price,
                p.currency,
                p.nights,
                COALESCE(loc.city,'') AS dest_city,
                -- one image from any hotel in this package, if exists
                COALESCE(pi.image_url, '/assets/package-placeholder.jpg') AS image_url
         FROM packages p
         LEFT JOIN locations loc ON loc.id = p.dest_loc_id
         LEFT JOIN LATERAL (
           SELECT ri.url AS image_url
           FROM package_hotels ph2
           JOIN rooms r ON r.hotel_id = ph2.hotel_id
           JOIN room_images ri ON ri.room_id = r.id
           WHERE ph2.package_id = p.id
           ORDER BY ri.sort_order ASC NULLS LAST
           LIMIT 1
         ) pi ON true
         WHERE p.is_active IS TRUE
         ORDER BY p.created_at DESC
         LIMIT 6;`
      );

      packages = pkgRes.rows.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description
          ? p.description.length > 200
            ? p.description.slice(0, 200) + "..."
            : p.description
          : "",
        base_price: p.base_price ? Number(p.base_price) : 0,
        currency: p.currency || "INR",
        nights: p.nights || 0,
        dest_city: p.dest_city || "",
        image: p.image_url || "/assets/package-placeholder.jpg",
      }));
    } catch (e) {
      console.warn("HOME: packages query failed:", e.message || e);
      packages = [];
    }

    // Render home.ejs
    return res.render("home", {
      title: "EverJourney • Find great stays & trips",
      filters,
      destinations,
      hotels,
      packages,
    });
  } catch (err) {
    console.error("HOME route error:", err);
    return res.status(500).send("Error loading home page");
  }
});

// Optional: /home -> redirect to /
app.get("/home", (req, res) => res.redirect("/"));




// ===================================================================
//                         AUTH (USER)
// ===================================================================

// Auth landing page: choose User or Vendor
app.get("/auth", (req, res) => {
  if (req.session?.user) {
    const role = req.session.user.role;
    if (role === "admin") return res.redirect("/admin/dashboard");
    if (role === "vendor" || role === "vendor_pending")
      return res.redirect("/vendor/dashboard");
    return res.redirect("/");
  }

  res.render("auth/index", {
    title: "Login or Sign up • EverJourney",
    redirect: req.query.redirect || "",
    req,
  });
});

/* ==================== USER LOGIN ==================== */

function renderUserLogin(req, res) {
  if (req.session?.user) return res.redirect("/");

  res.render("auth/user/userLogin", {
    title: "Sign in • EverJourney",
    errors: null,
    old: {
      email: "",
      redirect: req.query.redirect || "",
    },
    req,
  });
}

app.get("/auth/login", renderUserLogin);
app.get("/login", renderUserLogin);

app.post("/auth/login", async (req, res) => {
  try {
    const { email = "", password = "", redirect = "" } = req.body;
    const trimmedEmail = (email || "").trim().toLowerCase();
    const errors = [];

    if (!trimmedEmail) errors.push("Please enter your email.");
    if (!password) errors.push("Please enter your password.");

    if (errors.length) {
      return res.status(400).render("auth/user/userLogin", {
        title: "Sign in • EverJourney",
        errors,
        old: { email: trimmedEmail, redirect },
        req,
      });
    }

    const userQ = await pool.query(
      "SELECT id, email, password_hash, role, is_verified FROM users WHERE lower(email) = $1 LIMIT 1;",
      [trimmedEmail]
    );
    if (!userQ.rows.length) {
      return res.status(401).render("auth/user/userLogin", {
        title: "Sign in • EverJourney",
        errors: ["Invalid email or password."],
        old: { email: trimmedEmail, redirect },
        req,
      });
    }

    const userRow = userQ.rows[0];
    const match = await bcrypt.compare(password, userRow.password_hash);
    if (!match) {
      return res.status(401).render("auth/user/userLogin", {
        title: "Sign in • EverJourney",
        errors: ["Invalid email or password."],
        old: { email: trimmedEmail, redirect },
        req,
      });
    }

    req.session.user = {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role || "user",
      is_verified: userRow.is_verified || false,
    };

    if (redirect && typeof redirect === "string" && redirect.startsWith("/")) {
      return res.redirect(redirect);
    }
    return res.redirect("/");
  } catch (err) {
    console.error("POST /auth/login error:", err);
    return res.status(500).render("auth/user/userLogin", {
      title: "Sign in • EverJourney",
      errors: ["Server error — try again."],
      old: { email: req.body.email || "", redirect: req.body.redirect || "" },
      req,
    });
  }
});

/* ==================== USER SIGNUP ==================== */

function renderUserSignup(req, res) {
  if (req.session?.user) return res.redirect("/");

  res.render("auth/user/userSignup", {
    title: "Sign up • EverJourney",
    errors: null,
    old: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      dob: "",
      gender: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
      redirect: req.query.redirect || "",
    },
    req,
  });
}

app.get("/auth/signup", renderUserSignup);
app.get("/signup", renderUserSignup);

app.post("/auth/signup", async (req, res) => {
  const {
    first_name = "",
    last_name = "",
    email = "",
    password = "",
    password_confirm = "",
    phone = "",
    dob = "",
    gender = "",
    address_line1 = "",
    address_line2 = "",
    city = "",
    state = "",
    postal_code = "",
    country = "",
    accept_terms,
    redirect = "",
  } = req.body;

  const old = {
    first_name,
    last_name,
    email,
    phone,
    dob,
    gender,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    redirect,
  };

  const errors = [];
  if (!first_name || !first_name.trim())
    errors.push("First name is required.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push("A valid email is required.");
  if (!password || password.length < 8)
    errors.push("Password must be at least 8 characters.");
  if (password !== password_confirm) errors.push("Passwords do not match.");
  if (!accept_terms) errors.push("You must accept the Terms of Service.");

  if (errors.length) {
    return res.status(400).render("auth/user/userSignup", {
      title: "Sign up • EverJourney",
      errors,
      old,
      req,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM users WHERE lower(email) = $1 LIMIT 1;",
      [email.trim().toLowerCase()]
    );
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).render("auth/user/userSignup", {
        title: "Sign up • EverJourney",
        errors: ["Email already registered. Try signing in."],
        old,
        req,
      });
    }

    const hashed = await bcrypt.hash(password, 12);

    const userInsert = await client.query(
      `INSERT INTO users (id, email, password_hash, is_verified, role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())
       RETURNING id, email, role;`,
      [email.trim().toLowerCase(), hashed, false, "user"]
    );
    const newUser = userInsert.rows[0];

    await client.query(
      `INSERT INTO user_profiles (user_id, first_name, last_name, phone, dob, gender, profile_photo_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, now(), now());`,
      [
        newUser.id,
        first_name.trim(),
        last_name?.trim() || null,
        phone?.trim() || null,
        dob || null,
        gender || null,
      ]
    );

    if (address_line1 || address_line2 || city || state || postal_code || country) {
      await client.query(
        `INSERT INTO user_addresses (id, user_id, label, line1, line2, city_id, state, country_id, postal_code, latitude, longitude, is_default, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL, $5, NULL, $6, NULL, NULL, TRUE, now(), now());`,
        [
          newUser.id,
          "Home",
          address_line1 || "",
          address_line2 || "",
          state || "",
          postal_code || "",
        ]
      );
    }

    await client.query("COMMIT");

    req.session.user = {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role || "user",
      is_verified: false,
    };

    if (redirect && typeof redirect === "string" && redirect.startsWith("/")) {
      return res.redirect(redirect);
    }
    return res.redirect("/");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /auth/signup error:", err);
    return res.status(500).render("auth/user/userSignup", {
      title: "Sign up • EverJourney",
      errors: ["Server error creating account — please try again."],
      old,
      req,
    });
  } finally {
    client.release();
  }
});

// Logout (GET + POST)
app.get("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.warn("Session destroy error:", err);
      res.clearCookie("connect.sid");
      return res.redirect("/");
    }
    res.clearCookie("connect.sid");
    return res.redirect("/");
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.warn("Session destroy error:", err);
      res.clearCookie("connect.sid");
      return res.redirect("/");
    }
    res.clearCookie("connect.sid");
    return res.redirect("/");
  });
});

// ===================================================================
//                         VENDOR AUTH
// ===================================================================

// Vendor join landing (two cards: hotel vendor + travel vendor)
app.get("/vendor/join", (req, res) => {
  if (req.session?.user && req.session.user.role === "vendor") {
    return res.redirect("/vendor/dashboard");
  }

  res.render("auth/vendor/index", {
    title: "Join as Vendor • EverJourney",
    req,
  });
});

// ---------- HOTEL VENDOR LOGIN / SIGNUP ----------

// GET hotel vendor login
app.get("/vendor/hotel/login", (req, res) => {
  if (req.session?.user && req.session.user.role === "vendor") {
    return res.redirect("/vendor/dashboard");
  }
  res.render("auth/vendor/hotel/login", {
    title: "Hotel Vendor Login • EverJourney",
    errors: [],
    old: { email: "", redirect: req.query.redirect || "" },
    req,
  });
});

// POST hotel vendor login
app.post("/vendor/hotel/login", async (req, res) => {
  const { email = "", password = "", redirect = "" } = req.body;
  const trimmedEmail = (email || "").trim().toLowerCase();
  const errors = [];
  if (!trimmedEmail) errors.push("Please enter your email.");
  if (!password) errors.push("Please enter your password.");

  if (errors.length) {
    return res.status(400).render("auth/vendor/hotel/login", {
      title: "Hotel Vendor Login • EverJourney",
      errors,
      old: { email: trimmedEmail, redirect },
      req,
    });
  }

  try {
    const q = await pool.query(
      "SELECT id, email, password_hash, role, is_verified FROM users WHERE lower(email) = $1 AND role = 'vendor' LIMIT 1;",
      [trimmedEmail]
    );
    if (!q.rows.length) {
      return res.status(401).render("auth/vendor/hotel/login", {
        title: "Hotel Vendor Login • EverJourney",
        errors: ["Invalid email or password."],
        old: { email: trimmedEmail, redirect },
        req,
      });
    }

    const userRow = q.rows[0];
    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) {
      return res.status(401).render("auth/vendor/hotel/login", {
        title: "Hotel Vendor Login • EverJourney",
        errors: ["Invalid email or password."],
        old: { email: trimmedEmail, redirect },
        req,
      });
    }

    req.session.user = {
      id: userRow.id,
      email: userRow.email,
      role: "vendor",
      is_verified: userRow.is_verified || false,
      vendor_type: "hotel",
    };

    if (redirect && redirect.startsWith("/")) return res.redirect(redirect);
    return res.redirect("/vendor/dashboard");
  } catch (err) {
    console.error("POST /vendor/hotel/login error:", err);
    return res.status(500).render("auth/vendor/hotel/login", {
      title: "Hotel Vendor Login • EverJourney",
      errors: ["Server error — please try again."],
      old: { email: trimmedEmail, redirect },
      req,
    });
  }
});

// GET hotel vendor signup
app.get("/vendor/hotel/signup", (req, res) => {
  if (req.session?.user && req.session.user.role === "vendor") {
    return res.redirect("/vendor/dashboard");
  }
  res.render("auth/vendor/hotel/signup", {
    title: "Hotel Vendor Signup • EverJourney",
    errors: [],
    old: {},
    req,
  });
});

// POST hotel vendor signup
app.post("/vendor/hotel/signup", async (req, res) => {
  const b = req.body;
  const old = { ...b };
  const errors = [];

  // account fields
  if (!b.first_name || !b.first_name.trim())
    errors.push("First name is required.");
  if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))
    errors.push("Valid email is required.");
  if (!b.password || b.password.length < 8)
    errors.push("Password must be at least 8 characters.");
  if (b.password !== b.password_confirm) errors.push("Passwords do not match.");
  if (!b.accept_terms)
    errors.push("You must accept the partner terms & conditions.");

  // hotel fields
  if (!b.hotel_name || !b.hotel_name.trim())
    errors.push("Hotel / property name is required.");
  if (!b.hotel_city || !b.hotel_city.trim())
    errors.push("City / destination is required.");
  if (!b.hotel_address || !b.hotel_address.trim())
    errors.push("Address is required.");

  if (errors.length) {
    return res.status(400).render("auth/vendor/hotel/signup", {
      title: "Hotel Vendor Signup • EverJourney",
      errors,
      old,
      req,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM users WHERE lower(email) = $1 LIMIT 1;",
      [b.email.trim().toLowerCase()]
    );
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).render("auth/vendor/hotel/signup", {
        title: "Hotel Vendor Signup • EverJourney",
        errors: ["Email already registered. Try signing in as vendor."],
        old,
        req,
      });
    }

    const hashed = await bcrypt.hash(b.password, 12);

    const userInsert = await client.query(
      `INSERT INTO users (id, email, password_hash, is_verified, role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'vendor', now(), now())
       RETURNING id, email, role;`,
      [b.email.trim().toLowerCase(), hashed, false]
    );
    const newUser = userInsert.rows[0];

    await client.query(
      `INSERT INTO user_profiles
       (user_id, first_name, last_name, phone, dob, gender, profile_photo_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NULL,NULL,NULL,now(),now());`,
      [
        newUser.id,
        b.first_name.trim(),
        b.last_name?.trim() || null,
        b.phone?.trim() || null,
      ]
    );

    const star_rating = b.star_rating ? Number(b.star_rating) : null;

    // NOTE: requires hotels.property_type + hotels.owner_user_id columns added via ALTER TABLE
    await client.query(
      `INSERT INTO hotels
       (id, owner_user_id, name, description, address_line1, address_line2,
        city_id, star_rating, latitude, longitude, phone, email, status,
        property_type, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4, NULL, $5,
               NULL, NULL, $6, $7, 'active', $8, now(), now());`,
      [
        newUser.id,
        b.hotel_name.trim(),
        b.hotel_address.trim(),
        (b.hotel_state || "").trim() || b.hotel_city.trim(),
        star_rating,
        b.hotel_phone || b.phone || null,
        b.email.trim().toLowerCase(),
        b.property_type || null,
      ]
    );

    await client.query("COMMIT");

    req.session.user = {
      id: newUser.id,
      email: newUser.email,
      role: "vendor",
      is_verified: false,
      vendor_type: "hotel",
    };

    const redirect = b.redirect;
    if (redirect && redirect.startsWith("/")) return res.redirect(redirect);
    return res.redirect("/vendor/dashboard");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /vendor/hotel/signup error:", err);
    return res.status(500).render("auth/vendor/hotel/signup", {
      title: "Hotel Vendor Signup • EverJourney",
      errors: ["Server error creating vendor account — please try again."],
      old,
      req,
    });
  } finally {
    client.release();
  }
});

// ---------- TRAVEL VENDOR LOGIN / SIGNUP ----------

// GET travel vendor login
app.get("/vendor/travel/login", (req, res) => {
  if (req.session?.user && req.session.user.role === "vendor") {
    return res.redirect("/vendor/dashboard");
  }
  res.render("auth/vendor/travel/login", {
    title: "Travel Vendor Login • EverJourney",
    errors: [],
    old: { email: "", redirect: req.query.redirect || "" },
    req,
  });
});

// POST travel vendor login
app.post("/vendor/travel/login", async (req, res) => {
  const { email = "", password = "", redirect = "" } = req.body;
  const trimmedEmail = (email || "").trim().toLowerCase();
  const errors = [];
  if (!trimmedEmail) errors.push("Please enter your email.");
  if (!password) errors.push("Please enter your password.");

  if (errors.length) {
    return res.status(400).render("auth/vendor/travel/login", {
      title: "Travel Vendor Login • EverJourney",
      errors,
      old: { email: trimmedEmail, redirect },
      req,
    });
  }

  try {
    const q = await pool.query(
      "SELECT id, email, password_hash, role, is_verified FROM users WHERE lower(email) = $1 AND role = 'vendor' LIMIT 1;",
      [trimmedEmail]
    );
    if (!q.rows.length) {
      return res.status(401).render("auth/vendor/travel/login", {
        title: "Travel Vendor Login • EverJourney",
        errors: ["Invalid email or password."],
        old: { email: trimmedEmail, redirect },
        req,
      });
    }

    const userRow = q.rows[0];
    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) {
      return res.status(401).render("auth/vendor/travel/login", {
        title: "Travel Vendor Login • EverJourney",
        errors: ["Invalid email or password."],
        old: { email: trimmedEmail, redirect },
        req,
      });
    }

    req.session.user = {
      id: userRow.id,
      email: userRow.email,
      role: "vendor",
      is_verified: userRow.is_verified || false,
      vendor_type: "travel",
    };

    if (redirect && redirect.startsWith("/")) return res.redirect(redirect);
    return res.redirect("/vendor/dashboard");
  } catch (err) {
    console.error("POST /vendor/travel/login error:", err);
    return res.status(500).render("auth/vendor/travel/login", {
      title: "Travel Vendor Login • EverJourney",
      errors: ["Server error — please try again."],
      old: { email: trimmedEmail, redirect },
      req,
    });
  }
});

// GET travel vendor signup
app.get("/vendor/travel/signup", (req, res) => {
  if (req.session?.user && req.session.user.role === "vendor") {
    return res.redirect("/vendor/dashboard");
  }
  res.render("auth/vendor/travel/signup", {
    title: "Travel Vendor Signup • EverJourney",
    errors: [],
    old: {},
    req,
  });
});

// POST travel vendor signup
app.post("/vendor/travel/signup", async (req, res) => {
  const b = req.body;
  const old = { ...b };
  const errors = [];

  if (!b.first_name || !b.first_name.trim())
    errors.push("First name is required.");
  if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))
    errors.push("Valid email is required.");
  if (!b.password || b.password.length < 8)
    errors.push("Password must be at least 8 characters.");
  if (b.password !== b.password_confirm) errors.push("Passwords do not match.");
  if (!b.accept_terms)
    errors.push("You must accept the partner terms & conditions.");

  if (!b.provider_name || !b.provider_name.trim())
    errors.push("Business / agency name is required.");
  if (!b.provider_type) errors.push("Service type is required.");
  if (!b.service_city || !b.service_city.trim())
    errors.push("Primary service city / route is required.");

  if (errors.length) {
    return res.status(400).render("auth/vendor/travel/signup", {
      title: "Travel Vendor Signup • EverJourney",
      errors,
      old,
      req,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM users WHERE lower(email) = $1 LIMIT 1;",
      [b.email.trim().toLowerCase()]
    );
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).render("auth/vendor/travel/signup", {
        title: "Travel Vendor Signup • EverJourney",
        errors: ["Email already registered. Try signing in as vendor."],
        old,
        req,
      });
    }

    const hashed = await bcrypt.hash(b.password, 12);

    const userInsert = await client.query(
      `INSERT INTO users (id, email, password_hash, is_verified, role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'vendor', now(), now())
       RETURNING id, email, role;`,
      [b.email.trim().toLowerCase(), hashed, false]
    );
    const newUser = userInsert.rows[0];

    await client.query(
      `INSERT INTO user_profiles
       (user_id, first_name, last_name, phone, dob, gender, profile_photo_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NULL,NULL,NULL,now(),now());`,
      [
        newUser.id,
        b.first_name.trim(),
        b.last_name?.trim() || null,
        b.phone?.trim() || null,
      ]
    );

    const contactInfo = {
      phone: b.phone || null,
      email: b.email.trim().toLowerCase(),
      service_city: b.service_city.trim(),
    };

    // NOTE: requires transport_providers.owner_user_id, registration_number, vehicle_type columns
    await client.query(
      `INSERT INTO transport_providers
       (id, name, provider_type, code, contact_info,
        owner_user_id, registration_number, vehicle_type,
        created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb,
               $5, $6, $7, now(), now());`,
      [
        b.provider_name.trim(),
        b.provider_type || "other",
        b.provider_code || null,
        JSON.stringify(contactInfo),
        newUser.id,
        b.registration_number || null,
        b.vehicle_type || null,
      ]
    );

    await client.query("COMMIT");

    req.session.user = {
      id: newUser.id,
      email: newUser.email,
      role: "vendor",
      is_verified: false,
      vendor_type: "travel",
    };

    const redirect = b.redirect;
    if (redirect && redirect.startsWith("/")) return res.redirect(redirect);
    return res.redirect("/vendor/dashboard");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /vendor/travel/signup error:", err);
    return res.status(500).render("auth/vendor/travel/signup", {
      title: "Travel Vendor Signup • EverJourney",
      errors: ["Server error creating vendor account — please try again."],
      old,
      req,
    });
  } finally {
    client.release();
  }
});

// -------------------- VENDOR DASHBOARD --------------------
// Uses views/profile/vendor.ejs

app.get(
  "/vendor/dashboard",
  ensureAuthenticated,
  ensureRole("vendor"),
  async (req, res) => {
    const user = req.session.user;
    const userId = user.id;
    const vendorType = user.vendor_type || "hotel"; // 'hotel' or 'travel'

    try {
      // 1) basic vendor profile (name + phone)
      const vpRes = await pool.query(
        `SELECT first_name, last_name, phone
         FROM user_profiles
         WHERE user_id = $1
         LIMIT 1;`,
        [userId]
      );
      const vendorProfile = vpRes.rows[0] || {};

      // Common containers for both vendor types
      let vendorStats = { total_bookings: 0, total_revenue: 0 };

      // hotel vendor data
      let hotels = [];
      let vendorBookings = [];
      let payouts = [];
      let hotelRoomsById = {}; // NEW

      // travel vendor data
      let travelProviders = [];
      let providerRoutes = [];
      let travelBookings = [];
      let travelPayouts = [];
      let travelStats = { total_bookings: 0, total_revenue: 0 };

      // ---------------- HOTEL VENDOR BRANCH ----------------
      if (vendorType === "hotel") {
        // Hotels owned by this user
        const hotelsRes = await pool.query(
          `SELECT h.id,
                  h.name,
                  COALESCE(c.name,'') AS city,
                  h.star_rating,
                  COALESCE(h.status,'active') AS status,
                  (SELECT COUNT(*) FROM rooms r WHERE r.hotel_id = h.id)::int AS room_count
           FROM hotels h
           LEFT JOIN cities c ON c.id = h.city_id
           WHERE h.owner_user_id = $1
           ORDER BY h.created_at DESC
           LIMIT 50;`,
          [userId]
        );
        hotels = hotelsRes.rows || [];

        const hotelIds = hotels.map((h) => h.id);

        if (hotelIds.length) {
          // bookings for these hotels
          const bookingsRes = await pool.query(
            `SELECT hb.id,
                    hb.booking_ref,
                    hb.user_id,
                    hb.status,
                    hb.total_amount,
                    hb.created_at,
                    u.email AS user_email,
                    COALESCE(
                      NULLIF(TRIM(up.first_name || ' ' || COALESCE(up.last_name,'')), ''),
                      u.email,
                      'Guest'
                    ) AS guest_name
             FROM hotel_bookings hb
             LEFT JOIN users u ON u.id = hb.user_id
             LEFT JOIN user_profiles up ON up.user_id = hb.user_id
             WHERE hb.hotel_id = ANY($1::uuid[])
             ORDER BY hb.created_at DESC
             LIMIT 40;`,
            [hotelIds]
          );
          vendorBookings = bookingsRes.rows || [];

          // stats for these hotels
          const statsRes = await pool.query(
            `SELECT COUNT(*)::int AS total_bookings,
                    COALESCE(SUM(total_amount),0)::numeric AS total_revenue
             FROM hotel_bookings
             WHERE hotel_id = ANY($1::uuid[]);`,
            [hotelIds]
          );
          if (statsRes.rows[0]) {
            vendorStats.total_bookings = statsRes.rows[0].total_bookings;
            vendorStats.total_revenue = statsRes.rows[0].total_revenue;
          }

          // payments linked to those hotel bookings
          const paymentsRes = await pool.query(
            `SELECT p.id,
                    p.amount,
                    p.method,
                    p.status,
                    p.created_at AS paid_at
             FROM payments p
             WHERE p.hotel_booking_id IN (
               SELECT id FROM hotel_bookings WHERE hotel_id = ANY($1::uuid[])
             )
             ORDER BY p.created_at DESC
             LIMIT 8;`,
            [hotelIds]
          );
          payouts = paymentsRes.rows || [];

          // NEW: detailed rooms per hotel for dashboard room list
          const roomsRes = await pool.query(
            `SELECT r.hotel_id,
                    r.room_number,
                    r.floor,
                    r.status,
                    rt.name AS room_type_name
             FROM rooms r
             LEFT JOIN room_types rt ON rt.id = r.room_type_id
             WHERE r.hotel_id = ANY($1::uuid[])
             ORDER BY r.hotel_id, r.room_number;`,
            [hotelIds]
          );

          hotelRoomsById = roomsRes.rows.reduce((acc, row) => {
            const hid = row.hotel_id;
            if (!acc[hid]) acc[hid] = [];
            acc[hid].push({
              room_number: row.room_number,
              floor: row.floor,
              status: row.status,
              room_type_name: row.room_type_name,
            });
            return acc;
          }, {});
        }
      }

      // ---------------- TRAVEL VENDOR BRANCH ----------------
      if (vendorType === "travel") {
        // Providers owned by this user
        const providersRes = await pool.query(
          `SELECT id,
                  name,
                  provider_type,
                  code,
                  contact_info,
                  registration_number,
                  vehicle_type,
                  created_at
           FROM transport_providers
           WHERE owner_user_id = $1
           ORDER BY created_at DESC
           LIMIT 20;`,
          [userId]
        );
        travelProviders = providersRes.rows || [];
        const providerIds = travelProviders.map((p) => p.id);

        if (providerIds.length) {
          // routes for these providers
          const routesRes = await pool.query(
            `SELECT tr.id,
                    tr.provider_id,
                    tr.transport_type,
                    tr.departure_datetime,
                    tr.arrival_datetime,
                    COALESCE(fc.name,'') AS from_city,
                    COALESCE(tc.name,'') AS to_city
             FROM transport_routes tr
             LEFT JOIN cities fc ON fc.id = tr.from_city_id
             LEFT JOIN cities tc ON tc.id = tr.to_city_id
             WHERE tr.provider_id = ANY($1::uuid[])
             ORDER BY tr.departure_datetime ASC
             LIMIT 40;`,
            [providerIds]
          );
          providerRoutes = (routesRes.rows || []).map((r) => ({
            ...r,
            route_label: `${r.from_city || "Origin"} → ${r.to_city || "Destination"}`,
          }));

          // bookings for these providers
          const tbRes = await pool.query(
            `SELECT tb.id,
                    tb.booking_ref,
                    tb.user_id,
                    tb.status,
                    tb.total_amount,
                    tb.created_at,
                    u.email AS user_email
             FROM transport_bookings tb
             LEFT JOIN users u ON u.id = tb.user_id
             WHERE tb.provider_id = ANY($1::uuid[])
             ORDER BY tb.created_at DESC
             LIMIT 40;`,
            [providerIds]
          );
          travelBookings = tbRes.rows || [];

          // stats for these providers
          const tStatsRes = await pool.query(
            `SELECT COUNT(*)::int AS total_bookings,
                    COALESCE(SUM(total_amount),0)::numeric AS total_revenue
             FROM transport_bookings
             WHERE provider_id = ANY($1::uuid[]);`,
            [providerIds]
          );
          if (tStatsRes.rows[0]) {
            travelStats.total_bookings = tStatsRes.rows[0].total_bookings;
            travelStats.total_revenue = tStatsRes.rows[0].total_revenue;
          }

          // payments linked to these transport bookings
          const tpRes = await pool.query(
            `SELECT p.id,
                    p.amount,
                    p.method,
                    p.status,
                    p.created_at AS paid_at
             FROM payments p
             WHERE p.transport_booking_id IN (
               SELECT id FROM transport_bookings WHERE provider_id = ANY($1::uuid[])
             )
             ORDER BY p.created_at DESC
             LIMIT 8;`,
            [providerIds]
          );
          travelPayouts = tpRes.rows || [];

          // for travel vendor, show these as main metrics
          vendorStats = { ...travelStats };
          payouts = travelPayouts;
        }
      }

      // finally render vendor dashboard
      return res.render("profile/vendor", {
        title: "VendorHub • EverJourney",
        vendor: req.session.user,
        vendorProfile,
        vendorType,
        // hotel vendor data
        hotels,
        vendorStats,
        vendorBookings,
        payouts,
        hotelRoomsById, // NEW
        // travel vendor data
        travelProviders,
        providerRoutes,
        travelBookings,
        travelPayouts,
        travelStats,
      });
    } catch (err) {
      console.error("GET /vendor/dashboard error:", err);
      return res.status(500).send("Server error loading vendor dashboard");
    }
  }
);

// ===================================================================
//                         ADD NEW HOTEL
// ===================================================================

// GET: show form to create a new hotel (for existing hotel vendors)
app.get(
  "/vendor/hotels/new",
  ensureAuthenticated,
  ensureVendor,
  async (req, res) => {
    try {
      const vendorType = req.session.user.vendor_type || "hotel";
      if (vendorType !== "hotel") {
        return res.status(403).send("Only hotel vendors can add hotels.");
      }

      const [citiesRes, amenitiesRes] = await Promise.all([
        pool.query("SELECT id, name FROM cities ORDER BY name ASC;"),
        pool.query("SELECT id, name FROM amenities ORDER BY name ASC;"),
      ]);

      res.render("vendor/hotels/new", {
        title: "Add New Hotel • EverJourney",
        errors: [],
        old: {},
        cities: citiesRes.rows || [],
        amenities: amenitiesRes.rows || [],
        req,
      });
    } catch (err) {
      console.error("GET /vendor/hotels/new error:", err);
      return res.status(500).send("Server error loading Add Hotel form.");
    }
  }
);

// POST: create a new hotel
app.post(
  "/vendor/hotels",
  ensureAuthenticated,
  ensureVendor,
  async (req, res) => {
    const userId = req.session.user.id;
    const vendorType = req.session.user.vendor_type || "hotel";

    if (vendorType !== "hotel") {
      return res.status(403).send("Only hotel vendors can add hotels.");
    }

    const b = req.body;
    const old = { ...b };
    const errors = [];

    // NOTE: make sure your EJS form field names match these:
    // hotel_name, hotel_description, address_line1, address_line2,
    // city_id, star_rating, hotel_phone, hotel_email, property_type, amenity_ids[]
    if (!b.hotel_name || !b.hotel_name.trim())
      errors.push("Hotel name is required.");
    if (!b.address_line1 || !b.address_line1.trim())
      errors.push("Address line 1 is required.");
    if (!b.city_id) errors.push("City is required.");

    let starRating = null;
    if (b.star_rating) {
      const parsed = Number(b.star_rating);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 5) {
        starRating = parsed;
      }
    }

    if (errors.length) {
      const [citiesRes, amenitiesRes] = await Promise.all([
        pool.query("SELECT id, name FROM cities ORDER BY name ASC;"),
        pool.query("SELECT id, name FROM amenities ORDER BY name ASC;"),
      ]);
      return res.status(400).render("vendor/hotels/new", {
        title: "Add New Hotel • EverJourney",
        errors,
        old,
        cities: citiesRes.rows || [],
        amenities: amenitiesRes.rows || [],
        req,
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const hotelInsert = await client.query(
        `INSERT INTO hotels
         (id, owner_user_id, name, description, address_line1, address_line2,
          city_id, star_rating, latitude, longitude, phone, email, status,
          property_type, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
                 $6, $7, NULL, NULL, $8, $9, 'active',
                 $10, now(), now())
         RETURNING id;`,
        [
          userId,
          b.hotel_name.trim(),
          b.hotel_description?.trim() || null,
          b.address_line1.trim(),
          b.address_line2?.trim() || null,
          b.city_id,
          starRating,
          b.hotel_phone?.trim() || null,
          (b.hotel_email || req.session.user.email).trim().toLowerCase(),
          b.property_type || null,
        ]
      );
      const newHotelId = hotelInsert.rows[0].id;

      // OPTIONAL: hotel amenities (amenity_ids[] from form)
      let amenityIds = [];
      if (b.amenity_ids) {
        if (Array.isArray(b.amenity_ids)) amenityIds = b.amenity_ids;
        else amenityIds = [b.amenity_ids];
      }

      if (amenityIds.length) {
        for (const aid of amenityIds) {
          await client.query(
            `INSERT INTO hotel_amenities (hotel_id, amenity_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING;`,
            [newHotelId, aid]
          );
        }
      }

      await client.query("COMMIT");

      // After creating hotel, redirect vendor to add rooms
      return res.redirect(`/vendor/hotels/${newHotelId}/rooms/new`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("POST /vendor/hotels error:", err);

      const [citiesRes, amenitiesRes] = await Promise.all([
        pool.query("SELECT id, name FROM cities ORDER BY name ASC;"),
        pool.query("SELECT id, name FROM amenities ORDER BY name ASC;"),
      ]);

      return res.status(500).render("vendor/hotels/new", {
        title: "Add New Hotel • EverJourney",
        errors: ["Server error creating hotel — please try again."],
        old,
        cities: citiesRes.rows || [],
        amenities: amenitiesRes.rows || [],
        req,
      });
    } finally {
      client.release();
    }
  }
);

// ===================================================================
//                     ADD ROOMS TO EXISTING HOTEL
// ===================================================================

// GET: show Add Rooms form for a specific hotel
app.get(
  "/vendor/hotels/:hotelId/rooms/new",
  ensureAuthenticated,
  ensureVendor,
  async (req, res) => {
    try {
      const vendorType = req.session.user.vendor_type || "hotel";
      if (vendorType !== "hotel") {
        return res.status(403).send("Only hotel vendors can add rooms.");
      }

      const hotelId = req.params.hotelId;
      const userId = req.session.user.id;

      // Make sure this hotel belongs to the current vendor
      const hotelRes = await pool.query(
        `SELECT h.id, h.name, h.city_id, c.name AS city_name, h.star_rating
         FROM hotels h
         LEFT JOIN cities c ON c.id = h.city_id
         WHERE h.id = $1 AND h.owner_user_id = $2
         LIMIT 1;`,
        [hotelId, userId]
      );

      if (!hotelRes.rows.length) {
        return res
          .status(404)
          .send("Hotel not found or you are not the owner of this hotel.");
      }

      const hotel = hotelRes.rows[0];

      // optional: load amenities to attach at room-type level (even if not used yet)
      const amenitiesRes = await pool.query(
        "SELECT id, name FROM amenities ORDER BY name ASC;"
      );

      res.render("vendor/hotels/add-rooms", {
        title: `Add Rooms • ${hotel.name}`,
        errors: [],
        old: {},
        hotel,
        roomAmenities: amenitiesRes.rows || [],
        roomTypes: [], // kept for safety
        req,
      });
    } catch (err) {
      console.error("GET /vendor/hotels/:hotelId/rooms/new error:", err);
      return res.status(500).send("Server error loading Add Rooms form.");
    }
  }
);

// POST: create room type + rate + generated rooms for an existing hotel
app.post(
  "/vendor/hotels/:hotelId/rooms",
  ensureAuthenticated,
  ensureVendor,
  upload.array("room_images", 10), // in case you wire up images later
  async (req, res) => {
    const b = req.body;
    const hotelId = req.params.hotelId;
    const userId = req.session.user.id;

    const old = { ...b };
    const errors = [];

    try {
      const vendorType = req.session.user.vendor_type || "hotel";
      if (vendorType !== "hotel") {
        return res.status(403).send("Only hotel vendors can add rooms.");
      }

      // 1) Verify hotel belongs to this vendor
      const hotelRes = await pool.query(
        `SELECT id, name
         FROM hotels
         WHERE id = $1 AND owner_user_id = $2
         LIMIT 1;`,
        [hotelId, userId]
      );
      if (!hotelRes.rows.length) {
        return res
          .status(404)
          .send("Hotel not found or you are not the owner of this hotel.");
      }
      const hotel = hotelRes.rows[0];

      // 2) Normalise room amenities
      let room_amenity_ids = [];
      if (b.room_amenity_ids) {
        if (Array.isArray(b.room_amenity_ids)) {
          room_amenity_ids = b.room_amenity_ids.map(String);
        } else {
          room_amenity_ids = [String(b.room_amenity_ids)];
        }
      }
      old.room_amenity_ids = room_amenity_ids;

      // 3) Basic validation
      if (!b.room_type_name || !b.room_type_name.trim()) {
        errors.push("Room type name is required.");
      }

      if (!b.base_price || isNaN(Number(b.base_price)) || Number(b.base_price) < 0) {
        errors.push("Valid base price per night is required.");
      }

      const roomCount = b.room_count ? parseInt(b.room_count, 10) : 0;
      if (!roomCount || roomCount <= 0) {
        errors.push("Please specify how many rooms to generate.");
      }

      const maxGuests = b.max_guests ? parseInt(b.max_guests, 10) : 2;
      if (!maxGuests || maxGuests <= 0) {
        errors.push("Max guests must be at least 1.");
      }

      // parse starting number (NOTE: using room_number_start to match your EJS)
      const startNumberRaw = (b.room_number_start || "201").trim();
      let startNumber = parseInt(startNumberRaw, 10);
      if (isNaN(startNumber)) startNumber = 201;

      // 4) Check for duplicate room numbers BEFORE inserting
      const existingRoomsRes = await pool.query(
        `SELECT room_number
         FROM rooms
         WHERE hotel_id = $1;`,
        [hotelId]
      );
      const existingNumbers = new Set(
        existingRoomsRes.rows.map((r) => String(r.room_number))
      );

      const conflicting = [];
      for (let i = 0; i < roomCount; i++) {
        const candidate = String(startNumber + i);
        if (existingNumbers.has(candidate)) {
          conflicting.push(candidate);
        }
      }

      if (conflicting.length) {
        errors.push(
          `These room numbers already exist for this hotel: ${conflicting
            .slice(0, 10)
            .join(", ")}. Please choose a different starting number or reduce the count.`
        );
      }

      if (errors.length) {
        const [amenitiesRes, roomTypesRes] = await Promise.all([
          pool.query("SELECT id, name FROM amenities ORDER BY name ASC;"),
          pool.query(
            "SELECT id, name, max_guests FROM room_types WHERE hotel_id = $1 ORDER BY created_at ASC;",
            [hotelId]
          ),
        ]);

        return res.status(400).render("vendor/hotels/add-rooms", {
          title: `Add Rooms • ${hotel.name}`,
          errors,
          old,
          hotel,
          roomAmenities: amenitiesRes.rows || [],
          roomTypes: roomTypesRes.rows || [],
          req,
        });
      }

      // 5) If validation OK, do transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // (a) Insert room type
        const rtRes = await client.query(
          `INSERT INTO room_types
            (id, hotel_id, name, description, max_guests, area_sq_m,
             created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
                   now(), now())
           RETURNING id;`,
          [
            hotelId,
            b.room_type_name.trim(),
            b.room_type_description?.trim() || null,
            maxGuests,
            b.area_sq_m ? Number(b.area_sq_m) : null,
          ]
        );
        const roomTypeId = rtRes.rows[0].id;

        // (b) Attach room-type amenities (optional)
        if (room_amenity_ids.length) {
          for (const aid of room_amenity_ids) {
            await client.query(
              `INSERT INTO room_type_amenities (room_type_id, amenity_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING;`,
              [roomTypeId, aid]
            );
          }
        }

        // (c) Insert base price rate for this room type
        const currency = b.currency || "INR";
        const basePrice = Number(b.base_price);

        await client.query(
          `INSERT INTO room_type_rates
            (id, room_type_id, currency, price, valid_from, valid_to,
             min_stay, max_stay, inventory, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, NULL, NULL,
                   $4, $5, $6, now(), now());`,
          [
            roomTypeId,
            currency,
            basePrice,
            b.min_stay ? Number(b.min_stay) : 1,
            b.max_stay ? Number(b.max_stay) : null,
            roomCount,
          ]
        );

        // (d) Generate rooms with sequential room numbers (already checked)
        const defaultFloor = b.default_floor ? Number(b.default_floor) : null;

        for (let i = 0; i < roomCount; i++) {
          const roomNo = String(startNumber + i);

          await client.query(
            `INSERT INTO rooms
              (id, hotel_id, room_type_id, room_number, floor, status,
               created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
                     now(), now());`,
            [
              hotelId,
              roomTypeId,
              roomNo,
              defaultFloor,
              b.rooms_active ? "available" : "inactive",
            ]
          );
        }

        // (e) TODO: if you want to save room_images here, you can:
        // const files = req.files || [];
        // if (files.length) { ... insert into room_images with url '/uploads/'+file.filename ... }

        await client.query("COMMIT");

        // success → back to vendor dashboard/profile
        return res.redirect("/profile");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("POST /vendor/hotels/:hotelId/rooms error:", err);

        const [amenitiesRes, roomTypesRes] = await Promise.all([
          pool.query("SELECT id, name FROM amenities ORDER BY name ASC;"),
          pool.query(
            "SELECT id, name, max_guests FROM room_types WHERE hotel_id = $1 ORDER BY created_at ASC;",
            [hotelId]
          ),
        ]);

        return res.status(500).render("vendor/hotels/add-rooms", {
          title: `Add Rooms • ${hotel.name}`,
          errors: ["Server error while creating rooms — please try again."],
          old,
          hotel,
          roomAmenities: amenitiesRes.rows || [],
          roomTypes: roomTypesRes.rows || [],
          req,
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("POST /vendor/hotels/:hotelId/rooms outer error:", err);
      return res.status(500).send("Server error while creating rooms.");
    }
  }
);

// ===================================================================
//                         HOTELS LISTING
// ===================================================================

app.get(["/stays/hotels", "/hotels"], async (req, res) => {
  try {
    console.log("SIMPLE HOTELS: incoming query ->", req.query);

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const perPage = Math.min(
      24,
      Math.max(6, parseInt(req.query.perPage || "12", 10))
    );
    const offset = (page - 1) * perPage;

    const filters = {
      q: (req.query.q || "").trim(),
      city: (req.query.city || "").trim(),
      checkin: req.query.checkin || "",
      checkout: req.query.checkout || "",
      price_max:
        req.query.price_max !== undefined && req.query.price_max !== ""
          ? Number(req.query.price_max)
          : null,
      stars:
        req.query.stars !== undefined && req.query.stars !== ""
          ? Number(req.query.stars)
          : null,
      room_type: (req.query.room_type || "").trim(),
      amenities: Array.isArray(req.query.amenities)
        ? req.query.amenities
        : req.query.amenities
        ? [req.query.amenities]
        : [],
      sort: req.query.sort || "relevance",
    };

    if (!Array.isArray(filters.amenities)) filters.amenities = [];

    let amenities = [],
      cities = [],
      room_type_list = [];
    try {
      const [aRes, cRes, rtRes] = await Promise.all([
        pool.query(
          "SELECT id, name, regexp_replace(lower(name),'\\s+','_','g') AS code FROM amenities ORDER BY name;"
        ),
        pool.query("SELECT id, name FROM cities ORDER BY name;"),
        pool.query("SELECT DISTINCT name FROM room_types ORDER BY name;"),
      ]);
      amenities = aRes.rows.map((r) => ({
        id: r.id,
        code: r.code,
        label: r.name,
      }));
      cities = cRes.rows;
      room_type_list = rtRes.rows.map((r) => r.name);
    } catch (e) {
      console.warn(
        "SIMPLE HOTELS: helper lookups failed (continuing):",
        e.message || e
      );
    }

    const where = [];
    const params = [];
    let i = 1;
    if (filters.q) {
      where.push(
        `(h.name ILIKE '%' || $${i} || '%' OR c.name ILIKE '%' || $${i} || '%')`
      );
      params.push(filters.q);
      i++;
    }
    if (filters.city) {
      where.push(`c.id = $${i}`);
      params.push(filters.city);
      i++;
    }
    if (filters.price_max !== null && !Number.isNaN(filters.price_max)) {
      where.push(`EXISTS (
        SELECT 1 FROM room_type_rates rtr JOIN room_types rt ON rt.id = rtr.room_type_id
        WHERE rt.hotel_id = h.id AND rtr.price <= $${i}
      )`);
      params.push(filters.price_max);
      i++;
    }
    if (filters.stars !== null && !Number.isNaN(filters.stars)) {
      where.push(`h.star_rating >= $${i}`);
      params.push(filters.stars);
      i++;
    }
    if (filters.room_type) {
      where.push(`EXISTS (
        SELECT 1 FROM room_types rt WHERE rt.hotel_id = h.id AND rt.name ILIKE '%' || $${i} || '%'
      )`);
      params.push(filters.room_type);
      i++;
    }
    if (filters.amenities.length) {
      where.push(`EXISTS (
        SELECT 1 FROM hotel_amenities ha JOIN amenities a ON a.id = ha.amenity_id
        WHERE ha.hotel_id = h.id AND regexp_replace(lower(a.name),'\\s+','_','g') = ANY($${i}::text[])
      )`);
      params.push(filters.amenities);
      i++;
    }

    const whereSQL = where.length ? "WHERE " + where.join(" AND ") : "";

    let orderSQL = "ORDER BY h.name ASC";
    if (filters.sort === "price_asc")
      orderSQL = "ORDER BY min_price ASC NULLS LAST";
    if (filters.sort === "price_desc")
      orderSQL = "ORDER BY min_price DESC NULLS LAST";
    if (filters.sort === "rating_desc")
      orderSQL = "ORDER BY COALESCE(h.star_rating,0) DESC";

    const sql = `
      SELECT h.id AS hotel_id,
             h.name,
             COALESCE(c.name,'') AS city,
             COALESCE(cnt.name,'') AS country,
             h.star_rating,
             (SELECT MIN(rtr.price) FROM room_type_rates rtr JOIN room_types rt2 ON rtr.room_type_id = rt2.id WHERE rt2.hotel_id = h.id) AS min_price,
             (SELECT ri.url FROM rooms r2 JOIN room_images ri ON ri.room_id = r2.id WHERE r2.hotel_id = h.id ORDER BY ri.sort_order ASC NULLS LAST LIMIT 1) AS image_url
      FROM hotels h
      LEFT JOIN cities c ON c.id = h.city_id
      LEFT JOIN countries cnt ON cnt.id = c.country_id
      ${whereSQL}
      ${orderSQL}
      LIMIT $${i} OFFSET $${i + 1};
    `;
    params.push(perPage, offset);

    const rowsRes = await pool.query(sql, params);
    const rows = rowsRes.rows || [];

    const hotels = rows.map((r) => ({
      hotel_id: r.hotel_id,
      name: r.name,
      city: r.city,
      country: r.country,
      star_rating: Number(r.star_rating) || 0,
      min_price: r.min_price ? Number(r.min_price) : 0,
      image: r.image_url || "/assets/hotel-placeholder.jpg",
    }));

    let total = 0;
    try {
      const countParams =
        params.length >= 2 ? params.slice(0, params.length - 2) : params.slice(0);
      const countSql = `SELECT COUNT(DISTINCT h.id) AS cnt FROM hotels h LEFT JOIN cities c ON c.id = h.city_id ${whereSQL};`;
      const cRes = await pool.query(countSql, countParams);
      total = cRes.rows[0] ? Number(cRes.rows[0].cnt) : hotels.length;
    } catch (e) {
      total = hotels.length;
    }

    let maxPrice = 50000;
    try {
      const mx = await pool.query(
        `SELECT COALESCE(MAX(price), 50000) as mx FROM room_type_rates;`
      );
      if (mx.rows[0] && mx.rows[0].mx) maxPrice = Number(mx.rows[0].mx);
    } catch (e) {
      // ignore
    }

    res.render("stays/hotels", {
      hotels,
      total,
      page,
      perPage,
      filters,
      amenities,
      cities,
      room_type_list,
      maxPrice,
      paginateUrl: (p) => {
        const q = new URLSearchParams({
          ...req.query,
          page: String(p),
          perPage: String(perPage),
        });
        return `/stays/hotels?${q.toString()}`;
      },
    });
  } catch (err) {
    console.error("SIMPLE HOTELS route error:", err);
    res.status(500).send("Error loading hotels — check server logs.");
  }
});

// ===================================================================
//                         PACKAGES LISTING
// ===================================================================

app.get(["/packages/index", "/package-list"], async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const perPage = Math.min(
      24,
      Math.max(6, parseInt(req.query.perPage || "12", 10))
    );
    const offset = (page - 1) * perPage;

    const filters = {
      q: (req.query.q || "").trim(),
      dest: (req.query.dest || "").trim(),
      min_price:
        req.query.min_price !== undefined && req.query.min_price !== ""
          ? Number(req.query.min_price)
          : null,
      max_price:
        req.query.max_price !== undefined && req.query.max_price !== ""
          ? Number(req.query.max_price)
          : null,
      nights:
        req.query.nights !== undefined && req.query.nights !== ""
          ? Number(req.query.nights)
          : null,
      sort: req.query.sort || "relevance",
    };

    let maxPrice = 100000;
    try {
      const mpr = await pool.query(
        `SELECT COALESCE(MAX(base_price), 100000) AS max_price FROM packages;`
      );
      if (mpr.rows && mpr.rows[0] && mpr.rows[0].max_price) {
        maxPrice = Number(mpr.rows[0].max_price) || 100000;
      }
    } catch (e) {
      console.warn(
        "Could not compute packages maxPrice:",
        e.message || e
      );
      maxPrice = 100000;
    }

    const where = [];
    const params = [];
    let idx = 1;

    if (filters.q) {
      where.push(
        `(p.title ILIKE '%' || $${idx} || '%' OR p.description ILIKE '%' || $${idx} || '%')`
      );
      params.push(filters.q);
      idx++;
    }

    if (filters.dest) {
      where.push(
        `EXISTS (SELECT 1 FROM locations loc WHERE loc.id = p.dest_loc_id AND loc.city ILIKE '%' || $${idx} || '%')`
      );
      params.push(filters.dest);
      idx++;
    }

    if (filters.min_price !== null && !Number.isNaN(filters.min_price)) {
      where.push(`p.base_price >= $${idx}`);
      params.push(filters.min_price);
      idx++;
    }
    if (filters.max_price !== null && !Number.isNaN(filters.max_price)) {
      where.push(`p.base_price <= $${idx}`);
      params.push(filters.max_price);
      idx++;
    }

    if (filters.nights !== null && !Number.isNaN(filters.nights)) {
      where.push(`p.nights = $${idx}`);
      params.push(filters.nights);
      idx++;
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    let total = 0;
    try {
      const countParams = params.slice();
      const countSql = `SELECT COUNT(*)::int AS cnt FROM packages p ${whereSql};`;
      const countRes = await pool.query(countSql, countParams);
      total =
        countRes.rows[0] && countRes.rows[0].cnt
          ? Number(countRes.rows[0].cnt)
          : 0;
    } catch (e) {
      console.warn(
        "Packages count failed (maybe packages table missing):",
        e.message || e
      );
      total = 0;
    }

    let orderSql = "ORDER BY p.created_at DESC";
    if (filters.sort === "price_asc")
      orderSql = "ORDER BY p.base_price ASC NULLS LAST";
    if (filters.sort === "price_desc")
      orderSql = "ORDER BY p.base_price DESC NULLS LAST";
    if (filters.sort === "relevance" && filters.q) {
      orderSql = `ORDER BY (CASE WHEN p.title ILIKE '%' || $${idx} || '%' THEN 0 ELSE 1 END), p.base_price`;
      params.push(filters.q);
      idx++;
    }

    let packageRows = [];
    try {
      const selectSql = `
        SELECT p.id, p.title, p.description, p.base_price, p.currency, p.nights, p.is_active,
               COALESCE(loc.city, '') AS dest_city,
               COALESCE(ph.hotel_count,0) AS hotel_count,
               COALESCE(pi.incl_count,0) AS inclusion_count,
               COALESCE(pi2.image_url, '/assets/package-placeholder.jpg') AS image_url
        FROM packages p
        LEFT JOIN locations loc ON loc.id = p.dest_loc_id
        LEFT JOIN (
          SELECT package_id, COUNT(*) AS hotel_count FROM package_hotels GROUP BY package_id
        ) ph ON ph.package_id = p.id
        LEFT JOIN (
          SELECT package_id, COUNT(*) AS incl_count FROM package_inclusions GROUP BY package_id
        ) pi ON pi.package_id = p.id
        LEFT JOIN LATERAL (
          SELECT ri.url AS image_url
          FROM package_hotels ph2
          JOIN rooms r ON r.hotel_id = ph2.hotel_id
          JOIN room_images ri ON ri.room_id = r.id
          WHERE ph2.package_id = p.id
          ORDER BY ri.sort_order ASC NULLS LAST
          LIMIT 1
        ) pi2 ON true
        ${whereSql}
        ${orderSql}
        LIMIT $${idx} OFFSET $${idx + 1};
      `;
      params.push(perPage, offset);
      const rowsRes = await pool.query(selectSql, params);
      packageRows = rowsRes.rows || [];
    } catch (e) {
      console.warn(
        "Packages select failed (table(s) may be missing):",
        e.message || e
      );
      packageRows = [];
    }

    const packages = packageRows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description
        ? r.description.length > 220
          ? r.description.slice(0, 220) + "..."
          : r.description
        : "",
      base_price: r.base_price === null ? 0 : Number(r.base_price),
      currency: r.currency || "INR",
      nights: r.nights || 0,
      dest_city: r.dest_city || "",
      hotel_count: Number(r.hotel_count) || 0,
      inclusion_count: Number(r.inclusion_count) || 0,
      image: r.image_url || "/assets/package-placeholder.jpg",
    }));

    res.render("packages/index", {
      packages,
      total,
      page,
      perPage,
      filters,
      buildPageUrl: (p) => {
        const qobj = { ...req.query, page: p, perPage };
        const parts = [];
        Object.keys(qobj).forEach((k) => {
          const v = qobj[k];
          if (v === undefined || v === null || v === "") return;
          if (Array.isArray(v))
            v.forEach((x) =>
              parts.push(
                `${encodeURIComponent(k)}=${encodeURIComponent(x)}`
              )
            );
          else
            parts.push(
              `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
            );
        });
        return `/packages?${parts.join("&")}`;
      },
      maxPrice,
      title: "Packages • EverJourney",
    });
  } catch (err) {
    console.error("Packages route error", err);
    res.status(500).send("Server error while fetching packages");
  }
});

// ===================================================================
//                         HOTEL DETAIL
// ===================================================================

app.get("/hotel/:id", async (req, res) => {
  const hotelId = req.params.id;
  try {
    const hotelSql = `
      SELECT h.*,
             COALESCE(c.name,'') AS city,
             COALESCE(cnt.name,'') AS country
      FROM hotels h
      LEFT JOIN cities c ON c.id = h.city_id
      LEFT JOIN countries cnt ON cnt.id = c.country_id
      WHERE h.id = $1
      LIMIT 1;
    `;
    const hotelRes = await pool.query(hotelSql, [hotelId]);
    if (!hotelRes.rows.length) {
      return res.status(404).render("404", { message: "Hotel not found" });
    }
    const hotel = hotelRes.rows[0];

    const imagesPromise = pool.query(
      `SELECT id, url, alt_text, is_primary, sort_order
       FROM hotel_images WHERE hotel_id = $1
       ORDER BY is_primary DESC, sort_order ASC NULLS LAST LIMIT 20;`,
      [hotelId]
    );

    const roomTypesPromise = pool.query(
      `SELECT id, name, description, max_guests, area_sq_m
       FROM room_types WHERE hotel_id = $1 ORDER BY name;`,
      [hotelId]
    );

    const roomsPromise = pool.query(
      `SELECT id, room_number, room_type_id, floor, status
       FROM rooms WHERE hotel_id = $1 ORDER BY floor, room_number LIMIT 200;`,
      [hotelId]
    );

    const amenitiesPromise = pool.query(
      `SELECT a.id, a.name, regexp_replace(lower(a.name),'\\s+','_','g') AS code
       FROM hotel_amenities ha
       JOIN amenities a ON a.id = ha.amenity_id
       WHERE ha.hotel_id = $1
       ORDER BY a.name;`,
      [hotelId]
    );

    const reviewsPromise = pool.query(
      `SELECT hr.id, hr.rating, hr.title, hr.comment, hr.created_at,
              COALESCE(up.first_name, u.email, 'Guest') AS user_name
       FROM hotel_reviews hr
       LEFT JOIN users u ON u.id = hr.user_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE hr.hotel_id = $1
       ORDER BY hr.created_at DESC
       LIMIT 50;`,
      [hotelId]
    );

    const avgRatingPromise = pool.query(
      `SELECT ROUND(AVG(rating)::numeric,2) AS avg_rating FROM hotel_reviews WHERE hotel_id = $1;`,
      [hotelId]
    );
    const minPricePromise = pool.query(
      `SELECT MIN(r.price) AS min_price
       FROM room_type_rates r
       JOIN room_types rt ON rt.id = r.room_type_id
       WHERE rt.hotel_id = $1;`,
      [hotelId]
    );

    const [
      imagesRes,
      roomTypesRes,
      roomsRes,
      amenitiesRes,
      reviewsRes,
      avgRatingRes,
      minPriceRes,
    ] = await Promise.all([
      imagesPromise,
      roomTypesPromise,
      roomsPromise,
      amenitiesPromise,
      reviewsPromise,
      avgRatingPromise,
      minPricePromise,
    ]);

    const images = imagesRes.rows || [];
    const roomTypes = roomTypesRes.rows || [];
    const rooms = roomsRes.rows || [];
    const amenities = amenitiesRes.rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.name,
    }));
    const reviews = reviewsRes.rows || [];
    const avg_rating = avgRatingRes.rows[0]
      ? Number(avgRatingRes.rows[0].avg_rating)
      : null;
    const min_price =
      minPriceRes.rows[0] && minPriceRes.rows[0].min_price
        ? Number(minPriceRes.rows[0].min_price)
        : null;

    const roomTypeIds = roomTypes.map((rt) => rt.id);
    let ratesByRoomType = {};
    if (roomTypeIds.length) {
      const ratesRes = await pool.query(
        `SELECT id, room_type_id, price, currency, valid_from, valid_to, min_stay, max_stay, inventory
         FROM room_type_rates
         WHERE room_type_id = ANY($1::uuid[])
         ORDER BY valid_from NULLS FIRST, price ASC;`,
        [roomTypeIds]
      );
      ratesByRoomType = ratesRes.rows.reduce((acc, r) => {
        acc[r.room_type_id] = acc[r.room_type_id] || [];
        acc[r.room_type_id].push(r);
        return acc;
      }, {});
    }

    const roomIds = rooms.map((r) => r.id);
    let roomImagesByRoom = {};
    if (roomIds.length) {
      const roomImgsRes = await pool.query(
        `SELECT room_id, url, alt_text, is_primary, sort_order
         FROM room_images
         WHERE room_id = ANY($1::uuid[])
         ORDER BY sort_order ASC NULLS LAST;`,
        [roomIds]
      );
      roomImagesByRoom = roomImgsRes.rows.reduce((acc, img) => {
        acc[img.room_id] = acc[img.room_id] || [];
        acc[img.room_id].push(img);
        return acc;
      }, {});
    }

    const firstHotelImageUrl = images.length
      ? images[0].url
      : "/assets/hotel-placeholder.jpg";

    const roomTypesWithRates = roomTypes.map((rt) => {
      const repRoom = rooms.find(
        (r) => String(r.room_type_id) === String(rt.id)
      );
      const imagesForType = repRoom ? roomImagesByRoom[repRoom.id] || [] : [];
      return {
        ...rt,
        rates: ratesByRoomType[rt.id] || [],
        images: imagesForType.length
          ? imagesForType.map((i) => i.url)
          : [firstHotelImageUrl],
      };
    });

    let transport_suggestions = [];
    try {
      if (hotel.city_id) {
        const tRes = await pool.query(
          `SELECT tr.id AS route_id, tp.name AS provider_name,
                  tr.departure_datetime, tr.arrival_datetime,
                  (SELECT MIN(ts.price) FROM transport_seats ts WHERE ts.route_id = tr.id) AS min_price
           FROM transport_routes tr
           JOIN transport_providers tp ON tp.id = tr.provider_id
           WHERE tr.from_city_id = $1 OR tr.to_city_id = $1
           ORDER BY tr.departure_datetime ASC
           LIMIT 5;`,
          [hotel.city_id]
        );
        transport_suggestions = tRes.rows.map((r) => ({
          route_id: r.route_id,
          provider_name: r.provider_name,
          departure_datetime: r.departure_datetime,
          arrival_datetime: r.arrival_datetime,
          price: r.min_price ? Number(r.min_price) : null,
          currency: "INR",
          route_summary: `${r.provider_name} — departs ${
            r.departure_datetime
              ? new Date(r.departure_datetime).toLocaleString()
              : ""
          }`,
        }));
      }
    } catch (e) {
      console.warn("Transport suggestions failed:", e.message || e);
      transport_suggestions = [];
    }

    res.render("stays/hotelDetails", {
      title: `${hotel.name} • EverJourney`,
      hotel: {
        ...hotel,
        images,
        min_price,
      },
      room_types: roomTypesWithRates,
      rooms: rooms.map((r) => ({
        ...r,
        images: roomImagesByRoom[r.id]
          ? roomImagesByRoom[r.id].map((x) => x.url)
          : [],
      })),
      amenities,
      reviews,
      avg_rating,
      min_price,
      transport_suggestions,
      user: req.session?.user || null,
      filters: {
        checkin: req.query.checkin || "",
        checkout: req.query.checkout || "",
        guests: req.query.guests || 1,
      },
    });
  } catch (err) {
    console.error("Error loading hotel detail:", err);
    res.status(500).send("Server error while loading hotel details");
  }
});

// ===================================================================
//                         PROFILE (USER / VENDOR / ADMIN)
// ===================================================================

app.get("/profile", ensureAuthenticated, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user.id) {
      return res.redirect("/auth/login?redirect=/profile");
    }

    const role = user.role ? String(user.role) : "user";

    // ----------------- ADMIN PROFILE -----------------
    if (role === "admin") {
      const statsRes = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM users)::int AS user_count,
          (SELECT COUNT(*) FROM hotels)::int AS hotel_count,
          (SELECT COALESCE(SUM(amount),0) FROM payments)::numeric AS revenue;
      `);

      const stats = statsRes.rows[0] || {};

      return res.render("profile/admin", {
        title: "Admin • EverJourney",
        stats,
        recentUsers: [],
        alerts: [],
        logs: [],
      });
    }

    // ----------------- VENDOR PROFILE -----------------
    if (
      role === "vendor" ||
      role === "hotel_manager" ||
      role === "transport_manager"
    ) {
      const vendorType = req.session.user.vendor_type || "hotel";

      const vpRes = await pool.query(
        `SELECT first_name, last_name, phone
         FROM user_profiles
         WHERE user_id = $1
         LIMIT 1;`,
        [user.id]
      );
      const vendorProfile = vpRes.rows[0] || {};

      let vendorStats = { total_bookings: 0, total_revenue: 0 };
      let hotels = [];
      let vendorBookings = [];
      let payouts = [];
      let hotelRoomsById = {}; // NEW

      let travelProviders = [];
      let providerRoutes = [];
      let travelBookings = [];
      let travelPayouts = [];
      let travelStats = { total_bookings: 0, total_revenue: 0 };

      // HOTEL VENDOR BRANCH
      if (vendorType === "hotel") {
        const hotelsRes = await pool.query(
          `SELECT h.id, h.name, COALESCE(c.name,'') AS city, h.star_rating, h.status,
                  (SELECT COUNT(*) FROM rooms r WHERE r.hotel_id = h.id)::int AS room_count
           FROM hotels h
           LEFT JOIN cities c ON c.id = h.city_id
           WHERE h.owner_user_id = $1
           ORDER BY h.created_at DESC
           LIMIT 50;`,
          [user.id]
        );
        hotels = hotelsRes.rows || [];
        const hotelIds = hotels.map((h) => h.id);

        if (hotelIds.length) {
          const bookingsRes = await pool.query(
            `SELECT hb.id, hb.booking_ref, hb.user_id, hb.status, hb.total_amount, hb.created_at,
                    u.email AS user_email,
                    (SELECT concat(up.first_name,' ',up.last_name)
                     FROM user_profiles up WHERE up.user_id = hb.user_id) AS guest_name
             FROM hotel_bookings hb
             LEFT JOIN users u ON u.id = hb.user_id
             WHERE hb.hotel_id = ANY($1::uuid[])
             ORDER BY hb.created_at DESC
             LIMIT 40;`,
            [hotelIds]
          );
          vendorBookings = bookingsRes.rows || [];

          const statsRes = await pool.query(
            `SELECT COUNT(*)::int AS total_bookings,
                    COALESCE(SUM(total_amount),0)::numeric AS total_revenue
             FROM hotel_bookings hb
             WHERE hb.hotel_id = ANY($1::uuid[]);`,
            [hotelIds]
          );
          if (statsRes.rows[0]) {
            vendorStats.total_bookings = statsRes.rows[0].total_bookings;
            vendorStats.total_revenue = statsRes.rows[0].total_revenue;
          }

          const paymentsRes = await pool.query(
            `SELECT p.id, p.amount, p.method, p.status,
                    p.created_at as paid_at
             FROM payments p
             WHERE p.hotel_booking_id IN
                   (SELECT id FROM hotel_bookings WHERE hotel_id = ANY($1::uuid[]))
             ORDER BY p.created_at DESC
             LIMIT 8;`,
            [hotelIds]
          );
          payouts = paymentsRes.rows || [];

          // NEW: hotel rooms per hotel (same as dashboard)
          const roomsRes = await pool.query(
            `SELECT r.hotel_id,
                    r.room_number,
                    r.floor,
                    r.status,
                    rt.name AS room_type_name
             FROM rooms r
             LEFT JOIN room_types rt ON rt.id = r.room_type_id
             WHERE r.hotel_id = ANY($1::uuid[])
             ORDER BY r.hotel_id, r.room_number;`,
            [hotelIds]
          );

          hotelRoomsById = roomsRes.rows.reduce((acc, row) => {
            const hid = row.hotel_id;
            if (!acc[hid]) acc[hid] = [];
            acc[hid].push({
              room_number: row.room_number,
              floor: row.floor,
              status: row.status,
              room_type_name: row.room_type_name,
            });
            return acc;
          }, {});
        }
      }

      // TRAVEL VENDOR BRANCH
      if (vendorType === "travel") {
        const providersRes = await pool.query(
          `SELECT id, name, provider_type, code, contact_info,
                  registration_number, vehicle_type, created_at
           FROM transport_providers
           WHERE owner_user_id = $1
           ORDER BY created_at DESC
           LIMIT 20;`,
          [user.id]
        );
        travelProviders = providersRes.rows || [];
        const providerIds = travelProviders.map((p) => p.id);

        if (providerIds.length) {
          const routesRes = await pool.query(
            `SELECT tr.id,
                    tr.provider_id,
                    tr.transport_type,
                    tr.departure_datetime,
                    tr.arrival_datetime,
                    COALESCE(fc.name,'') AS from_city,
                    COALESCE(tc.name,'') AS to_city
             FROM transport_routes tr
             LEFT JOIN cities fc ON fc.id = tr.from_city_id
             LEFT JOIN cities tc ON tc.id = tr.to_city_id
             WHERE tr.provider_id = ANY($1::uuid[])
             ORDER BY tr.departure_datetime ASC
             LIMIT 40;`,
            [providerIds]
          );
          providerRoutes = (routesRes.rows || []).map((r) => ({
            ...r,
            route_label: `${r.from_city || "Origin"} → ${r.to_city || "Destination"}`,
          }));

          const tbRes = await pool.query(
            `SELECT tb.id, tb.booking_ref, tb.user_id, tb.status,
                    tb.total_amount, tb.created_at,
                    u.email AS user_email
             FROM transport_bookings tb
             LEFT JOIN users u ON u.id = tb.user_id
             WHERE tb.provider_id = ANY($1::uuid[])
             ORDER BY tb.created_at DESC
             LIMIT 40;`,
            [providerIds]
          );
          travelBookings = tbRes.rows || [];

          const tStatsRes = await pool.query(
            `SELECT COUNT(*)::int AS total_bookings,
                    COALESCE(SUM(total_amount),0)::numeric AS total_revenue
             FROM transport_bookings tb
             WHERE tb.provider_id = ANY($1::uuid[]);`,
            [providerIds]
          );
          if (tStatsRes.rows[0]) {
            travelStats.total_bookings = tStatsRes.rows[0].total_bookings;
            travelStats.total_revenue = tStatsRes.rows[0].total_revenue;
          }

          const tpRes = await pool.query(
            `SELECT p.id, p.amount, p.method, p.status,
                    p.created_at as paid_at
             FROM payments p
             WHERE p.transport_booking_id IN
                   (SELECT id FROM transport_bookings WHERE provider_id = ANY($1::uuid[]))
             ORDER BY p.created_at DESC
             LIMIT 8;`,
            [providerIds]
          );
          travelPayouts = tpRes.rows || [];

          vendorStats = travelStats;
          payouts = travelPayouts;
        }
      }

      return res.render("profile/vendor", {
        title: "VendorHub • EverJourney",
        vendor: req.session.user,
        vendorProfile,
        vendorType,
        hotels,
        vendorStats,
        vendorBookings,
        payouts,
        hotelRoomsById, // NEW
        travelProviders,
        providerRoutes,
        travelBookings,
        travelPayouts,
        travelStats,
      });
    }

    // ----------------- USER PROFILE -----------------
    const [
      profileRes,
      addressesRes,
      hotelBookingsRes,
      transportBookingsRes,
      reviewsRes,
      invoicesRes,
    ] = await Promise.all([
      pool.query(
        `SELECT up.* FROM user_profiles up WHERE up.user_id = $1 LIMIT 1;`,
        [user.id]
      ),
      pool.query(
        `SELECT ua.id, ua.label, ua.line1, ua.line2, ua.city_id, ua.state,
                ua.postal_code, ua.is_default
         FROM user_addresses ua
         WHERE ua.user_id = $1
         ORDER BY ua.is_default DESC, ua.created_at DESC;`,
        [user.id]
      ),
      pool.query(
        `SELECT hb.id, hb.booking_ref, hb.hotel_id, hb.checkin_date, hb.checkout_date,
                hb.status, hb.total_amount, hb.created_at,
                h.name AS hotel_name
         FROM hotel_bookings hb
         LEFT JOIN hotels h ON h.id = hb.hotel_id
         WHERE hb.user_id = $1
         ORDER BY hb.created_at DESC
         LIMIT 12;`,
        [user.id]
      ),
      pool.query(
        `SELECT tb.id, tb.booking_ref, tb.provider_id, tp.name AS provider_name,
                tb.status, tb.total_amount, tb.created_at
         FROM transport_bookings tb
         LEFT JOIN transport_providers tp ON tp.id = tb.provider_id
         WHERE tb.user_id = $1
         ORDER BY tb.created_at DESC
         LIMIT 12;`,
        [user.id]
      ),
      pool.query(
        `SELECT hr.id, hr.hotel_id, hr.rating, hr.title, hr.comment, hr.created_at,
                h.name AS hotel_name
         FROM hotel_reviews hr
         LEFT JOIN hotels h ON h.id = hr.hotel_id
         WHERE hr.user_id = $1
         ORDER BY hr.created_at DESC
         LIMIT 20;`,
        [user.id]
      ),
      pool.query(
        `SELECT inv.id, inv.invoice_number, inv.amount, inv.issue_date, inv.pdf_url
         FROM invoices inv
         WHERE inv.issued_to_user_id = $1
         ORDER BY inv.issue_date DESC
         LIMIT 12;`,
        [user.id]
      ),
    ]);

    const userProfile = profileRes.rows[0] || {};
    const addresses = addressesRes.rows || [];
    const hotelBookings = hotelBookingsRes.rows || [];
    const transportBookings = transportBookingsRes.rows || [];
    const bookings = []
      .concat(hotelBookings, transportBookings)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 12);
    const userReviews = reviewsRes.rows || [];
    const invoices = invoicesRes.rows || [];

    return res.render("profile/user", {
      title: "Profile • EverJourney",
      user: { ...(req.session.user || {}), ...userProfile },
      bookings,
      addresses,
      userReviews,
      invoices,
    });
  } catch (err) {
    console.error("GET /profile error:", err);
    return res.status(500).send("Server error loading profile");
  }
});

// address form example
app.get("/profile/addresses/new", ensureAuthenticated, (req, res) => {
  res.render("profile/address_new", {
    title: "Add Address • EverJourney",
    old: {},
  });
});

// change password
app.post("/profile/change-password", ensureAuthenticated, async (req, res) => {
  try {
    const userid = req.session.user.id;
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password || new_password.length < 8) {
      return res.status(400).send("Invalid input");
    }

    const userQ = await pool.query(
      "SELECT id, password_hash FROM users WHERE id = $1 LIMIT 1;",
      [userid]
    );
    if (!userQ.rows.length) return res.status(404).send("User not found");

    const userRow = userQ.rows[0];
    const ok = await bcrypt.compare(
      current_password,
      userRow.password_hash
    );
    if (!ok) return res.status(401).send("Current password incorrect");

    const hashed = await bcrypt.hash(new_password, 12);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2;",
      [hashed, userid]
    );

    return res.redirect("/profile");
  } catch (err) {
    console.error("POST /profile/change-password error:", err);
    return res.status(500).send("Server error");
  }
});




// ===================================================================
//                         TRANSPORT
// ===================================================================

// -------------------- Transport listing route --------------------
app.get("/transport", async (req, res) => {
  try {
    console.log("TRANSPORT: query params ->", req.query);

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const perPage = Math.min(24, Math.max(6, parseInt(req.query.perPage || "12", 10)));
    const offset = (page - 1) * perPage;

    // Filters from query
    const filters = {
      from_city: (req.query.from_city || "").trim(),
      to_city: (req.query.to_city || "").trim(),
      date: req.query.date || "",
      passengers: req.query.passengers || "",
      type: (req.query.type || "").trim(),        // airline / bus / train / cab / other
      seat_class: (req.query.seat_class || "").trim(),
      price_max:
        req.query.price_max !== undefined && req.query.price_max !== ""
          ? Number(req.query.price_max)
          : null,
      q: (req.query.q || "").trim(),              // provider quick search
      sort: req.query.sort || "soonest",          // soonest / cheapest / expensive / rating
    };

    // Helper lists (for filters)
    let cities = [];
    let transport_types = [];
    let seat_classes = [];
    let maxPrice = 5000;

    try {
      const [cRes, tTypeRes, seatRes, priceRes] = await Promise.all([
        pool.query("SELECT id, name FROM cities ORDER BY name;"),
        pool.query("SELECT DISTINCT COALESCE(transport_type, provider_type) AS t FROM transport_routes tr JOIN transport_providers tp ON tp.id = tr.provider_id WHERE COALESCE(transport_type, provider_type) IS NOT NULL;"),
        pool.query("SELECT DISTINCT seat_class FROM transport_seats WHERE seat_class IS NOT NULL ORDER BY seat_class;"),
        pool.query("SELECT COALESCE(MAX(price), 5000) AS mx FROM transport_seats;"),
      ]);

      cities = cRes.rows;
      transport_types = tTypeRes.rows.map(r => r.t);
      seat_classes = seatRes.rows.map(r => r.seat_class);
      if (priceRes.rows[0] && priceRes.rows[0].mx) {
        maxPrice = Number(priceRes.rows[0].mx);
      }
    } catch (e) {
      console.warn("TRANSPORT: helper lookups failed:", e.message || e);
    }

    // Build WHERE clause
    const where = [];
    const params = [];
    let idx = 1;

    // only future (or today) routes by default
    where.push("tr.departure_datetime >= now()");

    if (filters.from_city) {
      where.push(`tr.from_city_id = $${idx}`);
      params.push(filters.from_city);
      idx++;
    }
    if (filters.to_city) {
      where.push(`tr.to_city_id = $${idx}`);
      params.push(filters.to_city);
      idx++;
    }
    if (filters.date) {
      // date-only match on departure
      where.push(`DATE(tr.departure_datetime) = $${idx}`);
      params.push(filters.date);
      idx++;
    }
    if (filters.type) {
      // match either route.transport_type or provider.provider_type
      where.push(`COALESCE(tr.transport_type, tp.provider_type) = $${idx}`);
      params.push(filters.type);
      idx++;
    }
    if (filters.seat_class) {
      where.push(`EXISTS (
        SELECT 1 FROM transport_seats ts
        WHERE ts.route_id = tr.id AND ts.seat_class ILIKE $${idx}
      )`);
      params.push(`%${filters.seat_class}%`);
      idx++;
    }
    if (filters.price_max !== null && !Number.isNaN(filters.price_max)) {
      // any seat class with price <= price_max
      where.push(`EXISTS (
        SELECT 1 FROM transport_seats ts
        WHERE ts.route_id = tr.id AND ts.price <= $${idx}
      )`);
      params.push(filters.price_max);
      idx++;
    }
    if (filters.q) {
      where.push(`tp.name ILIKE '%' || $${idx} || '%'`);
      params.push(filters.q);
      idx++;
    }

    const whereSQL = where.length ? "WHERE " + where.join(" AND ") : "";

    // ORDER BY
    let orderSQL = "ORDER BY tr.departure_datetime ASC";
    if (filters.sort === "cheapest") orderSQL = "ORDER BY min_price ASC NULLS LAST";
    if (filters.sort === "expensive") orderSQL = "ORDER BY min_price DESC NULLS LAST";
    if (filters.sort === "rating") orderSQL = "ORDER BY avg_rating DESC NULLS LAST, tr.departure_datetime ASC";
    if (filters.sort === "soonest") orderSQL = "ORDER BY tr.departure_datetime ASC";

    // Count total distinct routes (for pagination)
    let total = 0;
    try {
      const countSql = `
        SELECT COUNT(DISTINCT tr.id) AS cnt
        FROM transport_routes tr
        JOIN transport_providers tp ON tp.id = tr.provider_id
        ${whereSQL};
      `;
      const cRes = await pool.query(countSql, params);
      total = cRes.rows[0] ? Number(cRes.rows[0].cnt) : 0;
    } catch (e) {
      console.warn("TRANSPORT: count failed:", e.message || e);
      total = 0;
    }

    // Main select: routes + provider + aggregate seats + image + rating
    const selectSql = `
      SELECT
        tr.id AS route_id,
        tp.name AS provider_name,
        tp.provider_type,
        tp.vehicle_type,
        tp.registration_number,
        fc.name AS from_city,
        tc.name AS to_city,
        tr.departure_datetime,
        tr.arrival_datetime,
        to_char(tr.departure_datetime, 'HH24:MI') AS departure_time,
        to_char(tr.arrival_datetime, 'HH24:MI') AS arrival_time,
        to_char(tr.arrival_datetime - tr.departure_datetime, 'HH24"h "MI"m"') AS duration_label,
        seats.min_price,
        seats.seats_left,
        img.url AS main_image,
        stats.avg_rating,
        stats.review_count
      FROM transport_routes tr
      JOIN transport_providers tp ON tp.id = tr.provider_id
      LEFT JOIN cities fc ON fc.id = tr.from_city_id
      LEFT JOIN cities tc ON tc.id = tr.to_city_id
      -- aggregate seat info
      LEFT JOIN LATERAL (
        SELECT MIN(price) AS min_price,
               COALESCE(SUM(available_seats),0) AS seats_left
        FROM transport_seats ts
        WHERE ts.route_id = tr.id
      ) AS seats ON TRUE
      -- pick one image
      LEFT JOIN LATERAL (
        SELECT ti.url
        FROM transport_images ti
        WHERE ti.route_id = tr.id
        ORDER BY ti.is_primary DESC, ti.sort_order ASC
        LIMIT 1
      ) AS img ON TRUE
      -- provider review stats
      LEFT JOIN (
        SELECT provider_id,
               AVG(rating)::numeric(3,2) AS avg_rating,
               COUNT(*)::int AS review_count
        FROM transport_reviews
        GROUP BY provider_id
      ) AS stats ON stats.provider_id = tp.id
      ${whereSQL}
      ${orderSQL}
      LIMIT $${idx} OFFSET $${idx + 1};
    `;

    const selectParams = params.slice();
    selectParams.push(perPage, offset);

    const routesRes = await pool.query(selectSql, selectParams);
    const rows = routesRes.rows || [];

    // Map rows → view-model
    const routes = rows.map(r => ({
      route_id: r.route_id,
      provider_name: r.provider_name,
      provider_type: r.provider_type,
      vehicle_type: r.vehicle_type,
      registration_number: r.registration_number,
      from_city: r.from_city,
      to_city: r.to_city,
      departure_time: r.departure_time,
      arrival_time: r.arrival_time,
      duration_label: r.duration_label,
      min_price: r.min_price ? Number(r.min_price) : 0,
      seats_left: typeof r.seats_left === "number" ? Number(r.seats_left) : null,
      main_image: r.main_image || "/assets/transport-placeholder.jpg",
      avg_rating: r.avg_rating ? Number(r.avg_rating) : null,
      review_count: r.review_count ? Number(r.review_count) : 0,
    }));

    res.render("transport/index", {
      title: "Transport • EverJourney",
      routes,
      filters,
      total,
      page,
      perPage,
      maxPrice,
      cities,
      transport_types,
      seat_classes,
    });
  } catch (err) {
    console.error("TRANSPORT route error:", err);
    res.status(500).send("Error loading transport options — check server logs.");
  }
});



// ===================================================================
//                         ROOM DETAIL
//   GET /hotel/:hotelId/room/:roomTypeId
// ===================================================================

app.get("/hotel/:hotelId/room/:roomTypeId", async (req, res) => {
  const { hotelId, roomTypeId } = req.params;

  try {
    // 1) Load hotel + this room type (and ensure they belong together)
    const hotelSql = `
      SELECT h.*,
             COALESCE(c.name,'')  AS city,
             COALESCE(cnt.name,'') AS country
      FROM hotels h
      LEFT JOIN cities c   ON c.id = h.city_id
      LEFT JOIN countries cnt ON cnt.id = c.country_id
      WHERE h.id = $1
      LIMIT 1;
    `;

    const roomTypeSql = `
      SELECT id, hotel_id, name, description, max_guests, area_sq_m
      FROM room_types
      WHERE id = $1 AND hotel_id = $2
      LIMIT 1;
    `;

    const [hotelRes, roomTypeRes] = await Promise.all([
      pool.query(hotelSql, [hotelId]),
      pool.query(roomTypeSql, [roomTypeId, hotelId]),
    ]);

    if (!hotelRes.rows.length) {
      return res.status(404).render("404", { message: "Hotel not found" });
    }
    if (!roomTypeRes.rows.length) {
      return res
        .status(404)
        .render("404", { message: "Room type not found for this hotel" });
    }

    const hotel = hotelRes.rows[0];
    const room_type = roomTypeRes.rows[0];

    // 2) Load rate plans for this room type
    const ratesRes = await pool.query(
      `SELECT id, room_type_id, price, currency, valid_from, valid_to,
              min_stay, max_stay, inventory
       FROM room_type_rates
       WHERE room_type_id = $1
       ORDER BY valid_from NULLS FIRST, price ASC;`,
      [roomTypeId]
    );
    const rates = ratesRes.rows || [];

    // 3) Load all rooms that belong to this room type in this hotel
    const roomsRes = await pool.query(
      `SELECT id
       FROM rooms
       WHERE hotel_id = $1 AND room_type_id = $2;`,
      [hotelId, roomTypeId]
    );
    const roomIds = roomsRes.rows.map((r) => r.id);

    // 4) Load room images (3–4 images) for these rooms; if none, we’ll fallback to hotel images
    let room_images = [];
    if (roomIds.length) {
      const roomImgsRes = await pool.query(
        `SELECT room_id, url, alt_text, is_primary, sort_order
         FROM room_images
         WHERE room_id = ANY($1::uuid[])
         ORDER BY is_primary DESC, sort_order ASC NULLS LAST;`,
        [roomIds]
      );

      // flatten & de-duplicate by url
      const seen = new Set();
      room_images = roomImgsRes.rows.filter((img) => {
        if (!img.url || seen.has(img.url)) return false;
        seen.add(img.url);
        return true;
      });
    }

    // 5) Also load hotel-level images (for fallback in the gallery)
    const hotelImgsRes = await pool.query(
      `SELECT id, url, alt_text, is_primary, sort_order
       FROM hotel_images
       WHERE hotel_id = $1
       ORDER BY is_primary DESC, sort_order ASC NULLS LAST;`,
      [hotelId]
    );
    const hotel_images = hotelImgsRes.rows || [];

    // 6) Room-type amenities
    const amenitiesRes = await pool.query(
      `SELECT a.id, a.name,
              regexp_replace(lower(a.name),'\\s+','_','g') AS code
       FROM room_type_amenities rta
       JOIN amenities a ON a.id = rta.amenity_id
       WHERE rta.room_type_id = $1
       ORDER BY a.name;`,
      [roomTypeId]
    );
    const amenities = amenitiesRes.rows.map((a) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      label: a.name,
    }));

    // 7) Render room details page
    return res.render("stays/roomDetails", {
      title: `${room_type.name} • ${hotel.name}`,
      hotel: {
        ...hotel,
        images: hotel_images,
      },
      room_type,
      room_images,      // used by roomDetails.ejs for gallery (max 3–4)
      rates,
      amenities,
      filters: {
        checkin: req.query.checkin || "",
        checkout: req.query.checkout || "",
        guests: req.query.guests || 2,
      },
    });
  } catch (err) {
    console.error("Error loading room detail:", err);
    return res.status(500).send("Server error while loading room details");
  }
});




// ===================================================================
//                         UNIFIED SEARCH ROUTE
// ===================================================================

// All search forms (navbar + home hero search card) can submit to /search
// and this route will redirect to either /stays/hotels or /transport
// with the proper query parameters.
app.get("/search", (req, res) => {
  try {
    // kind/mode tells us whether user is searching stays or transport
    // default = 'hotel' so navbar search works without changes
    const kindRaw = (req.query.kind || req.query.mode || "hotel").toString().toLowerCase();

    // Helper to build a clean query string with only allowed keys
    function buildQuery(allowedKeys) {
      const params = new URLSearchParams();
      for (const key of allowedKeys) {
        const val = req.query[key];
        if (val === undefined || val === null || val === "") continue;

        // Support array-type query params (e.g., amenities[])
        if (Array.isArray(val)) {
          val.forEach((v) => {
            if (v !== undefined && v !== null && v !== "") {
              params.append(key, String(v));
            }
          });
        } else {
          params.append(key, String(val));
        }
      }
      const qs = params.toString();
      return qs ? `?${qs}` : "";
    }

    // ----------------- TRAVEL / TRANSPORT SEARCH -----------------
    if (kindRaw === "travel" || kindRaw === "transport") {
      // Map from unified search form → /transport filters
      const qs = buildQuery([
        "from_city",   // city id or name – your form should match these names
        "to_city",
        "date",
        "passengers",
        "type",        // airline / bus / train / cab / other
        "seat_class",
        "price_max",
        "q",           // provider name search
        "sort",
      ]);

      return res.redirect(`/transport${qs}`);
    }

    // ----------------- HOTEL / STAYS SEARCH (default) -----------------
    // Anything else (or missing kind) is treated as hotel search
    const qs = buildQuery([
      "q",           // destination text
      "city",        // optional city id
      "checkin",
      "checkout",
      "guests",
      "price_max",
      "stars",
      "room_type",
      "amenities",   // can be array
      "sort",
    ]);

    return res.redirect(`/stays/hotels${qs}`);
  } catch (err) {
    console.error("Unified /search route error:", err);
    // Fail safe: go home instead of crashing
    return res.redirect("/");
  }
});



app.get("/support", (req, res) => {
  res.render("support", {
    title: "Support • EverJourney",
  });
});





// ===================================================================
//                         DEALS PAGE (Hotels + Transport only)
//   GET /deals
// ===================================================================

app.get("/deals", async (req, res) => {
  try {
    // 1) HOTEL DEALS: cheapest nightly rate per hotel
    const hotelDealsSql = `
      SELECT h.id AS hotel_id,
             h.name,
             COALESCE(c.name,'')   AS city,
             COALESCE(cnt.name,'') AS country,
             h.star_rating,
             MIN(rtr.price)        AS min_price,
             (
               SELECT ri.url
               FROM rooms r2
               JOIN room_images ri ON ri.room_id = r2.id
               WHERE r2.hotel_id = h.id
               ORDER BY ri.is_primary DESC, ri.sort_order ASC NULLS LAST
               LIMIT 1
             ) AS image_url
      FROM hotels h
      LEFT JOIN cities c   ON c.id = h.city_id
      LEFT JOIN countries cnt ON cnt.id = c.country_id
      JOIN room_types rt   ON rt.hotel_id = h.id
      JOIN room_type_rates rtr ON rtr.room_type_id = rt.id
      GROUP BY h.id, c.name, cnt.name, h.star_rating
      ORDER BY min_price ASC NULLS LAST
      LIMIT 6;
    `;

    const hotelDealsRes = await pool.query(hotelDealsSql);
    const hotelDeals = (hotelDealsRes.rows || []).map((r) => ({
      id: r.hotel_id,
      name: r.name,
      city: r.city,
      country: r.country,
      star_rating: Number(r.star_rating) || 0,
      min_price: r.min_price ? Number(r.min_price) : 0,
      image: r.image_url || "/assets/hotel-placeholder.jpg",
    }));

    // 2) TRANSPORT DEALS: cheapest seat price per route
    let transportDeals = [];
    try {
      const transportDealsSql = `
        SELECT tr.id AS route_id,
               tp.name AS provider_name,
               COALESCE(fc.name,'') AS from_city,
               COALESCE(tc.name,'') AS to_city,
               MIN(ts.price)        AS min_price,
               tr.departure_datetime
        FROM transport_routes tr
        JOIN transport_providers tp ON tp.id = tr.provider_id
        LEFT JOIN cities fc ON fc.id = tr.from_city_id
        LEFT JOIN cities tc ON tc.id = tr.to_city_id
        LEFT JOIN transport_seats ts ON ts.route_id = tr.id
        GROUP BY tr.id, tp.name, fc.name, tc.name, tr.departure_datetime
        HAVING MIN(ts.price) IS NOT NULL
        ORDER BY MIN(ts.price) ASC NULLS LAST
        LIMIT 6;
      `;
      const transportDealsRes = await pool.query(transportDealsSql);
      transportDeals = (transportDealsRes.rows || []).map((r) => ({
        route_id: r.route_id,
        provider_name: r.provider_name,
        from_city: r.from_city || "Origin",
        to_city: r.to_city || "Destination",
        min_price: r.min_price ? Number(r.min_price) : 0,
        departure_datetime: r.departure_datetime,
      }));
    } catch (e) {
      console.warn("Deals: transport query failed (maybe transport tables missing):", e.message || e);
      transportDeals = [];
    }

    res.render("deals/index", {
      title: "Deals • EverJourney",
      hotelDeals,
      transportDeals,
    });
  } catch (err) {
    console.error("GET /deals error:", err);
    res.status(500).send("Server error while loading deals");
  }
});




// ===================================================================
//                         MISC
// ===================================================================

// Health check
app.get("/health", (req, res) => res.send("OK - Server running"));

// -------------------- Start Server --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 EverJourney running at http://localhost:${PORT}`)
);
