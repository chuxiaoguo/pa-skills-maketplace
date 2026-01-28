import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
  outDir: 'dist',
  base: '/pa-skills-maketplace',
  build: {
    format: 'directory'
  }
});
