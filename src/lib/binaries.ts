import path from "path";
import fs from "fs";

/**
 * Resolves the path to external binaries (ffmpeg, yt-dlp).
 * We prioritize bundled binaries in resources/bin, then fallback to system PATH.
 */
export function getBinaryPath(binaryName: string): string {
    const isWin = process.platform === "win32";
    const exeName = isWin ? `${binaryName}.exe` : binaryName;

    // 1. Look in resources/bin (relative to project root - for Dev/Web server)
    const localPath = path.join(process.cwd(), "resources", "bin", exeName);
    if (fs.existsSync(localPath)) {
        return localPath;
    }

    // 2. Look in Electron resources path (for Packaged Electron)
    // We check process.resourcesPath if it exists (Electron environment)
    const resourcesPath = (process as any).resourcesPath;
    if (resourcesPath) {
        const electronLocalPath = path.join(resourcesPath, "bin", exeName);
        if (fs.existsSync(electronLocalPath)) {
            return electronLocalPath;
        }
    }

    // 2. Fallback to system command
    return binaryName;
}
