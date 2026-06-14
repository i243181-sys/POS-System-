import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main.ts'),
        formats: ['cjs']
      },
      rollupOptions: {
        input: resolve('electron/main.ts'),
        output: {
          format: 'cjs'
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload.ts'),
        formats: ['cjs']
      },
      rollupOptions: {
        input: resolve('electron/preload.ts'),
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve('.'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve('index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared')
      }
    }
  }
})
