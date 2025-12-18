const express = require("express");
const router = express.Router();
const unsqh = require("../modules/db.js");
const axios = require("axios");
const multer = require("multer");
const upload = multer();
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

function withServer(req, res, next) {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.redirect("/dashboard?error=NOTFOUND");
  if (server.suspended) return res.redirect("/dashboard?error=SUSPENDED");
  next();
}
function syncServerPorts(user, server, ports, primary = null) {
  if (!ports || ports.length === 0) ports = [server.port || 25565];

  server.ports = ports;

  if (primary && ports.includes(primary)) {
    server.port = primary;
  } else {
    server.port = ports[0];
  }

  user.servers = user.servers.map((s) => (s.id === server.id ? server : s));
  unsqh.put("users", user.id, user);

  const adminServer = unsqh.get("servers", server.id);
  if (adminServer) {
    adminServer.ports = ports;
    adminServer.port = server.port;
    unsqh.put("servers", server.id, adminServer);
  }
}

/* =========================
   PANEL FILE ROUTES
========================= */

/**
 * GET /server/manage/:id
 * Render server management page for a single server
 */
router.get("/server/manage/:id", requireAuth, withServer, (req, res) => {
  const user = unsqh.get("users", req.session.userId);
  if (!user) return res.redirect("/");

  const server = getServerForUser(req.session.userId, req.params.id);

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";

  res.render("server/manage", {
    name: appName,
    user,
    server,
  });
});

/**
 * POST /server/size/:id
 * gets the total server size
 */
router.post("/server/size/:id", requireAuth, withServer, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");
  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");
  let size;
  try {
    const response = await axios.get(
      `${getNodeUrl(node)}/server/fs/${server.idt}/size`,
      { params: { key: node.key } }
    );
    size = response.data.total;
  } catch (err) {
    console.error(
      "Error fetching server size:",
      err.response?.data || err.message
    );
    size = 0;
  }

  res.json({ size });
});

/**
 * GET /server/files/:id
 * List files and folders for a server
 * Query: ?path=/
 */
router.get("/server/files/:id", requireAuth, withServer, async (req, res) => {
  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.status(404).send("Server not found");

  if (!server.node) return res.status(500).send("Server node not assigned");

  const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
  if (!node) return res.status(404).send("Node not found");

  const pathQuery = req.query.path || "/";

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  let files = [];

  try {
    const response = await axios.get(
      `${getNodeUrl(node)}/server/fs/${server.idt}/files`,
      {
        params: { path: pathQuery, key: node.key },
      }
    );
    files = response.data || [];
  } catch (err) {
    // the error would usually means node is offline
    // console.error("Error fetching files:", err.message);
    files = [];
  }

  res.render("server/files", {
    name: appName,
    user,
    server,
    files,
    path: pathQuery,
  });
});

/**
 * GET /server/files/:id/content
 * Query: ?location=/file.txt
 */
router.get(
  "/server/files/:id/content",
  requireAuth,
  withServer,
  async (req, res) => {
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
  }
);

/**
 * POST /server/files/:id/new-file
 * body: { filename, content }
 * Query: ?path=/
 */
router.post(
  "/server/files/:id/new-file",
  requireAuth,
  withServer,
  async (req, res) => {
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
  }
);

/**
 * POST /server/files/:id/new-folder
 * body: { filename }
 * Query: ?path=/
 */
router.post(
  "/server/files/:id/new-folder",
  requireAuth,
  withServer,
  async (req, res) => {
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
  }
);

/**
 * POST /server/files/:id/file/delete
 * Query: ?location=/file.txt
 */
router.post(
  "/server/files/:id/file/delete",
  requireAuth,
  withServer,
  async (req, res) => {
    const server = getServerForUser(req.session.userId, req.params.id);
    if (!server) return res.status(404).send("Server not found");
    if (!server.node) return res.status(500).send("Server node not assigned");

    const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
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
  }
);

/**
 * POST /server/files/:id/folder/delete
 * Query: ?location=/folder
 */
