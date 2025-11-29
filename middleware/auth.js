// middleware/auth.js

// Store current logged-in user info in res.locals (available in EJS templates)
export function setUser(req, res, next) {
  res.locals.currentUser = req.session?.user || null;
  next();
}

// Ensure user is logged in
export function requireLogin(req, res, next) {
  if (!req.session?.user) {
    return res.redirect("/auth"); // redirect to login/signup page
  }
  next();
}

// Ensure only admin can access the route
export function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.role !== "admin") {
    return res.status(403).send("Access denied: Admins only");
  }
  next();
}

// Ensure only normal user can access the route
export function requireUser(req, res, next) {
  if (!req.session?.user || req.session.user.role !== "user") {
    return res.status(403).send("Access denied: Users only");
  }
  next();
}
