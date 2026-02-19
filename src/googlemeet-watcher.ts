import { spawn } from "child_process";
import { SummarDebug } from "./globals";

const IDLE_POLL_INTERVAL_MS = 5000;
const ACTIVE_POLL_INTERVAL_MS = 3000;

const GOOGLE_MEET_DETECT_SCRIPT = `
set meetUrl to ""

try
    tell application "Google Chrome"
        repeat with w in windows
            repeat with t in tabs of w
                set tabUrl to URL of t
                if tabUrl contains "meet.google.com/" then
                    set meetUrl to tabUrl
                end if
            end repeat
        end repeat
    end tell
end try

if meetUrl is "" then
    try
        tell application "Safari"
            repeat with w in windows
                repeat with t in tabs of w
                    set tabUrl to URL of t
                    if tabUrl contains "meet.google.com/" then
                        set meetUrl to tabUrl
                    end if
                end repeat
            end repeat
        end tell
    end try
end if

if meetUrl is "" then
    try
        tell application "Microsoft Edge"
            repeat with w in windows
                repeat with t in tabs of w
                    set tabUrl to URL of t
                    if tabUrl contains "meet.google.com/" then
                        set meetUrl to tabUrl
                    end if
                end repeat
            end repeat
        end tell
    end try
end if

return meetUrl
`;

function isValidGoogleMeetUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== "meet.google.com") return false;
        const path = parsed.pathname.replace(/^\//, "");
        if (!path) return false;
        const segments = path.split("-");
        if (segments.length !== 3) return false;
        return segments.every(seg => /^[a-z]{2,5}$/.test(seg));
    } catch {
        return false;
    }
}

function runAppleScript(script: string): Promise<string> {
    return new Promise((resolve) => {
        const proc = spawn("osascript", [], { stdio: ["pipe", "pipe", "pipe"] });
        let output = "";
        proc.stdout.on("data", (data: Buffer) => { output += data.toString(); });
        proc.on("close", () => resolve(output.trim()));
        proc.on("error", () => resolve(""));
        proc.stdin.write(script);
        proc.stdin.end();
    });
}

export class GoogleMeetWatcher {
    private intervalId?: NodeJS.Timeout;
    private wasActive = false;

    constructor(private readonly onEnd: () => void) {}

    start(): void {
        if (this.intervalId) return;
        this.wasActive = false;
        this.scheduleNext();
        SummarDebug.log(1, "[GoogleMeetWatcher] Started");
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.wasActive = false;
        SummarDebug.log(1, "[GoogleMeetWatcher] Stopped");
    }

    isWatching(): boolean {
        return !!this.intervalId;
    }

    private scheduleNext(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        const interval = this.wasActive ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
        this.intervalId = setInterval(() => this.poll(), interval);
    }

    private async poll(): Promise<void> {
        const isActive = await this.detectGoogleMeet();
        if (isActive && !this.wasActive) {
            this.wasActive = true;
            this.scheduleNext();
            SummarDebug.log(1, "[GoogleMeetWatcher] Google Meet detected as active");
        } else if (!isActive && this.wasActive) {
            SummarDebug.log(1, "[GoogleMeetWatcher] Google Meet tab gone — triggering end");
            this.stop();
            this.onEnd();
        }
    }

    private async detectGoogleMeet(): Promise<boolean> {
        const url = await runAppleScript(GOOGLE_MEET_DETECT_SCRIPT);
        return isValidGoogleMeetUrl(url);
    }
}