router.post(
  "/server/files/:id/folder/delete",
  requireAuth,
  withServer,
  async (req, res) => {
    const server = getServerForUser(req.session.userId, req.params.id);
    if (!server) return res.status(404).send("Server not found");
    if (!server.node) return res.status(500).send("Server node not assigned");

    const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
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
router.post(
  "/server/files/:id/file/rename",
  requireAuth,
  withServer,
  async (req, res) => {
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
  }
);

/**
 * POST /server/files/:id/folder/rename
 * body: { location, newName }
 */
router.post(
  "/server/files/:id/folder/rename",
  requireAuth,
  withServer,
  async (req, res) => {
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
  }
);
/* =========================
   SETTINGS PAGE ROUTE
========================= */

/**
 * GET /server/settings/:id
 * Render server settings page
 */
router.get("/server/settings/:id", requireAuth, withServer, (req, res) => {
  const user = unsqh.get("users", req.session.userId);
  if (!user) return res.redirect("/");

  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.redirect("/dashboard");

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";

  res.render("server/settings", {
    name: appName,
    user,
    server,
  });
});

/* =========================
   SERVER SETTINGS ACTIONS
========================= */

/**
 * POST /server/settings/:id/rename
 * Rename the server
 * body: { newName }
 */
router.post(
  "/server/settings/:id/rename",
  requireAuth,
  withServer,
  (req, res) => {
    const { newName } = req.body;
    if (!newName) return res.status(400).send("Missing newName");

    const user = unsqh.get("users", req.session.userId);
    if (!user) return res.status(404).send("User not found");

    const server = getServerForUser(req.session.userId, req.params.id);
    if (!server) return res.status(404).send("Server not found");
    server.name = newName;
    user.servers = user.servers.map((s) => (s.id === server.id ? server : s));
    unsqh.put("users", req.session.userId, user);

    const adminServer = unsqh.get("servers", server.id);
    if (adminServer) {
      adminServer.name = newName;
      unsqh.put("servers", server.id, adminServer);
    }

    res.redirect(`/server/settings/${server.id}`);
  }
);

/**
 * POST /server/settings/:id/envs
 * Save envs
 */
router.post(
  "/server/settings/:id/envs",
  requireAuth,
  withServer,
  (req, res) => {
    const user = unsqh.get("users", req.session.userId);
    const server = getServerForUser(req.session.userId, req.params.id);

    if (!server) {
      return res.status(404).send("Server not found");
    }

    const newEnv = req.body.env || {};

    // update user server
    server.env = newEnv;
    user.servers = user.servers.map((s) => (s.id === server.id ? server : s));
    unsqh.put("users", user.id, user);

    const adminServer = unsqh.get("servers", server.id);
    if (adminServer) {
      adminServer.env = newEnv;
      unsqh.put("servers", server.id, adminServer);
    }

    res.redirect(`/server/settings/${server.id}?env=saved`);
  }
);

/**
 * POST /server/settings/reinstall/:idt
 * Reinstall the server
 */
router.post(
  "/server/settings/reinstall/:id",
  requireAuth,
  withServer,
  async (req, res) => {
    const { id } = req.params;

    const user = unsqh.get("users", req.session.userId);
    if (!user) return res.status(404).send("User not found");

    const server = getServerForUser(req.session.userId, id);
    if (!server) return res.status(404).send("Server not found");
    if (!server.node) return res.status(500).send("Server node not assigned");

    const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
    if (!node) return res.status(404).send("Node not found");

    try {
      const response = await axios.post(
        `${getNodeUrl(node)}/server/reinstall/${server.idt}`,
        { env: server.env },
        { params: { key: node.key } }
      );

      const { containerId: newContainerId } = response.data;

      server.containerId = newContainerId;
      user.servers = user.servers.map((s) => (s.id === id ? server : s));
      unsqh.put("users", user.id, user);

      const adminServer = unsqh
        .list("servers")
        .find((s) => s.idt === server.idt);
      if (adminServer) {
        adminServer.containerId = newContainerId;
        unsqh.put("servers", adminServer.id, adminServer);
      }

      res.redirect(`/server/settings/${server.id}?rs=true`);
    } catch (err) {
      console.error("Reinstall failed:", err);
      res.redirect(
        `/server/settings/${server.id}?rs=false&err=${encodeURIComponent(
          err.message || "unknown"
        )}`
      );
    }
  }
);

/**
 * POST /server/files/:id/upload
 * Query: ?path=/subfolder
 * FormData: file=<file>
 */
router.post(
  "/server/files/:id/upload",
  requireAuth,
  withServer,
  upload.single("file"),
  async (req, res) => {
    const server = getServerForUser(req.session.userId, req.params.id);
    if (!server) return res.status(404).send("Server not found");
    if (!server.node) return res.status(500).send("Server node not assigned");

    const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
    if (!node) return res.status(404).send("Node not found");

    const pathQuery = req.query.path || "/";

    if (!req.file) return res.status(400).send("No file uploaded");

    try {
      // Send the file to the node via Axios using multipart/form-data
      const FormData = require("form-data");
      const form = new FormData();
      form.append("file", req.file.buffer, req.file.originalname);

      await axios.post(
        `${getNodeUrl(node)}/server/fs/${server.idt}/file/upload`,
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
          params: { path: pathQuery, key: node.key },
        }
      );

      res.redirect(
        `/server/files/${server.id}?path=${encodeURIComponent(pathQuery)}`
      );
    } catch (err) {
      res.status(500).send(err.message);
    }
  }
);
/**
 * GET /server/network/:id/add/:port
 */
router.get(
  "/server/network/:id/add/:port",
  requireAuth,
  withServer,
  async (req, res) => {
    const { id, port } = req.params;

    const user = unsqh.get("users", req.session.userId);
    const server = getServerForUser(req.session.userId, id);
    if (!server || !server.node) return res.redirect("/dashboard");

    const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
    if (!node) return res.status(404).send("Node not found");

    const allServers = unsqh.list("servers") || [];
    const portInUse = allServers.some(
      (s) => s.id !== server.id && s.ports?.includes(p)
    );
    if (portInUse) {
      return res.redirect(
        `/server/network/${id}?port=error&msg=already_in_use`
      );
    }

    try {
      const { data } = await axios.post(
        `${getNodeUrl(node)}/server/network/${server.idt}/add/${port}`,
        {},
        { params: { key: node.key } }
      );
      const { containerId: newContainerId } = data;

      // Update user server
      server.containerId = newContainerId;
      user.servers = user.servers.map((s) => (s.id === server.id ? server : s));
      unsqh.put("users", user.id, user);

      // Update admin/server DB
      const adminServer = unsqh.get("servers", server.id);
      if (adminServer) {
        adminServer.containerId = newContainerId;
        unsqh.put("servers", server.id, adminServer);
      }

      syncServerPorts(user, server, data.ports);

      res.redirect(`/server/network/${id}?port=added`);
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.redirect(`/server/network/${id}?port=error`);
    }
  }
);

/**
 * POST /server/network/:id/setprimary/:port
 */
router.post(
  "/server/network/:id/setprimary/:port",
  requireAuth,
  withServer,
  async (req, res) => {
    const { id, port } = req.params;

    const user = unsqh.get("users", req.session.userId);
    const server = getServerForUser(req.session.userId, id);
    if (!server || !server.node) return res.redirect("/dashboard");

    const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
    if (!node) return res.status(404).send("Node not found");

    try {
      const { data } = await axios.post(
        `${getNodeUrl(node)}/server/network/${server.idt}/setprimary/${port}`,
        {},
        { params: { key: node.key } }
      );
      const { containerId: newContainerId } = data;

      // Update user server
      server.containerId = newContainerId;
      user.servers = user.servers.map((s) => (s.id === server.id ? server : s));
      unsqh.put("users", user.id, user);

      // Update admin/server DB
      const adminServer = unsqh.get("servers", server.id);
      if (adminServer) {
        adminServer.containerId = newContainerId;
        unsqh.put("servers", server.id, adminServer);
      }

      syncServerPorts(user, server, data.ports, Number(port));

      res.redirect(`/server/network/${id}?port=primary`);
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.redirect(`/server/network/${id}?port=error`);
    }
  }
);

/**
 * POST /server/network/:id/remove/:port
 */
router.post(
  "/server/network/:id/remove/:port",
  requireAuth,
  withServer,
  async (req, res) => {
    const { id, port } = req.params;

    const user = unsqh.get("users", req.session.userId);
    const server = getServerForUser(req.session.userId, id);
    if (!server || !server.node) return res.redirect("/dashboard");

    const node = unsqh.list("nodes").find((n) => n.ip === server.node.ip);
    if (!node) return res.status(404).send("Node not found");

    try {
      const { data } = await axios.post(
        `${getNodeUrl(node)}/server/network/${server.idt}/remove/${port}`,
        {},
        { params: { key: node.key } }
      );

      const { containerId: newContainerId } = data;

      // Update user server
      server.containerId = newContainerId;
      user.servers = user.servers.map((s) => (s.id === server.id ? server : s));
      unsqh.put("users", user.id, user);

      // Update admin/server DB
      const adminServer = unsqh.get("servers", server.id);
      if (adminServer) {
        adminServer.containerId = newContainerId;
        unsqh.put("servers", server.id, adminServer);
      }
      // ✅ UPDATE PANEL DB
      syncServerPorts(user, server, data.ports);

      res.redirect(`/server/network/${id}?port=removed`);
    } catch (err) {
      console.error(err.response?.data || err.message);
      res.redirect(`/server/network/${id}?port=error`);
    }
  }
);

/**
 * GET /server/network/:id
 * Render server network page
 */
router.get("/server/network/:id", requireAuth, withServer, (req, res) => {
  const user = unsqh.get("users", req.session.userId);
  if (!user) return res.redirect("/");

  const server = getServerForUser(req.session.userId, req.params.id);
  if (!server) return res.redirect("/dashboard");

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";

  if (!server.ports || server.ports.length === 0) {
    server.ports = server.port ? [server.port] : [];
  }
  if (!server.port && server.ports.length > 0) {
    server.port = server.ports[0];
  }

  res.render("server/network", {
    name: appName,
    user,
    server,
  });
});

module.exports = router;
