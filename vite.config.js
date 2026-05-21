import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/minigame/',
  build: {
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'index.html'),
        lobby: resolve(__dirname, 'lobby.html'),
        game:  resolve(__dirname, 'game.html'),
      }
    }
  }
})
