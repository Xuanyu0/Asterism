import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@my-project/graph-engine': fileURLToPath(new URL('../packages/graph-engine/src', import.meta.url)),
        },
    },
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'jsdom',
    },
})
