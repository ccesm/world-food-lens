import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const cachePath = fileURLToPath(new URL("./public/data/official-data.json", import.meta.url));
// Embed the same canonical cache for initial/offline rendering without importing
// from Vite's public directory (which is reserved for URL-served assets).
const officialCache = {
  name: "world-food-lens-official-cache",
  resolveId(id) { if (id === "virtual:official-data") return "\0official-data"; },
  load(id) {
    if (id !== "\0official-data") return;
    this.addWatchFile(cachePath);
    return `export default ${JSON.stringify(JSON.parse(readFileSync(cachePath, "utf8")))};`;
  },
};

export default defineConfig({
  plugins: [react(), officialCache],
  base: "./",
});
