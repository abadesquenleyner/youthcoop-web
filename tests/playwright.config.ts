import { defineConfig } from '@playwright/test';

// Dos servidores, solo mientras corre la prueba:
//  :4181  servidor estático que imita GitHub Pages (cada build bajo su subruta: /youthcoop/, /endpoint/, /redirect/, /visual/, /real/)
//  :4182  `vite preview` del build final en la raíz
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './global-setup.ts',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { browserName: 'chromium', trace: 'off' },
  webServer: [
    {
      command: 'node servidor-estatico.mjs 4181 /youthcoop/=../dist /endpoint/=../dist-endpoint /redirect/=../dist-redirect /visual/=../dist-visual /real/=../dist-real',
      url: 'http://127.0.0.1:4181/youthcoop/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx vite preview --outDir dist --port 4182 --strictPort',
      cwd: '..',
      url: 'http://127.0.0.1:4182/',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
