const express = require("express");
const router = express.Router();
const unsqh = require("../modules/db.js");
const crypto = require("crypto");

function name() {
  const settings = unsqh.get("settings", "app") || {};
  return settings.name || "Talorix";
};

router.get("/", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/dashboard");
  }

  res.render("authentication/login", {
    name: name(),
  });
})
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email & password required" });

  const users = unsqh.list("users");
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const hash = crypto.createHash("sha256").update(password).digest("hex");
  if (user.password !== hash) return res.status(401).json({ error: "Invalid credentials" });

  req.session.userId = user.id;

  const { password: _, ...safeUser } = user;
  res.redirect('/dashboard');
});

router.get("/register", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/dashboard");
  }
  res.render("authentication/register", { name: name(), });
});

// --- POST /register ---
router.post("/register", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/dashboard");
  }

  const { email, username, password } = req.body;
  if (!email || !username || !password) {
    return res.render("register", { 
      name: name(), 
      error: "Email, username, and password are required"
    });
  }

  // Check if user already exists
  const existing = unsqh.list("users").find(u => u.email === email);
  if (existing) {
    return res.render("register", { 
      name: name(), 
      error: "User with this email already exists"
    });
  }

  const randomId = Math.random(12);

  const hash = crypto.createHash("sha256").update(password).digest("hex");

  unsqh.put("users", randomId, {
    id: randomId,
    email,
    username,
    servers: [],
    password: hash
  });

  req.session.userId = randomId;

  res.redirect("/dashboard");
});

router.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("sid");
    res.json({ success: true });
  });
});

module.exports = router;
