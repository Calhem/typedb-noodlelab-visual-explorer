import { mkdirSync, writeFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Development only: lets the page save review screenshots into web/shots/ (git-ignored). */
function saveShots(): Plugin {
  return {
    name: "save-shots",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__shots/", (req, res) => {
        const name = (req.url ?? "").replace(/^\//, "");
        if (req.method !== "POST" || !/^[a-z0-9-]+\.jpg$/.test(name)) {
          res.statusCode = 400;
          return res.end();
        }
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          mkdirSync("shots", { recursive: true });
          writeFileSync(`shots/${name}`, Buffer.concat(chunks));
          res.end("saved");
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), saveShots()],
  server: { strictPort: true, watch: { usePolling: true, ignored: ["**/shots/**"] } }, // polling: file changes from a Mac bind mount
});
