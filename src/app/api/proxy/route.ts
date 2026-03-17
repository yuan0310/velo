import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get("url");
    if (!url) return new Response("Missing URL", { status: 400 });

    const range = req.headers.get("range");

    try {
        const urlObj = new URL(url);
        const fetchHeaders: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": `${urlObj.protocol}//${urlObj.hostname}/`,
        };

        if (range) {
            fetchHeaders["Range"] = range;
        }

        const res = await fetch(url, {
            headers: fetchHeaders,
            redirect: 'follow'
        });

        if (!res.ok && res.status !== 206) {
            console.error(`Proxy: Provider returned ${res.status}`);
            return new Response(`Provider error: ${res.status}`, { status: res.status });
        }

        const responseHeaders = new Headers();

        // Pass through essential headers for streaming
        const headersToPass = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"];
        headersToPass.forEach(h => {
            const val = res.headers.get(h);
            if (val) responseHeaders.set(h, val);
        });

        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Cache-Control", "public, max-age=3600");

        return new Response(res.body, {
            status: res.status,
            headers: responseHeaders,
        });
    } catch (error: any) {
        console.error("Proxy failure:", error.message);
        return new Response(`Proxy error: ${error.message}`, { status: 500 });
    }
}
