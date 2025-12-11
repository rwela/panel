const express = require("express");
const router = express.Router();
const unsqh = require("../modules/db.js");

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect("/"); 
  next();
}

router.get("/dashboard", requireAuth, (req, res) => {
  const user = unsqh.get("users", req.session.userId);
  if (!user) return res.redirect("/");
  const { password, ...safeUser } = user;

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";

  res.render("user/dashboard", {
    name: appName,
    user: safeUser
  });
});

module.exports = router;
