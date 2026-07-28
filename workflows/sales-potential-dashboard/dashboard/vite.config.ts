import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build de arquivo único: o resultado (dist/index.html) é um HTML
// autocontido, sem <script src> nem <link> externos — todo o JS/CSS fica
// inline. Isso é proposital: o node "Build Dashboard HTML" do n8n embute
// esse arquivo como string dentro de um Code node, e o ambiente do cliente
// (rede corporativa Bosch) já evitava dependências de CDN externo no
// dashboard anterior ("sem fetch() externo, sem CORS").
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5_000,
  },
});
