const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const unsqh = require("../modules/db.js");
const axios = require('axios');
/* =========================
   MIDDLEWARE
========================= */

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect("/");
  next();
}

async function checkNodeHealth(node) {
  try {
    const res = await fetch(
      `http://${node.ip}:${node.port}/health?key=${node.key}`,
      { timeout: 3000 }
    );

    if (!res.ok) throw new Error("Bad response");

    const data = await res.json();

    if (data.status === "online") return "online";
    if (data.status === "dockernotrunning") return "dockernotrunning";

    return "offline";
  } catch {
    return "offline";
  }
}
function getNodeUrl(node) {
  return `http://${node.ip}:${node.port}`;
}
function requireAdmin(req, res, next) {
  const user = unsqh.get("users", req.session.userId);
  if (!user || user.admin !== true) {
    return res.status(403).send("Forbidden");
  }
  next();
}

/* =========================
   USER DASHBOARD 
========================= */

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

/* =========================
   ADMIN ROUTES
========================= */

/**
 * POST /admin/node/create
 * body: { name, ram, core, ip, port }
 */
router.post("/admin/node/create", requireAuth, requireAdmin, (req, res) => {
  const { name, ram, core, ip, port } = req.body;

  if (!name || !ram || !core || !ip || !port) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const id = crypto.randomUUID();
  const key = crypto.randomBytes(32).toString("hex");

  const node = {
    name,
    ram,
    core,
    ip,
    port,
    key,
    status: "offline",
    createdAt: Date.now()
  };

  unsqh.put("nodes", id, node);

  res.json({
    id,
    key,
    status: "created"
  });
});


/**
 * GET /admin/nodes
 * List all nodes
 */
router.get("/admin/nodes", requireAuth, requireAdmin, async (req, res) => {
  const nodes = unsqh.list("nodes");

  for (const node of nodes) {
    const status = await checkNodeHealth(node);

    if (node.status !== status) {
      unsqh.update("nodes", node.id, { status });
      node.status = status;
    }
  }
  
  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  res.render("admin/nodes", {
    name: appName,
    user,
    nodes
  });
});

/**
 * POST /admin/node/:id/configure-key
 */
router.post("/admin/node/:id/configure-key", requireAuth, requireAdmin, (req, res) => {
  const node = unsqh.get("nodes", req.params.id);
  if (!node) return res.status(404).json({ error: "Node not found" });

  const panelUrl = `${req.protocol}://${req.get("host")}`;

  res.json({
    command: `npm run configure --key ${node.key} --panel ${panelUrl}`
  });
});

/**
 * POST /admin/node/:id
 * Returns node info (API)
 */
router.post("/admin/node/:id", requireAuth, requireAdmin, async (req, res) => {
  const node = unsqh.get("nodes", req.params.id);
  if (!node) return res.status(404).json({ error: "Node not found" });

  const status = await checkNodeHealth(node);

  if (node.status !== status) {
    unsqh.update("nodes", req.params.id, { status });
    node.status = status;
  }

  res.json(node);
});

/**
 * GET /admin/node/:id
 * Render node info page
 */
router.get("/admin/node/:id", requireAuth, requireAdmin, async (req, res) => {
  const node = unsqh.get("nodes", req.params.id);
  if (!node) return res.redirect("/admin/nodes");

  const status = await checkNodeHealth(node);
  if (node.status !== status) {
    unsqh.update("nodes", req.params.id, { status });
    node.status = status;
  }

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  res.render("admin/node", {
    name: appName,
    user,
    node,
    req
  });
});

/**
 * DELETE /admin/node/:id/delete
 */
router.post("/admin/node/:id/delete", requireAuth, requireAdmin, (req, res) => {
  const node = unsqh.get("nodes", req.params.id);
  if (!node) return res.status(404).json({ error: "Node not found" });

  unsqh.delete("nodes", req.params.id);

  res.json({ success: true });
});

/**
 * GET /admin/node/stats/:id
 * Fetch node stats from the node API
 */
