import { normalizePath, FileSystemAdapter } from "obsidian";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { SWIFT_SCRIPT_TEMPLATE, SummarDebug } from "./globals";
import { writeFileSync, unlinkSync } from "fs";
import SummarPlugin from "./main";

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
    private plugin: SummarPlugin;
    private events: CalendarEvent[] = [];
    // dirtyFlag: boolean = false;
    autoRecord: boolean = false;
    eventContainer: HTMLElement;
    private timers: { title: string; start: Date, timeoutId: NodeJS.Timeout }[] = [];

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
            }, this.plugin.settings.calendar_polling_interval); // 10분 (600,000ms)
            // }, 10 * 60 * 1000); // 10분 (600,000ms)
        } catch (error) {
            console.error("Error initializing CalendarHandler:", error);
        }
    }
    
    // ✅ 클래스 종료 시 `setInterval` 해제
    public stop() {
        clearInterval(this.intervalId);
        console.log("Stopped CalendarHandler updates.");
    }

    formatPrintf(template: string, ...args: any[]): string {
        let i = 0;
        return template.replace(/%[sd]/g, (match) => {
            if (i >= args.length) return match; // 인자 부족 시 그대로 둠
            return match === "%d" ? Number(args[i++]).toString() : String(args[i++]);
        });
    }

    async fetchZoomMeetings(): Promise<ZoomMeeting[]> {
        return new Promise((resolve, reject) => {

            let calendarNames ="";
            for (let i = 1; i <= this.plugin.settings.calendar_count; i++) {
                calendarNames += "\"" + this.plugin.settings[`calendar_${i}`] + "\", ";
            }

            const scriptPath = normalizePath((this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath() + "/.obsidian/plugins/summar/fetch_calendar.swift");
            const scriptFile = this.formatPrintf(SWIFT_SCRIPT_TEMPLATE, this.plugin.settings.calendar_fetchdays, calendarNames);
            writeFileSync(scriptPath, scriptFile, "utf-8");

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

            // unlinkSync(scriptPath);
        });
    }

    async updateScheduledMeetings() {
        try {
            const meetings = await this.fetchZoomMeetings(); // Swift 실행 결과를 JSON으로 받음

            this.events.length = 0;
            // JSON 데이터를 CalendarEvent[] 타입으로 변환
            // const events: CalendarEvent[] = meetings.map((meeting) => ({
            // 새로운 데이터 추가
            this.events.push(...meetings.map(meeting => ({
                title: meeting.title,
                start: new Date(meeting.start),
                end: new Date(meeting.end),
                description: meeting.description,
                location: meeting.location,
                zoom_link: meeting.zoom_link,
            })));

            this.timers.forEach(({ timeoutId, title }) => {
                clearTimeout(timeoutId);
                SummarDebug.log(1, `🗑️ "${title}" 타이머 제거됨`);
            });
            this.timers = [];

            const MAX_DELAY = this.plugin.settings.calendar_polling_interval * 3;

            // Loop를 돌면서 콘솔 출력
            // events.forEach((event, index) => {
            this.events.forEach((event, index) => {
                SummarDebug.log(1, `📅 Event ${index + 1}: ${event.title}`);
                SummarDebug.log(1, `   ⏳ Start: ${event.start}`);
                SummarDebug.log(1, `   ⏳ End: ${event.end}`);
                // SummarDebug.log(1, `   📍 Location: ${event.location}`);
                // SummarDebug.log(1, `   📝 Description: ${event.description || "No description"}`);
                SummarDebug.log(1, `   🔗 Zoom Link: ${event.zoom_link || "No Zoom link"}`);
                SummarDebug.log(1, "------------------------------------------------");

                const now = new Date();
                const delayMs = event.start.getTime() - now.getTime();

                if (this.plugin.settings.autoRecording && delayMs > 0 && delayMs < MAX_DELAY) {
                    const timer = setTimeout(async() => {
                        if (this.plugin.recordingManager.getRecorderState() !== "recording") {
                            await this.plugin.recordingManager.startRecording(this.plugin.settings.recordingUnit);
                        }
                        this.launchZoomMeeting(event.zoom_link as string);
                        clearTimeout(timer);
                    }, delayMs);
                    SummarDebug.log(1, `   🚀 Zoom meeting reserved: ${event.start}`);
                    this.timers.push({ title: event.title, start: event.start, timeoutId: timer });
                }
                SummarDebug.log(1, "================================================");
            });
        } catch (error) {
            SummarDebug.error(1, "Error fetching Zoom meetings:", error);
        }
    }

    displayEvents(display?: boolean, containerEl?: HTMLElement) {
        // 기본 containerEl 설정
        if (containerEl) {
            this.eventContainer = containerEl; // 기본 컨테이너 엘리먼트를 참조하도록 수정
        }

        if (display !== undefined) {
            this.autoRecord = display;
        }

        // 이전에 표시된 내용을 모두 삭제
        this.eventContainer.innerHTML = "";
        this.eventContainer.replaceChildren(); // 모든 자식 요소 제거

        // display가 true일 경우에만 이벤트 표시
        if (this.autoRecord) {
            this.events.forEach((event, index) => {
                const eventEl = this.createEventElement(event, index);
                this.eventContainer.appendChild(eventEl);
            });
        }
    }

    createEventElement(event: CalendarEvent, index: number): HTMLElement {
        const eventEl = document.createElement("div");
        eventEl.classList.add("event");
        eventEl.innerHTML = `
            <div class="event-title">📅 ${event.title}</div>
            <div class="event-time">⏳${event.start.toLocaleString()} - ⏳${event.end.toLocaleString()}</div>
            <a href="${event.zoom_link}" class="event-zoom-link" target="_blank">🔗Join Zoom Meeting</a>
            <p>
        `;
        return eventEl;
    }

    /**
     * 전달받은 Zoom URL을 사용하여 Zoom 미팅을 실행하는 함수.
     * macOS에서는 'open' 명령어를 사용합니다.
     */
    async launchZoomMeeting(url: string): Promise<void> {
        const execAsync = promisify(exec);
        try {
            console.log(`Zoom 미팅 실행 중: ${url}`);
            const { stdout, stderr } = await execAsync(`open "${url}"`);
            if (stderr && stderr.trim()) {
                console.error("Zoom 미팅 실행 중 에러 발생:", stderr);
            }
        } catch (error) {
            console.error("Zoom 미팅 실행 실패:", error);
        }
    }
}
