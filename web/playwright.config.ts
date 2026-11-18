// Тесты в настоящем браузере (Playwright): npm run test:e2e
// Перед тестами собирается сайт и запускается `vite preview` (mp3 берутся из ../audio).
// Локально используется установленный Google Chrome, в GitHub Actions — Chromium.
import { defineConfig } from "@playwright/test";

const PORT = 4174;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    channel: process.env.CI ? undefined : "chrome",
    viewport: { width: 390, height: 844 },          // ширина телефона
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
