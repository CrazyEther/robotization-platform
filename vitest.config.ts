import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['packages/**/*.test.ts','tests/**/*.test.ts'],exclude:['tests/e2e/**']}});
