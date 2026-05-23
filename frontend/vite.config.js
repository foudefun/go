import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.resolve(".");
const assetsDir = path.resolve(rootDir, "assets");

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".webp": "image/webp",
  };
  return types[extension] || "application/octet-stream";
}

function rehabStaticAssetsPlugin() {
  function copyStaticAssets(sourceDir, destinationDir) {
    fs.mkdirSync(destinationDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const sourcePath = path.join(sourceDir, entry.name);
      const destinationPath = path.join(destinationDir, entry.name);
      if (entry.isDirectory()) {
        copyStaticAssets(sourcePath, destinationPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(sourcePath, destinationPath);
      }
    }
  }

  return {
    name: "rehab-static-assets",
    configureServer(server) {
      server.middlewares.use("/assets", (request, response, next) => {
        const rawPath = decodeURIComponent(String(request.url || "").split("?")[0] || "");
        const relativePath = rawPath.replace(/^\/+/, "");
        const filePath = path.resolve(assetsDir, relativePath);
        if (!filePath.startsWith(assetsDir)) {
          next();
          return;
        }

        fs.stat(filePath, (error, stat) => {
          if (error || !stat.isFile()) {
            next();
            return;
          }
          response.setHeader("Content-Type", getContentType(filePath));
          fs.createReadStream(filePath).pipe(response);
        });
      });
    },
    closeBundle() {
      if (fs.existsSync(assetsDir)) {
        copyStaticAssets(assetsDir, path.resolve(rootDir, "dist", "assets"));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), rehabStaticAssetsPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(rootDir, "index.html"),
      },
    },
  },
});
