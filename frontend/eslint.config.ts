import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  // Vitest 测试规范：强制使用 test() 而非 it()
  {
    name: 'vitest/prefer-test',
    files: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'it',
          message: '使用 test() 替代 it()',
        },
        {
          name: 'xit',
          message: '使用 test.skip() 替代 xit()',
        },
        {
          name: 'fit',
          message: '使用 test.only() 替代 fit()',
        },
      ],
    },
  },

  skipFormatting,
)
