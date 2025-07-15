import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        preserveSymlinks: true
    },
    build: {
        outDir: "../backend/static",
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: id => {
                    if (id.includes("@fluentui/react-icons")) {
                        return "fluentui-icons";
                    } else if (id.includes("@fluentui/react")) {
                        return "fluentui-react";
                    } else if (id.includes("node_modules")) {
                        return "vendor";
                    }
                }
            }
        },
        target: "esnext"
    },
    server: {
        proxy: {
            "/content/": "http://localhost:8080",
            "/auth_setup": "http://localhost:8080",
            "/.auth/me": "http://localhost:8080",
            "/ask": "http://localhost:8080",
            "/chat": "http://localhost:8080",
            "/speech": "http://localhost:8080",
            "/config": "http://localhost:8080",
            "/upload": "http://localhost:8080",
            "/delete_uploaded": "http://localhost:8080",
            "/list_uploaded": "http://localhost:8080",
            "/chat_history": "http://localhost:8080",
            "/api/permit": "http://localhost:8080"
        }
    }
});
