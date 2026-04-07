const { spawnSync } = require("node:child_process");

const fallbackDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/videotik";
const args = process.argv.slice(2);
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const result = spawnSync(npxCommand, ["prisma", ...args], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || fallbackDatabaseUrl
  }
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
