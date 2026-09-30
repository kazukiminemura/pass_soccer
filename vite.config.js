import { defineConfig } from 'vite';
import { youtubePlugin } from './server/youtube.js';

export default defineConfig({ plugins: [youtubePlugin()] });
