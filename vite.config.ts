import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: { server: { entry: "server" } },
  nitro: { preset: process.env["VERCEL"] === "1" ? "vercel" : "cloudflare-module" }
});