router.get("/admin/node/stats/:id", requireAuth, requireAdmin, async (req, res) => {
  const node = unsqh.get("nodes", req.params.id);
  if (!node) return res.status(404).json({ error: "Node not found" });

  try {
    const response = await fetch(`http://${node.ip}:${node.port}/stats?key=${node.key}`);
    if (!response.ok) throw new Error(`Node returned ${response.status}`);
    
    const stats = await response.json();
    res.json({ stats });
  } catch (err) {
    console.error("Failed to fetch node stats:", err);
    res.status(500).json({ error: "Failed to fetch node stats" });
  }
});


/**
 * GET /admin/images
 * List all images
 */
router.get("/admin/images", requireAuth, requireAdmin, (req, res) => {
  const images = unsqh.list("images");
  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  res.render("admin/images", { name: appName, user, images });
});

/**
 * GET /admin/images/new
 * Render create image page
 */
router.get("/admin/images/new", requireAuth, requireAdmin, (req, res) => {
  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  res.render("admin/new-image", { name: appName, user });
});

/**
 * GET /admin/images/export/:id
 * Export a single image as JSON
 */
router.get("/admin/images/export/:id", requireAuth, requireAdmin, (req, res) => {
  const image = unsqh.get("images", req.params.id);
  if (!image) return res.status(404).send("Image not found");

  const exportData = {
    dockerImage: image.dockerImage,
    name: image.name,
    description: image.description,
    envs: image.envs,
    files: image.files
  };

  const jsonStr = JSON.stringify(exportData, null, 2);

  res.setHeader("Content-Disposition", `attachment; filename="${image.name.replace(/\s+/g, '_')}.json"`);
  res.setHeader("Content-Type", "application/json");

  res.send(jsonStr);
});

/**
 * POST /admin/images/new
 * Create a new image
 * body: { dockerImage, name, description, envs, files }
 */
router.post("/admin/images/new", requireAuth, requireAdmin, (req, res) => {
  const { dockerImage, name, description, envs, files } = req.body;

  if (!dockerImage || !name) return res.status(400).json({ error: "Missing fields" });

  const id = crypto.randomUUID();
  const image = {
    id,
    dockerImage,
    name,
    description: description || "",
    envs: envs || {},
    files: files || [], // [{ filename, url }]
    createdAt: Date.now()
  };

  unsqh.put("images", id, image);

  res.json({ success: true, image });
});

/**
 * POST /admin/images/delete/:id
 * Delete an image
 */
router.post("/admin/images/delete/:id", requireAuth, requireAdmin, (req, res) => {
  const image = unsqh.get("images", req.params.id);
  if (!image) return res.status(404).json({ error: "Image not found" });

  unsqh.delete("images", req.params.id);
  res.json({ success: true });
});


/**
 * GET /admin/servers
 * List all servers
 */
router.get("/admin/servers", requireAuth, requireAdmin, (req, res) => {
  const servers = unsqh.list("servers");
  const users = unsqh.list("users");
  const nodes = unsqh.list("nodes");
  const images = unsqh.list("images");

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  res.render("admin/servers", { name: appName, user, servers, users, nodes, images });
});

/**
 * GET /admin/servers
 * List all servers (admin view)
 */
router.get("/admin/servers", requireAuth, requireAdmin, (req, res) => {
  const servers = unsqh.list("servers");
  const users = unsqh.list("users");
  const nodes = unsqh.list("nodes");
  const images = unsqh.list("images");

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  res.render("admin/servers", { name: appName, user, servers, users, nodes, images });
});

/**
 * GET /admin/servers/new
 * Render create server page
 */
router.get("/admin/servers/new", requireAuth, requireAdmin, (req, res) => {
  const nodes = unsqh.list("nodes").filter(n => n.status === "online");
  const images = unsqh.list("images");
  const users = unsqh.list("users");

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  res.render("admin/new-server", { name: appName, user, nodes, images, users });
});

/**
 * POST /admin/servers/new
 */
