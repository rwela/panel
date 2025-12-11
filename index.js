const express = require("express");
const app = express();
const path = require("path");
const fs = require('fs');
const config = require("./config.json");
const PORT = config.port;
const unsqh = require("./modules/db.js");

const currentSettings = unsqh.get("settings", "app") || {};
const newSettings = {
  name: currentSettings.name || config.name,
  port: currentSettings.port || config.port
};
unsqh.put("settings", "app", newSettings);

const session = require("express-session");

app.use(session({
  name: "sid",
  secret: config.session_secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 1 day cause afk is bad 
  }
}));

// --- Express setup ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  res.setHeader("X-Powered-By", "Hydren || Talorix");
  next();
});

// --- Load backend routes ---
const loadedRoutes = [];
const routeFiles = fs.readdirSync("./routers").filter(file => file.endsWith(".js"));

for (const file of routeFiles) {
  const routeModule = require(path.join(__dirname, "routers", file));
  const router = routeModule.router || routeModule;
  const name = routeModule.ploxora_route || file.replace(".js", "");

  app.use("/", router);
  loadedRoutes.push(name);
}

// --- 404 handler ---
app.use(async (req, res) => {
  res.status(404).render("404", {
    req,
    name: config.name,
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`well it got started!`);
});
