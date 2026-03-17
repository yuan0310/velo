import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getBinaryPath } from "@/lib/binaries";

const execPromise = promisify(exec);

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
        const ytdlp = getBinaryPath("yt-dlp");
        // Always add --no-playlist to avoid hanging on large YouTube mixes/playlists
        const baseArgs = `--no-playlist --dump-json "${url}"`;

        const pythonCmd = process.platform === 'darwin' ? 'python3' : 'python';
        const command = (ytdlp.includes("/") || ytdlp.includes("\\"))
            ? `"${ytdlp}" ${baseArgs}`
            : `${pythonCmd} -m yt_dlp ${baseArgs}`;

        const { stdout } = await execPromise(command);
        const data = JSON.parse(stdout);

        // Identify a suitable preview URL
        // We prioritize "legacy" formats (18, 22) because they are single-file MP4s 
        // that are much easier to proxy and play in native <video> tags.
        const previewFormat = data.formats.find((f: any) => f.format_id === "22") // 720p MP4
            || data.formats.find((f: any) => f.format_id === "18") // 360p MP4
            || data.formats.find((f: any) =>
                f.vcodec !== "none" &&
                f.acodec !== "none" &&
                f.ext === "mp4" &&
                (f.height || 0) <= 720
            )
            || data.formats.find((f: any) => f.vcodec !== "none" && f.acodec !== "none")
            || data.formats[0]; // Absolute fallback

        // Select primary formats for download options
        let primaryFormats = data.formats.filter((f: any) => f.vcodec !== "none" && f.acodec !== "none");

        // If no combined formats found, include video-only formats as well (the downloader handles merging)
        if (primaryFormats.length === 0) {
            primaryFormats = data.formats.filter((f: any) => f.vcodec !== "none");
        }

        // Extract relevant data for the frontend
        const info = {
            title: data.title,
            thumbnail: data.thumbnail,
            duration: data.duration, // in seconds
            uploader: data.uploader,
            filesize_approx: data.filesize_approx || data.filesize,
            previewUrl: previewFormat?.url,
            formats: primaryFormats
                .map((f: any) => ({
                    formatId: f.format_id,
                    ext: f.ext,
                    resolution: f.resolution || (f.width && f.height ? `${f.width}x${f.height}` : f.format_note),
                    filesize: f.filesize || f.filesize_approx,
                    quality: f.format_note || f.resolution,
                }))
                .reverse(),
        };

        return NextResponse.json(info);
    } catch (error: any) {
        console.error("Resolver Error:", error);
        return NextResponse.json(
            { error: "Failed to resolve video info", details: error.message },
            { status: 500 }
        );
    }
}