router.post("/admin/servers/new", requireAuth, requireAdmin, async (req, res) => {
  const { imageId, nodeId, name, ram, core, disk, port, userId, env = {} } = req.body;

  if (!imageId || !nodeId || !name || !userId) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const node = unsqh.get("nodes", nodeId);
  if (!node) return res.status(404).json({ error: "Node not found" });

  const image = unsqh.get("images", imageId);
  if (!image) return res.status(404).json({ error: "Image not found" });

  const targetUser = unsqh.get("users", userId);
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  const finalEnv = {};
  for (const key of Object.keys(image.envs || {})) {
    finalEnv[key] = env[key] ?? image.envs[key];
  }

  const interpolateEnv = (str, envObj = {}) => {
    if (typeof str !== "string") return str;
    return str.replace(/\$\{(\w+)\}/g, (_, key) => {
      return envObj[key] ?? process.env[key] ?? "";
    });
  };

  try {
    const resolvedFiles = (image.files || []).map(file => ({
      ...file,
      url: interpolateEnv(file.url, finalEnv),
      name: interpolateEnv(file.name, finalEnv)
    }));

    const response = await axios.post(
      `http://${node.ip}:${node.port}/server/create?key=${node.key}`,
      {
        dockerimage: image.dockerImage,
        env: finalEnv,
        name,
        ram,
        core,
        disk,
        port,
        files: resolvedFiles
      }
    );

    const { containerId, idt } = response.data;

    const serverId = crypto.randomUUID();
    const serverData = {
      id: serverId,
      userId,
      node: { ip: node.ip, name: node.name },
      imageId,
      name,
      ram,
      core,
      disk,
      port,
      containerId,
      idt,
      env: finalEnv,
      suspended: false,
      createdAt: Date.now()
    };

    unsqh.put("servers", serverId, serverData);

    targetUser.servers = targetUser.servers || [];
    targetUser.servers.push(serverData);
    unsqh.update("users", userId, { servers: targetUser.servers });

    res.json({ success: true, server: serverData });
  } catch (err) {
    console.error("Failed to deploy server:", err);
    res.status(500).json({ error: "Failed to deploy server" });
  }
});

/**
 * POST /admin/edit/:serverId
 * Edit a server (admin)
 * Body: { name?, ram?, core?, disk?, port?, imageId?, env?, files? }
 * - files: [{ filename, url }] – optional, will be downloaded/overwritten on node
 */
router.post("/admin/edit/:serverId", requireAuth, requireAdmin, async (req, res) => {
  const { serverId } = req.params;
  const server = unsqh.get("servers", serverId);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const node = unsqh.list("nodes").find(n => n.ip === server.node.ip);
  if (!node) return res.status(404).json({ error: "Node not found" });

  const {
    name,
    ram,
    core,
    disk,
    port,
    env: newEnv = {},
    files: newFiles = [],
    imageId
  } = req.body;

  let image;
  if (imageId) {
    image = unsqh.get("images", imageId);
    if (!image) return res.status(404).json({ error: "Image not found" });
  } else {
    image = unsqh.get("images", server.imageId);
  }

  // Merge env variables (existing server env overridden by newEnv)
  const mergedEnv = { ...(server.env || {}), ...(newEnv || {}) };
  
  // If image has envs, ensure defaults are included
  for (const key of Object.keys(image.envs || {})) {
    if (mergedEnv[key] === undefined) mergedEnv[key] = image.envs[key];
  }

  // Interpolate file URLs
  const interpolateEnv = (str, envObj = {}) => {
    if (typeof str !== "string") return str;
    return str.replace(/\$\{(\w+)\}/g, (_, key) => envObj[key] ?? process.env[key] ?? "");
  };
  const resolvedFiles = (newFiles.length ? newFiles : image.files || []).map(file => ({
    ...file,
    url: interpolateEnv(file.url, mergedEnv),
    name: interpolateEnv(file.name, mergedEnv)
  }));

  try {
    // Send edit request to the node
    const response = await axios.post(
      `${getNodeUrl(node)}/server/edit`,
      {
        idt: server.idt,
        dockerimage: image.dockerImage,
        env: mergedEnv,
        name: name || server.name,
        ram: ram || server.ram,
        core: core || server.core,
        disk: disk || server.disk,
        port: port || server.port,
        files: resolvedFiles
      },
      { params: { key: node.key, idt: server.idt } }
    );

    const { containerId } = response.data;

    // Update admin server info
    server.name = name || server.name;
    server.ram = ram || server.ram;
    server.core = core || server.core;
    server.disk = disk || server.disk;
    server.port = port || server.port;
    server.env = mergedEnv;
    server.imageId = image.id;
    server.containerId = containerId;
    server.files = resolvedFiles;

    unsqh.put("servers", server.id, server);

    // Update user's server list
    const user = unsqh.get("users", server.userId);
    if (user && user.servers) {
      user.servers = user.servers.map(s => s.id === server.id ? server : s);
      unsqh.put("users", user.id, user);
    }

    res.json({ success: true, server });
  } catch (err) {
    console.error("Failed to edit server:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to edit server", details: err.message });
  }
});

