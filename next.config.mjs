/** @type {import('next').NextConfig} */
const nextConfig = {
    // We cannot use output: 'export' because Velo relies heavily on API routes
    // (/api/download, /api/resolve) which require a Node.js runtime.
    // The current approach in electron/main.js starts a Next.js server instance
    // which is the correct architecture for this specific app.
};

export default nextConfig;
