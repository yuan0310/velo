import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getBinaryPath } from "@/lib/binaries";

const execPromise = promisify(exec);

export async function GET() {
    try {
        const pythonCmd = process.platform === 'darwin' ? 'python3' : 'python';
        const ytdlpPath = getBinaryPath("yt-dlp");
        let command = '';

        if (ytdlpPath.includes("/") || ytdlpPath.includes("\\")) {
            // Standalone or bundled binary, ensure it's quoted if it contains spaces
            command = `"${ytdlpPath}" --version`;
        } else {
            // Base python yt-dlp assumption
            command = `${pythonCmd} -m yt_dlp --version`;
        }

        const { stdout } = await execPromise(command);
        return NextResponse.json({ version: stdout.trim() });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST() {
    try {
        const pythonCmd = process.platform === 'darwin' ? 'python3' : 'python';
        const ytdlpPath = getBinaryPath("yt-dlp");
        let command = '';
        
        if (ytdlpPath.includes("/") || ytdlpPath.includes("\\")) {
            // Standalone or bundled binary
            command = `"${ytdlpPath}" --update-to nightly`;
        } else {
            // Base python yt-dlp assumption
            command = `${pythonCmd} -m pip install -U https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz`;
        }
        
        const { stdout } = await execPromise(command);

        // Get new version
        const { stdout: versionOut } = await execPromise(`${pythonCmd} -m yt_dlp --version`);

        return NextResponse.json({
            success: true,
            output: stdout,
            newVersion: versionOut.trim()
        });
    } catch (error: any) {
        console.error("Update API Error:", error);
        return NextResponse.json({
            error: "Update failed. This usually happens if pip needs admin permissions or network is slow.",
            details: error.message
        }, { status: 500 });
    }
}
