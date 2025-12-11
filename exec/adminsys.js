#!/usr/bin/env node
const prompts = require("prompts");
const crypto = require("crypto");
const unsqh = require("../modules/db.js"); 

(async () => {
  console.log("=== Talorix Admin System ===\n");

  const response = await prompts({
    type: "select",
    name: "action",
    message: "Choose an action:",
    choices: [
      { title: "Create a new admin user", value: "create" },
      { title: "Set existing user as admin", value: "set" },
    ]
  });

  if (response.action === "create") {
    const userData = await prompts([
      { type: "text", name: "username", message: "Username:" },
      { type: "text", name: "email", message: "Email:" },
      { type: "password", name: "password", message: "Password:" }
    ]);

    // Check if email exists
    const existing = unsqh.list("users").find(u => u.email === userData.email);
    if (existing) {
      console.log("Error: User with this email already exists.");
      process.exit(1);
    }

    const id = Math.random().toString(36).substring(2, 12);
    const hash = crypto.createHash("sha256").update(userData.password).digest("hex");

    unsqh.put("users", id, {
      id,
      email: userData.email,
      username: userData.username,
      password: hash,
      servers: [],
      admin: true
    });

    console.log(`Admin user created: ${userData.username} (${userData.email})`);

  } else if (response.action === "set") {
    const emailResponse = await prompts({
      type: "text",
      name: "email",
      message: "Enter the email of the user to make admin:"
    });

    const user = unsqh.list("users").find(u => u.email === emailResponse.email);
    if (!user) {
      console.log("Error: No user found with that email.");
      process.exit(1);
    }

    unsqh.put("users", user.id, { ...user, admin: true });
    console.log(`User ${user.username} (${user.email}) is now an admin.`);
  }

  process.exit(0);
})();
