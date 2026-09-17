import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: './src/worker/index.ts',
      miniflare: {
        compatibilityDate: '2026-09-01',
        modulesRules: [{ type: 'Text', include: ['**/*.sql'], fallthrough: true }],
        d1Databases: ['DB'],
        bindings: {
          ADMIN_PASSWORD: 'test-password-not-for-production',
          BOT_TOKEN: '123456789:TEST_TOKEN_FOR_LOCAL_TESTS_ONLY',
          OWNER_ID: '900001',
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
        },
      },
    })),
  ],
  test: { include: ['tests/**/*.test.ts'], testTimeout: 10000, hookTimeout: 10000 },
});