/**
 * GET /admin/edit/:serverId
 * Render admin server edit page
 */
router.get("/admin/edit/:serverId", requireAuth, requireAdmin, (req, res) => {
  const { serverId } = req.params;
  const server = unsqh.get("servers", serverId);
  if (!server) return res.status(404).send("Server not found");

  const user = unsqh.get("users", server.userId);
  const nodes = unsqh.list("nodes").filter(n => n.status === "online");
  const images = unsqh.list("images");
  const users = unsqh.list("users");

  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";

  res.render("admin/edit-server", {
    name: appName,
    user,
    server,
    nodes,
    users,
    images
  });
});


/**
 * POST /admin/servers/suspend/:id
 * Suspend the server thats it ;3
 */
router.post("/admin/servers/suspend/:id", requireAuth, requireAdmin, async (req, res) => {
  const server = unsqh.get("servers", req.params.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  if (server.node && server.node.ip && server.node.key && server.containerId) {
    try {
      await axios.post(
        `http://${server.node.ip}:${server.node.port}/server/action/${server.containerId}?action=stop&key=${server.node.key}`
      );
    } catch (nodeErr) {
      console.warn("Failed to stop server on node, ignoring:", nodeErr.message);
    }
  }

  server.suspended = true;
  unsqh.update("servers", server.id, { suspended: true });

  const user = unsqh.get("users", server.userId);
  if (user && user.servers) {
    const userServer = user.servers.find(s => s.id === server.id);
    if (userServer) userServer.suspended = true;
    unsqh.update("users", user.id, { servers: user.servers });
  }

  res.json({ success: true, suspended: true });
});


/**
 * POST /admin/servers/unsuspend/:id
 */
router.post("/admin/servers/unsuspend/:id", requireAuth, requireAdmin, (req, res) => {
  const server = unsqh.get("servers", req.params.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  server.suspended = false;
  unsqh.update("servers", server.id, { suspended: false });

  const user = unsqh.get("users", server.userId);
  if (user && user.servers) {
    const userServer = user.servers.find(s => s.id === server.id);
    if (userServer) userServer.suspended = false;
    unsqh.update("users", user.id, { servers: user.servers });
  }

  res.json({ success: true, suspended: false });
});

/**
 * DELETE /admin/servers/delete/:id
 */
router.delete("/admin/servers/delete/:id", requireAuth, requireAdmin, async (req, res) => {
  const server = unsqh.get("servers", req.params.id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  const node = unsqh.list("nodes").find(n => n.ip === server.node.ip);
  if (!node) return res.status(404).json({ error: "Node not found" });

  try {
    // Tell node to delete container if node info is available
    if (server && server.idt) {
      try {
        const response = await axios.delete(
          `http://${node.ip}:${node.port}/server/delete/${server.idt}?key=${node.key}`
        );
      } catch (nodeErr) {
        console.warn("Failed to delete server on node:");
      }
    }

    // Remove from user's servers array
    const user = unsqh.get("users", server.userId);
    if (user && user.servers) {
      user.servers = user.servers.filter((s) => s.id !== server.id);
      unsqh.update("users", user.id, { servers: user.servers });
    }

    // Remove from admin servers table
    unsqh.delete("servers", req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to delete server:", err.message);
    res.status(500).json({ error: "Failed to delete server" });
  }
});

/**
 * GET /admin/settings
 * Render admin settings page
 */
router.get("/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const settings = unsqh.get("settings", "app") || {};
  const appName = settings.name || "App";
  const user = unsqh.get("users", req.session.userId);

  res.render("admin/settings", {
    name: appName,
    user,
    settings
  });
});

/**
 * POST /admin/settings
 * Update settings (e.g., app name)
 */
router.post("/admin/settings", requireAuth, requireAdmin, (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "App name is required" });
  }

  const updatedSettings = { name: name.trim() };
  unsqh.put("settings", "app", updatedSettings);

  res.json({ success: true, settings: updatedSettings });
});

module.exports = router;
