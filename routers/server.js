const express = require("express");
const router = express.Router();
const unsqh = require("../modules/db.js");
const axios = require("axios");

/* =========================
   MIDDLEWARE
========================= */
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect("/");
  next();
}

/* =========================
   HELPERS
========================= */
function getServerForUser(userId, serverId) {
  const user = unsqh.get("users", userId);
  if (!user) return null;
  return user.servers?.find((s) => s.id === serverId) || null;
}

function getNodeUrl(node) {
  return `http://${node.ip}:${node.port}`;
}

/* =========================
   PANEL FILE ROUTES
========================= */

/**
 * GET /server/manage/:id
 * Render server management page for a single server
 */
router.get("/server/manage/:id", requireAuth, (req, res) => {
  const user = unsqh.get("users", req.session.userId);
  if (!user) return res.redirect("/");

  const server = user.servers?.find((s) => s.id === req.params.id);
  if (!server) return res.redirect("/dashboard"); // fallback if server not found

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";

  res.render("server/manage", {
    name: appName,
    user,
    server,
  });
});

/**
 * GET /server/files/:id
 * List files and folders for a server
 * Query: ?path=/
 */
router.get("/server/files/:id", requireAuth, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");

  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");

  const pathQuery = req.query.path || "/";

  try {
    const response = await axios.get(
      `${getNodeUrl(node)}/server/fs/${server.idt}/files`,
      {
        params: { path: pathQuery, key: node.key },
      }
    );
    const settings = unsqh.get("settings", "app") || {};
    const appName = settings.name || "App";
    const user = unsqh.get("users", req.session.userId);

    res.render("server/files", {
      name: appName,
      user,
      server,
      files: response.data,
      path: pathQuery,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * GET /server/files/:id/content
 * Query: ?location=/file.txt
 */
router.get("/server/files/:id/content", requireAuth, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");
  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");

  const location = req.query.location;
  if (!location) return res.status(400).send("Missing location");

  try {
    const response = await axios.get(
      `${getNodeUrl(node)}/server/fs/${server.idt}/file/content`,
      {
        params: { location, key: node.key },
      }
    );
    const settings = unsqh.get("settings", "app") || {};
    const appName = settings.name || "App";
    const user = unsqh.get("users", req.session.userId);

    res.render("server/file-content", {
      server,
      content: response.data.content,
      location,
      user,
      name: appName,
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * POST /server/files/:id/new-file
 * body: { filename, content }
 * Query: ?path=/
 */
router.post("/server/files/:id/new-file", requireAuth, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");
  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");

  const { filename, content } = req.body;
  const pathQuery = req.query.path || "/";

  try {
    await axios.post(
      `${getNodeUrl(node)}/server/fs/${server.idt}/file/new`,
      { filename, content },
      {
        params: { path: pathQuery, key: node.key },
      }
    );
    res.redirect(
      `/server/files/${server.id}?path=${encodeURIComponent(pathQuery)}`
    );
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * POST /server/files/:id/new-folder
 * body: { filename }
 * Query: ?path=/
 */
router.post("/server/files/:id/new-folder", requireAuth, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");
  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");

  const { filename } = req.body;
  const pathQuery = req.query.path || "/";

  try {
    await axios.post(
      `${getNodeUrl(node)}/server/fs/${server.idt}/folder/new`,
      { filename },
      {
        params: { path: pathQuery, key: node.key },
      }
    );
    res.redirect(
      `/server/files/${server.id}?path=${encodeURIComponent(pathQuery)}`
    );
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * POST /server/files/:id/file/delete
 * Query: ?location=/file.txt
 */
router.post("/server/files/:id/file/delete", requireAuth, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");
  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh
    .list("nodes")
    .find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");

  const location = req.query.location;
  if (!location) return res.status(400).send("Missing location");

  try {
    await axios.delete(
      `${getNodeUrl(node)}/server/fs/${server.idt}/file/delete`,
      {
        params: { location, key: node.key },
      }
    );
    res.redirect(`/server/files/${server.id}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * POST /server/files/:id/folder/delete
 * Query: ?location=/folder
 */
router.post(
  "/server/files/:id/folder/delete",
  requireAuth,
  async (req, res) => {
    const server = getServerForUser(req.session.userId, req.params.id);
    if (!server) return res.status(404).send("Server not found");
    if (!server.node) return res.status(500).send("Server node not assigned");

    const node = unsqh
      .list("nodes")
      .find((n) => n.ip === server.node.ip);
    if (!node) return res.status(404).send("Node not found");

    const location = req.query.location;
    if (!location) return res.status(400).send("Missing location");

    try {
      await axios.delete(
        `${getNodeUrl(node)}/server/fs/${server.idt}/folder/delete`,
        {
          params: { location, key: node.key },
        }
      );
      res.redirect(`/server/files/${server.id}`);
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
);

/**
 * POST /server/files/:id/file/rename
 * body: { location, newName }
 */
router.post("/server/files/:id/file/rename", requireAuth, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");
  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");

  const { location, newName } = req.body;
  if (!location) return res.status(400).send("Missing location");
  if (!newName) return res.status(400).send("Missing newName");

  try {
    await axios.post(
      `${getNodeUrl(node)}/server/fs/${server.idt}/file/rename`,
      { location, newName },
      { params: { key: node.key } }
    );
    res.redirect(`/server/files/${server.id}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/**
 * POST /server/files/:id/folder/rename
 * body: { location, newName }
 */
router.post("/server/files/:id/folder/rename", requireAuth, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");
  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");

  const { location, newName } = req.body;
  if (!location) return res.status(400).send("Missing location");
  if (!newName) return res.status(400).send("Missing newName");

  try {
    await axios.post(
      `${getNodeUrl(node)}/server/fs/${server.idt}/folder/rename`,
      { location, newName },
      { params: { key: node.key } }
    );
    res.redirect(`/server/files/${server.id}`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});
module.exports = router;
