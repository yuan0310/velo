import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import os from "os";

export async function POST(req: NextRequest) {
    try {
        const platform = os.platform();
        let command = "";

        if (platform === "win32") {
            // Open the Windows Downloads folder
            command = 'explorer.exe shell:Downloads';
        } else if (platform === "darwin") {
            // Open the macOS Downloads folder
            command = 'open ~/Downloads';
        } else {
            // Generic Linux (xdg-open)
            command = 'xdg-open ~/Downloads';
        }

        exec(command);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
