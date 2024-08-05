import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import viteMarkdownPlugin from 'vite-plugin-vue-md';
import vueJsx from '@vitejs/plugin-vue-jsx';
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx({}), viteMarkdownPlugin()],
});
