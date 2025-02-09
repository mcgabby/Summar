import { normalizePath } from "obsidian";
import { spawn } from "child_process";
import { SummarDebug } from "./globals";

interface CalendarEvent {
    title: string;
    start: Date;
    end: Date;
    description?: string;
    location?: string;
    zoom_link?: string;
}

interface ZoomMeeting {
    title: string;
    start: string;
    end: string;
    description: string;
    location: string;
    zoom_link: string;
}

export class CalendarHandler {
    private intervalId: NodeJS.Timeout;
    private plugin: any;

    constructor(plugin: any) {
        this.plugin = plugin; // 플러그인 저장
        this.init();
    }

    private async init() {
        try {
            // 초기 실행
            await this.updateScheduledMeetings();

            // 10분마다 업데이트 실행
            this.intervalId = setInterval(() => {
                this.updateScheduledMeetings();
            }, 10 * 60 * 1000); // 10분 (600,000ms)
        } catch (error) {
            console.error("Error initializing CalendarHandler:", error);
        }
    }
    
    // ✅ 클래스 종료 시 `setInterval` 해제
    public stop() {
        clearInterval(this.intervalId);
        console.log("Stopped CalendarHandler updates.");
    }

    async fetchZoomMeetings(): Promise<ZoomMeeting[]> {
        return new Promise((resolve, reject) => {
            const scriptPath = normalizePath(this.plugin.app.vault.adapter.basePath + "/.obsidian/plugins/summar/fetch_calendar.swift");

            const process = spawn("swift", [scriptPath]);
            let output = "";
            let errorOutput = "";

            process.stdout.on("data", (data) => {
                output += data.toString();
            });

            process.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            process.on("close", (code) => {
                if (code === 0) {
                    try {
                        const meetings: ZoomMeeting[] = JSON.parse(output.trim());
                        resolve(meetings);
                    } catch (error) {
                        SummarDebug.error(1, "JSON Parsing Error:", error);
                        reject(new Error("Failed to parse Swift output as JSON"));
                    }
                } else {
                    SummarDebug.error(1, "Swift Execution Error:", errorOutput);
                    reject(new Error("Swift script execution failed"));
                }
            });

            process.on("error", (err) => {
                SummarDebug.error(1, "Swift Process Error:", err);
                reject(new Error("Failed to start Swift process"));
            });
        });
    }

    async updateScheduledMeetings() {
        try {
            const meetings = await this.fetchZoomMeetings(); // Swift 실행 결과를 JSON으로 받음

            // JSON 데이터를 CalendarEvent[] 타입으로 변환
            const events: CalendarEvent[] = meetings.map((meeting) => ({
                title: meeting.title,
                start: new Date(meeting.start),
                end: new Date(meeting.end),
                description: meeting.description,
                location: meeting.location,
                zoom_link: meeting.zoom_link,
            }));

            // Loop를 돌면서 콘솔 출력
            events.forEach((event, index) => {
                SummarDebug.log(1, `📅 Event ${index + 1}: ${event.title}`);
                SummarDebug.log(1, `   ⏳ Start: ${event.start}`);
                SummarDebug.log(1, `   ⏳ End: ${event.end}`);
                SummarDebug.log(1, `   📍 Location: ${event.location}`);
                SummarDebug.log(1, `   📝 Description: ${event.description || "No description"}`);
                SummarDebug.log(1, `   🔗 Zoom Link: ${event.zoom_link || "No Zoom link"}`);
                SummarDebug.log(1, "------------------------------------------------");
            });
        } catch (error) {
            SummarDebug.error(1, "Error fetching Zoom meetings:", error);
        }
    }
}
