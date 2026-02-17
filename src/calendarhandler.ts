import { Platform, normalizePath, FileSystemAdapter, Modal, App } from "obsidian";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { SummarDebug } from "./globals";
import { writeFileSync, unlinkSync, truncate } from "fs";
import SummarPlugin from "./main";

interface CalendarEvent {
    title: string;
    start: Date;
    end: Date;
    description?: string;
    location?: string;
    zoom_link?: string;
    attendees?: string[];
    participant_status?: string;
}

interface ZoomMeeting {
    title: string;
    start: string;
    end: string;
    description: string;
    location: string;
    zoom_link: string;
    attendees: string[];
    participant_status?: string;
}

export class CalendarHandler {
    private intervalId: NodeJS.Timeout;
    private plugin: SummarPlugin;
    private events: CalendarEvent[] = [];
    autoRecord: boolean = false;
    eventContainer: HTMLElement;
    // private timers: { title: string; start: Date, timeoutId: NodeJS.Timeout }[] = [];
    private timers: Map<number, NodeJS.Timeout> = new Map();

    constructor(plugin: any) {
        this.plugin = plugin; // 플러그인 저장
        this.init();
    }

    private async init() {
        try {
            if (Platform.isMacOS && Platform.isDesktopApp) {
                // Swift 환경 사전 검증
                await this.checkSwiftEnvironment();
                
                // 초기 실행
                await this.updateScheduledMeetings();
                if (this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule) {
                    this.plugin.reservedStatus.setStatusbarIcon("calendar-clock", "red");
                } else {
                    this.plugin.reservedStatus.setStatusbarIcon("calendar-x", "var(--text-muted)");
                }
                // this.plugin.reservedStatus.update(this.plugin.settings.autoLaunchVideoMeetingOnSchedule ? "⏰" : "", this.plugin.settings.autoLaunchVideoMeetingOnSchedule ? "green" : "black");

                // 10분마다 업데이트 실행
                this.intervalId = setInterval(() => {
                    this.updateScheduledMeetings();
                }, this.plugin.settingsv2.schedule.calendar_polling_interval); // 10분 (600,000ms)
            }
        } catch (error) {
            SummarDebug.error(1, "Error initializing CalendarHandler:", error);
        }
    }
    
    // ✅ 클래스 종료 시 `setInterval` 해제
    public stop() {
        clearInterval(this.intervalId);
        SummarDebug.log(1, "Stopped CalendarHandler updates.");
    }

    /**
     * Checks if Swift is installed and available on the system.
     * Returns true if installed, false otherwise.
     * This checks for both Xcode-installed Swift or standalone Swift toolchain.
     */
    async checkSwiftInstalled(): Promise<boolean> {
        return new Promise((resolve) => {
            const { exec } = require("child_process");
            exec("which swift", (error: Error | null, stdout: string, stderr: string) => {
                if (error || !stdout || stdout.trim() === "") {
                    // Swift가 설치되어 있지 않음
                    resolve(false);
                } else {
                    // Swift가 설치되어 있음
                    resolve(true);
                }
            });
        });
    }
    
    /**
     * 사전에 Swift 환경을 검증하여 모듈 충돌 등의 문제를 감지
     */
    async checkSwiftEnvironment(): Promise<void> {
        try {
            // Swift가 설치되어 있는지 확인
            const swiftInstalled = await this.checkSwiftInstalled();
            if (!swiftInstalled) {
                // Swift가 없으면 검사 중단 (설치 시 체크할 예정)
                return;
            }
            
            // 파일 경로 설정
            const basePath = normalizePath((this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath());
            const wrapperPath = basePath + "/.obsidian/plugins/summar/fetch_calendar_wrapper.sh";
            
            // 래퍼 스크립트로 환경 진단 실행
            const { exec } = require("child_process");
            const execAsync = promisify(exec);
            
            const { stdout, stderr } = await execAsync(`/bin/bash "${wrapperPath}" --check-environment`);
            
            // 결과 확인 (모듈 충돌이 있으면 표시)
            if (stderr && stderr.includes("MODULE_CONFLICT")) {
                // 모듈 충돌 문제 감지됨
                const errorMessage = stderr.split("MODULE_CONFLICT:")[1]?.trim() || "Swift 모듈 충돌이 감지되었습니다.";
                
                // 사용자에게 알림
                const notice = SummarDebug.Notice(0, `⚠️ Swift 환경 문제 감지됨\n\n${errorMessage}`, 0);
                
                // Swift 환경 재설정 명령어 표시 및 링크 제공
                if (notice && notice.noticeEl) {
                    notice.noticeEl.createEl("button", { text: "환경 재설정 방법 복사" }, (button) => {
                        button.onclick = () => {
                            navigator.clipboard.writeText("sudo xcode-select --reset\nsudo xcodebuild -runFirstLaunch");
                            if (notice) notice.hide();
                            SummarDebug.Notice(0, "명령어가 클립보드에 복사되었습니다. 터미널에서 실행하세요.", 3000);
                        };
                    });
                }
            }
        } catch (error) {
            SummarDebug.error(1, "Swift 환경 검증 오류:", error);
        }
    }
    
    /**
     * Legacy method for backward compatibility.
     * Now checks for Swift instead of Xcode specifically.
     * @deprecated Use checkSwiftInstalled instead
     */
    async checkXcodeInstalled(): Promise<boolean> {
        return this.checkSwiftInstalled();
    }

    async fetchZoomMeetings(): Promise<ZoomMeeting[]> {
        // Check if Swift is installed
        const swiftInstalled = await this.checkSwiftInstalled();
        if (!swiftInstalled) {
            // 스크립트 경로 구성
            const basePath = normalizePath((this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath());
            const installerPath = basePath + "/.obsidian/plugins/summar/install_swift.sh";
            
            // 설치 옵션이 있는 알림 표시
            const notice = SummarDebug.Notice(0, `Swift가 설치되어 있지 않습니다.\n\n캘린더 기능을 사용하려면 Swift가 필요합니다.\n\n지금 설치하시겠습니까?\n\n설치 방법을 선택하세요:`, 0);
            
            // 설치 버튼 추가
            if (notice && notice.noticeEl) notice.noticeEl.createEl("button", { text: "Swift 자동 설치" }, (button) => {
                button.style.marginRight = "10px";
                button.onclick = async () => {
                    if (notice) notice.hide();
                    
                    // 새로운 알림 표시 (진행 중)
                    const installNotice = SummarDebug.Notice(0, "Swift 설치 준비 중...\n\n터미널이 열리고 설치가 진행됩니다.\n\n관리자 권한이 필요할 수 있으며, 설치 파일 다운로드로 인해 몇 분 정도 소요될 수 있습니다.", 0);
                    
                    try {
                        // 설치 스크립트 실행
                        const { exec } = require("child_process");
                        const execAsync = promisify(exec);
                        await execAsync(`open -a Terminal.app ${installerPath}`);
                        
                        // 알림 업데이트
                        if (installNotice) installNotice.setMessage("Swift 설치가 터미널에서 진행 중입니다.\n\n설치가 완료되면 Obsidian을 재시작해주세요.\n\n설치 중에는 터미널 창을 닫지 마세요.");
                        
                        // 30초 후에 알림 내용 업데이트
                        setTimeout(() => {
                            if (installNotice) installNotice.setMessage("Swift 설치가 계속 진행 중입니다...\n\n설치가 완료되면 터미널에서 성공 메시지가 표시됩니다.\n\n설치 완료 후 Obsidian을 재시작해주세요.");
                            
                            // 1분 후에도 알림 유지
                            setTimeout(() => {
                                if (installNotice) installNotice.hide();
                            }, 60000);
                        }, 30000);
                        
                    } catch (error) {
                        // 설치 스크립트 실행 실패
                        if (installNotice) installNotice.hide();
                        SummarDebug.Notice(0, `Swift 설치 스크립트 실행에 실패했습니다: ${error.message}\n\n수동으로 설치해주세요.`);
                    }
                };
            });
            
            // 수동 설치 안내 링크 추가
            if (notice && notice.noticeEl) notice.noticeEl.createEl("button", { text: "수동 설치 안내" }, (button) => {
                button.onclick = () => {
                    if (notice) notice.hide();
                    SummarDebug.Notice(0, `Swift 수동 설치 방법:\n\n1. Swift 툴체인 설치 (권장, 용량이 작음):\n   - https://www.swift.org/download/ 에서 macOS용 Swift 다운로드\n   - 설치 안내에 따라 설치\n\n2. 또는 Xcode Command Line Tools 설치:\n   - 터미널에서 실행: xcode-select --install\n\n설치 과정이 완료되면 터미널에서 'swift --version' 명령어로 설치를 확인하세요.\n설치 후 Obsidian을 재시작하면 캘린더 기능을 사용할 수 있습니다.`);
                };
            });
            
            throw new Error("Swift is not installed or not configured.");
        }
        
        // Swift 모듈 관련 오류 확인 및 해결 안내
        try {
            const { exec } = require("child_process");
            const execAsync = promisify(exec);
            await execAsync("swift --version");
        } catch (error) {
            SummarDebug.Notice(0, `Swift 모듈 충돌 오류가 발생할 수 있습니다.\n\n해결 방법:\n터미널에서 다음 명령어를 실행하세요.\n\n  sudo xcode-select --reset\n  sudo xcodebuild -runFirstLaunch\n\n실행 후 Obsidian을 재시작하세요.`);
            throw new Error("Swift module configuration issue detected.");
        }

        return new Promise((resolve, reject) => {
            // calendar_count가 없거나 0이면 실행하지 않음
            if (!this.plugin.settingsv2.schedule.calendarName.length || this.plugin.settingsv2.schedule.calendarName.length === 0) {
                SummarDebug.log(1, "캘린더가 설정되지 않아 fetchZoomMeetings를 실행하지 않습니다.");
                resolve([]);
                return;
            }

            // Build argument list for Swift
            const args: string[] = [];
            if (this.plugin.settingsv2.schedule.calendar_fetchdays && Number.isInteger(this.plugin.settingsv2.schedule.calendar_fetchdays)) {
                args.push(`--fetch-days=${this.plugin.settingsv2.schedule.calendar_fetchdays}`);
            }
            // 캘린더가 하나도 없으면 실행하지 않음
            let calendarList: string[] = [];
            for (const calendarName of this.plugin.settingsv2.schedule.calendarName) {
                if (calendarName && calendarName.trim().length > 0) {
                    calendarList.push(calendarName.trim());
                }
            }
            if (calendarList.length === 0) {
                SummarDebug.log(1, "캘린더 목록이 비어 있어 fetchZoomMeetings를 실행하지 않습니다.");
                resolve([]);
                return;
            }

            args.push(`--fetch-calendars=${calendarList.join(",")}`);
            const basePath = normalizePath((this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath());
            const wrapperPath = basePath + "/.obsidian/plugins/summar/fetch_calendar_wrapper.sh";
            const process = spawn("/bin/bash", [wrapperPath, ...args]);
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
                        SummarDebug.Notice(1, "Successfully fetched calendar information.");
                        resolve(meetings);
                    } catch (error) {
                        SummarDebug.error(1, "JSON Parsing Error:", error);
                        SummarDebug.Notice(0, "Failed to parse calendar information: " + (error?.message || error));
                        reject(new Error("Failed to parse Swift output as JSON"));
                    }
                } else {
                    SummarDebug.error(1, "Swift Execution Error:", errorOutput);
                    SummarDebug.Notice(0, "Swift script execution failed: " + errorOutput);
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
        SummarDebug.log(1, "🔄 Updating scheduled Zoom meetings...");
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
                attendees: meeting.attendees || [],
                participant_status: meeting.participant_status || "unknown",
            })));

            // this.timers.forEach(({ timeoutId, title }) => {
            //     clearTimeout(timeoutId);
            //     SummarDebug.log(1, `🗑️ "${title}" 타이머 제거됨`);
            // });
            // this.timers = [];
            this.timers.forEach((timeoutId, start) => {
                clearTimeout(timeoutId);
                SummarDebug.log(1, `🗑️ Timer for "${new Date(start)}" removed`);
            });
            this.timers.clear();


            const MAX_DELAY = this.plugin.settingsv2.schedule.calendar_polling_interval * 3;

            // Loop를 돌면서 콘솔 출력
            // events.forEach((event, index) => {
            this.events.forEach((event, index) => {
                SummarDebug.log(1, `📅 Event ${index + 1}: ${event.title}`);
                SummarDebug.log(1, `   ⏳ Start: ${event.start}`);
                SummarDebug.log(1, `   ⏳ End: ${event.end}`);
                SummarDebug.log(1, `   👤 Participant Status: ${event.participant_status || "unknown"}`);
                // SummarDebug.log(1, `   📍 Location: ${event.location}`);
                // SummarDebug.log(1, `   📝 Description: ${event.description || "No description"}`);
                SummarDebug.log(1, `   🔗 Zoom Link: ${event.zoom_link || "No Zoom link"}`);
                SummarDebug.log(1, "------------------------------------------------");

                const now = new Date();
                const delayMs = event.start.getTime() - now.getTime();

                // 자동 줌 미팅 참석 조건 확인
                const shouldAutoLaunch = this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule &&
                    delayMs > 0 && delayMs < MAX_DELAY &&
                    !this.timers.has(event.start.getTime()) &&
                    event.zoom_link && event.zoom_link.length > 0 &&
                    (!this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnlyAccepted || 
                     event.participant_status === "accepted" || 
                     event.participant_status === "organizer" ||
                     event.participant_status === "unknown"); // tentative 제거

                if (shouldAutoLaunch) {
                    const timer = setTimeout(async () => {
                        // if (this.plugin.recordingManager.getRecorderState() !== "recording") {
                        //     await this.plugin.recordingManager.startRecording(this.plugin.settingsv2.recording.recordingUnit);
                        // }
                        this.launchZoomMeeting(event.zoom_link as string);
                        clearTimeout(timer);
                    }, delayMs);
                    SummarDebug.log(1, `   🚀 Zoom meeting reserved: ${event.start} (Status: ${event.participant_status || "unknown"})`);
                    // this.timers.push({ title: event.title, start: event.start, timeoutId: timer });
                    this.timers.set(event.start.getTime(), timer);
                } else if (this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule && 
                          this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnlyAccepted &&
                          event.zoom_link && event.zoom_link.length > 0 &&
                          event.participant_status === "declined") {
                    SummarDebug.log(1, `   ❌ Zoom meeting skipped (declined): ${event.start}`);
                } else if (this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule && 
                          this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnlyAccepted &&
                          event.zoom_link && event.zoom_link.length > 0 &&
                          event.participant_status === "pending") {
                    SummarDebug.log(1, `   ⏸️ Zoom meeting skipped (pending response): ${event.start}`);
                } else if (this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule && 
                          this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnlyAccepted &&
                          event.zoom_link && event.zoom_link.length > 0 &&
                          event.participant_status === "tentative") {
                    SummarDebug.log(1, `   ❓ Zoom meeting skipped (tentative): ${event.start}`);
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
            this.eventContainer = containerEl;
        }

        if (display !== undefined) {
            this.autoRecord = display;
        }

        // 스피너와 메시지 표시
        this.eventContainer.innerHTML = '<div class="event-loading"><div class="event-spinner"></div>Loading events...</div>';

        // 이벤트 렌더링(비동기)
        setTimeout(() => {
            this.eventContainer.innerHTML = "";
            this.eventContainer.replaceChildren();
            this.events.forEach((event, index) => {
                const eventEl = this.createEventElement(event, index);
                // autoRecord가 true이고, 해당 이벤트에 zoom_link가 있을 때만 선택 효과
                // 그리고 새로운 설정에 따라 참석 상태도 확인
                const shouldAutoLaunch = this.autoRecord && 
                    event.zoom_link && event.zoom_link.length > 0 &&
                    (!this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnlyAccepted || 
                     event.participant_status === "accepted" || 
                     event.participant_status === "organizer" ||
                     event.participant_status === "unknown");
                     
                if (shouldAutoLaunch) {
                    eventEl.classList.add("event-selected");
                } else {
                    eventEl.classList.remove("event-selected");
                }
                this.eventContainer.appendChild(eventEl);
            });
        }, 200); // 0.2초 후 실제 렌더링(실제 fetch라면 fetch 후에 호출)
    }

    createEventElement(event: CalendarEvent, index: number): HTMLElement {
        const eventEl = document.createElement("div");

        // Zoom only 옵션 관련 코드 전체 제거, 모든 이벤트를 그대로 표시
        const formattedDate = event.start.getFullYear().toString().slice(2) +
            String(event.start.getMonth() + 1).padStart(2, "0") +
            event.start.getDate().toString().padStart(2, "0") + "-" +
            event.start.getHours().toString().padStart(2, "0") +
            event.start.getMinutes().toString().padStart(2, "0");

        eventEl.classList.add("event");
        
        // 참석 상태에 따른 이모지와 스타일 결정
        let statusEmoji = "";
        let statusText = "";
        let statusClass = "";
        
        switch (event.participant_status) {
            case "accepted":
                statusEmoji = "✅";
                statusText = "Accepted";
                statusClass = "status-accepted";
                break;
            case "declined":
                statusEmoji = "❌";
                statusText = "Declined";
                statusClass = "status-declined";
                break;
            case "tentative":
                statusEmoji = "❓";
                statusText = "Maybe";
                statusClass = "status-tentative";
                break;
            case "pending":
                statusEmoji = "⏸️";
                statusText = "Pending";
                statusClass = "status-pending";
                break;
            case "organizer":
                statusEmoji = "�";
                statusText = "Organizer";
                statusClass = "status-organizer";
                break;
            default:
                statusEmoji = "👤";
                statusText = "My Event";
                statusClass = "status-organizer";
        }
        
        eventEl.classList.add(statusClass);
        
        // 강제 색상 지정 제거, 의미별 클래스만 부여
        let strInnerHTML = `
        <div class="event-title">📅 ${event.title}</div>
        <div class="event-time">⏳${event.start.toLocaleString()} - ⏳${event.end.toLocaleString()}</div>
        <div class="event-status">${statusEmoji} ${statusText}</div>`;
        if (event.zoom_link && event.zoom_link.length > 0) {
            strInnerHTML += `<a href="${event.zoom_link}" class="event-zoom-link" target="_blank">🔗Join Zoom Meeting</a>`;
        }
        strInnerHTML += `<a href="#" class="event-obsidian-link">📝 Create Note in Obsidian</a>
    `;
        eventEl.innerHTML = strInnerHTML;

        // const zoomLinkEl = eventEl.querySelector(".event-zoom-link");
        // zoomLinkEl?.addEventListener("click", async (e) => {

        //     if (this.plugin.recordingManager.getRecorderState() !== "recording") {
        //         new ConfirmModal(this.plugin.app, async (shouldRecord: boolean) => {
        //             if (shouldRecord) {
        //                 await this.plugin.recordingManager.startRecording(this.plugin.settings.recordingUnit);
        //             }
        //             }).open();
        //     }
        // });


        // ✅ Open note in new tab in Obsidian
        const obsidianLinkEl = eventEl.querySelector(".event-obsidian-link");
        obsidianLinkEl?.addEventListener("click", (e) => {
            e.preventDefault();
            this.plugin.app.workspace.openLinkText(formattedDate, "", true); // Open in new tab
        });

        return eventEl;
    }

    /**
     * Launches the given Zoom URL. On macOS, uses the 'open' command.
     */
    async launchZoomMeeting(url: string): Promise<void> {
        const execAsync = promisify(exec);
        try {
            SummarDebug.log(1, `Launching Zoom meeting: ${url}`);
            const { stdout, stderr } = await execAsync(`open "${url}"`);
            if (stderr && stderr.trim()) {
                SummarDebug.error(1, "Error occurred while launching Zoom meeting:", stderr);
            }
        } catch (error) {
            SummarDebug.error(1, "Failed to launch Zoom meeting:", error);
        }
    }

    /**
     * Fetches available macOS calendar names using the Swift script.
     * Returns an array of calendar names, null if permission denied, or [] on error.
     */
    async getAvailableCalendars(): Promise<string[] | null> {
        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const { normalizePath } = require('obsidian');
            const { FileSystemAdapter } = require('obsidian');
            const basePath = (this.plugin.app.vault.adapter as typeof FileSystemAdapter).getBasePath();
            const wrapperPath = normalizePath(basePath + "/.obsidian/plugins/summar/fetch_calendar_wrapper.sh");
            const process = spawn('/bin/bash', [wrapperPath, '--list-calendars']);
            let output = '';
            let errorOutput = '';
            process.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });
            process.stderr.on('data', (data: Buffer) => {
                errorOutput += data.toString();
            });
            process.on('close', (code: number) => {
                const trimmed = output.trim();
                if (trimmed === '-1') {
                    SummarDebug.error(1, '[Calendar] Permission denied.');
                    if (errorOutput) SummarDebug.error(1, '[Calendar][stderr]', errorOutput);
                    
                    // 권한 거부 안내 메시지 추가
                    SummarDebug.Notice(0, "캘린더 접근 권한이 거부되었습니다.\n\n캘린더 기능을 사용하려면 시스템 환경설정 > 개인 정보 보호 및 보안 > 개인 정보 보호 > 캘린더에서 Obsidian 앱에 대한 권한을 허용해주세요.\n\n권한을 설정한 후 Obsidian을 재시작해주세요.", 0);
                    
                    resolve(null); // Permission error
                    return;
                }
                try {
                    const result = JSON.parse(trimmed);
                    if (Array.isArray(result)) {
                        if (result.length === 0) {
                            SummarDebug.log(1, '[Calendar] Calendar list is empty.');
                            if (errorOutput) SummarDebug.log(1, '[Calendar][stderr]', errorOutput);
                        }
                        resolve(result);
                    } else {
                        SummarDebug.log(1, '[Calendar] Unexpected result:', result);
                        if (errorOutput) SummarDebug.log(1, '[Calendar][stderr]', errorOutput);
                        resolve([]);
                    }
                } catch (e) {
                    SummarDebug.error(1, '[Calendar] Failed to parse calendar list:', trimmed, e);
                    if (errorOutput) SummarDebug.error(1, '[Calendar][stderr]', errorOutput);
                    resolve([]);
                }
            });
            process.on('error', (err: Error) => {
                SummarDebug.error(1, '[Calendar] Failed to spawn Swift process:', err);
                resolve([]);
            });
        });
    }

    /**
     * 참여 상태별 우선순위 점수를 계산합니다 (누적 점수 방식)
     * @param event 캘린더 이벤트
     * @returns 우선순위 점수 (높을수록 우선순위가 높음)
     */
    private getEventPriority(event: CalendarEvent): number {
        let score = 0;
        
        // 기본 참여 상태별 점수 (누적)
        if (event.participant_status === "organizer") score += 100;
        if (event.participant_status === "accepted") score += 100;
        if (event.participant_status === "tentative") score += 50;
        if (event.participant_status === "pending") score += 25;
        if (event.participant_status === "unknown") score += 10;
        if (event.participant_status === "declined") score -= 100; // 명시적 거절에 강력한 패널티
        
        // 보너스 점수
        
        // 1. 주최자인 경우 추가 보너스 +20
        if (event.participant_status === "organizer") {
            score += 20;
        }
        
        // 패널티 점수
        
        // 1. 내가 주최자이지만 참석자가 나 혼자일 경우 -50
        if (event.participant_status === "organizer" && 
            (!event.attendees || event.attendees.length <= 1)) {
            score -= 50;
        }
        
        // 2. 시간이 4시간 이상인 경우 -50
        if (event.start && event.end) {
            const durationMs = event.end.getTime() - event.start.getTime();
            const durationHours = durationMs / (1000 * 60 * 60);
            if (durationHours >= 4) {
                score -= 50;
            }
        }
        
        // 3. 미팅 시간이 너무 짧은 경우 (15분 이하) -10
        if (event.start && event.end) {
            const durationMs = event.end.getTime() - event.start.getTime();
            const durationMinutes = durationMs / (1000 * 60);
            if (durationMinutes <= 15) {
                score -= 10;
            }
        }
        
        return score;
    }

    /**
     * 우선순위에 따라 이벤트 배열을 정렬합니다
     * @param events 정렬할 이벤트 배열
     * @returns 우선순위 순으로 정렬된 이벤트 배열
     */
    private sortEventsByPriority(events: CalendarEvent[]): CalendarEvent[] {
        return events.sort((a, b) => {
            const priorityDiff = this.getEventPriority(b) - this.getEventPriority(a);
            if (priorityDiff !== 0) return priorityDiff;
            return a.start.getTime() - b.start.getTime();
        });
    }

    /**
     * 지정된 시간에 진행 중인 캘린더 이벤트를 찾습니다
     * 현재 진행 중인 이벤트와 곧 시작할 이벤트(5분 이내)를 모두 고려합니다
     * @param timestamp 찾을 시간 (Date 객체)
     * @returns 해당 시간에 진행 중인 CalendarEvent 또는 null
     */
    findEventAtTime(timestamp: Date): CalendarEvent | null {
        const UPCOMING_THRESHOLD_MINUTES = 10; // 10분 이내 시작하는 이벤트도 고려
        const upcomingThreshold = new Date(timestamp.getTime() + UPCOMING_THRESHOLD_MINUTES * 60 * 1000);

        const events = this.events.filter(event => {
            // 현재 진행 중인 이벤트
            const isOngoing = timestamp >= event.start && timestamp <= event.end;
            
            // 곧 시작할 이벤트 (5분 이내)
            const isUpcoming = event.start > timestamp && event.start <= upcomingThreshold;
            
            return isOngoing || isUpcoming;
        });

        if (events.length === 0) return null;
        if (events.length === 1) return events[0];

        // 중복 이벤트가 있을 경우 스마트 선택
        return this.selectBestEventWithTiming(events, timestamp);
    }

    /**
     * 시간 정보를 고려하여 가장 적합한 이벤트를 선택합니다
     * @param events 후보 이벤트 배열
     * @param timestamp 기준 시간
     * @returns 가장 적합한 CalendarEvent
     */
    private selectBestEventWithTiming(events: CalendarEvent[], timestamp: Date): CalendarEvent {
        // 진행 중인 이벤트와 곧 시작할 이벤트 분리
        const ongoingEvents = events.filter(event => 
            timestamp >= event.start && timestamp <= event.end
        );
        const upcomingEvents = events.filter(event => 
            event.start > timestamp
        );

        // 우선순위 계산 함수
        const getEventPriority = this.getEventPriority.bind(this);

        // 로직 1: 진행 중인 이벤트가 거의 끝나가고 곧 시작할 이벤트가 있으면 곧 시작할 이벤트 우선
        if (ongoingEvents.length > 0 && upcomingEvents.length > 0) {
            const ongoingEvent = ongoingEvents[0];
            const timeToEnd = ongoingEvent.end.getTime() - timestamp.getTime();
            const minutesToEnd = timeToEnd / (60 * 1000);

            // 현재 이벤트가 5분 이내에 끝나면 다음 이벤트 우선 고려
            if (minutesToEnd <= 5) {
                const bestUpcoming = this.sortEventsByPriority(upcomingEvents)[0];

                SummarDebug.log(1, `Current event "${ongoingEvent.title}" ends in ${minutesToEnd.toFixed(1)} minutes, selecting upcoming event "${bestUpcoming.title}"`);
                return bestUpcoming;
            }
        }

        // 로직 2: 일반적인 우선순위 적용
        const selectedEvent = this.sortEventsByPriority(events)[0];
        
        if (events.length > 1) {
            const eventTypes = events.map(e => {
                const isOngoing = timestamp >= e.start && timestamp <= e.end;
                return `"${e.title}" (${e.participant_status}, ${isOngoing ? 'ongoing' : 'upcoming'})`;
            });
            SummarDebug.log(1, `Multiple events found at timestamp, selected: "${selectedEvent.title}" (status: ${selectedEvent.participant_status})`);
            SummarDebug.log(1, `All candidates: ${eventTypes.join(', ')}`);
        }
        
        return selectedEvent;
    }

    /**
     * 중복된 이벤트들 중에서 가장 적합한 이벤트를 선택합니다
     * 우선순위: 1) 개최자(organizer) 2) 수락(accepted) 3) 가장 먼저 시작한 이벤트
     * @param events 중복된 이벤트 배열
     * @returns 가장 적합한 CalendarEvent
     */
    private selectBestEvent(events: CalendarEvent[]): CalendarEvent {
        const selectedEvent = this.sortEventsByPriority(events)[0];
        
        if (events.length > 1) {
            SummarDebug.log(1, `Multiple events found at timestamp, selected: "${selectedEvent.title}" (status: ${selectedEvent.participant_status})`);
            SummarDebug.log(1, `Other events: ${events.slice(1).map(e => `"${e.title}" (${e.participant_status})`).join(', ')}`);
        }
        
        return selectedEvent;
    }

    /**
     * 지정된 시간 범위와 겹치는 캘린더 이벤트들을 찾습니다
     * @param startTime 시작 시간
     * @param endTime 종료 시간
     * @returns 해당 시간 범위와 겹치는 CalendarEvent 배열 (우선순위 정렬됨)
     */
    findEventsInTimeRange(startTime: Date, endTime: Date): CalendarEvent[] {
        const events = this.events.filter(event => {
            // 이벤트가 시간 범위와 겹치는지 확인
            return (event.start < endTime && event.end > startTime);
        });

        // 우선순위로 정렬
        return this.sortEventsByPriority(events);
    }

    /**
     * 현재 진행 중인 캘린더 이벤트를 가져옵니다
     * @returns 현재 진행 중인 CalendarEvent 또는 null
     */
    getCurrentEvent(): CalendarEvent | null {
        return this.findEventAtTime(new Date());
    }

    /**
     * 캘린더 이벤트 정보를 문자열로 포맷합니다
     * @param event 포맷할 CalendarEvent
     * @returns 포맷된 문자열
     */
    formatEventInfo(event: CalendarEvent): string {
        const startTime = event.start.toLocaleString();
        const endTime = event.end.toLocaleString();
        
        let info = `## 📋 Meeting Information\n`;
        info += `- **Title**: ${event.title}\n`;
        info += `- **Time**: ${startTime} - ${endTime}\n`;
        
        if (event.location) {
            info += `- **Location**: ${event.location}\n`;
        }
        
        if (event.zoom_link) {
            info += `- **Zoom Link**: ${event.zoom_link}\n`;
        }
        
        if (event.attendees && event.attendees.length > 0) {
            info += `\n### 👥 Attendees\n`;
            event.attendees.forEach(attendee => {
                info += `- ${attendee}\n`;
            });
        }
        
        if (event.description) {
            info += `\n### 📝 Description\n> ${event.description.replace(/\n/g, '\n> ')}\n`;
        }
        
        return info;
    }

    /**
     * 파일명에서 타임스탬프를 추출합니다
     * @param fileName 파일명 (예: summar_audio_241226-143052_1000ms.webm)
     * @returns Date 객체 또는 null
     */
    parseTimestampFromFileName(fileName: string): Date | null {
        // Pattern: summar_audio_YYMMDD-HHMMSS_*.webm
        const match = fileName.match(/summar_audio_(\d{6})-(\d{6})/);
        if (!match) return null;

        const dateStr = match[1]; // YYMMDD
        const timeStr = match[2]; // HHMMSS

        const year = parseInt("20" + dateStr.substring(0, 2));
        const month = parseInt(dateStr.substring(2, 4)) - 1; // 0-based month
        const day = parseInt(dateStr.substring(4, 6));
        const hour = parseInt(timeStr.substring(0, 2));
        const minute = parseInt(timeStr.substring(2, 4));
        const second = parseInt(timeStr.substring(4, 6));

        // 로컬 시간(KST)으로 Date 객체 생성
        const timestamp = new Date(year, month, day, hour, minute, second);
        SummarDebug.log(1, `📅 Parsed timestamp from '${fileName}': ${timestamp.toString()}`);
        return timestamp;
    }

    /**
     * 오디오 파일들의 타임스탬프를 기반으로 캘린더 이벤트를 찾습니다
     * @param audioFiles 오디오 파일 배열
     * @returns 가장 적합한 CalendarEvent 또는 null
     */
    async findEventFromAudioFiles(audioFiles: File[]): Promise<CalendarEvent | null> {
        SummarDebug.log(1, `findEventFromAudioFiles called with ${audioFiles.length} files`);
        SummarDebug.log(1, `Current calendar events count: ${this.events.length}`);
        
        let earliestTimestamp: Date | null = null;
        let latestTimestamp: Date | null = null;

        // 모든 오디오 파일의 타임스탬프 추출
        for (const file of audioFiles) {
            SummarDebug.log(1, `Processing file: ${file.name}`);
            const timestamp = this.parseTimestampFromFileName(file.name);
            if (timestamp) {
                SummarDebug.log(1, `Extracted timestamp from ${file.name}: ${timestamp.toISOString()}`);
                if (!earliestTimestamp || timestamp < earliestTimestamp) {
                    earliestTimestamp = timestamp;
                }
                if (!latestTimestamp || timestamp > latestTimestamp) {
                    latestTimestamp = timestamp;
                }
            } else {
                SummarDebug.log(1, `No timestamp found in filename: ${file.name}, lastModified: ${new Date(file.lastModified).toISOString()}`);
            }
        }

        // 타임스탬프를 찾을 수 없으면 파일 생성 시간 사용
        if (!earliestTimestamp && audioFiles.length > 0) {
            SummarDebug.log(1, `No timestamp from filenames, using file lastModified times`);
            // File 객체의 lastModified 사용 (밀리초)
            const timestamps = audioFiles
                .map(file => new Date(file.lastModified))
                .filter(date => !isNaN(date.getTime()));
            
            if (timestamps.length > 0) {
                earliestTimestamp = new Date(Math.min(...timestamps.map(d => d.getTime())));
                latestTimestamp = new Date(Math.max(...timestamps.map(d => d.getTime())));
                SummarDebug.log(1, `Using file modification times - earliest: ${earliestTimestamp.toISOString()}, latest: ${latestTimestamp.toISOString()}`);
            }
        }

        if (!earliestTimestamp) {
            SummarDebug.log(1, `❌ No timestamp could be determined from audio files`);
            return null;
        }

        // 해당 날짜의 이벤트를 새로 가져오기
        try {
            SummarDebug.log(1, `🔍 Fetching events for specific date: ${earliestTimestamp.toISOString()}`);
            const meetings = await this.fetchEventsForDate(earliestTimestamp);
            
            if (meetings.length === 0) {
                SummarDebug.log(1, `❌ No calendar events found for date: ${earliestTimestamp.toDateString()}`);
                return null;
            }

            // 가져온 이벤트들을 CalendarEvent로 변환
            const events: CalendarEvent[] = meetings.map(meeting => ({
                title: meeting.title,
                start: new Date(meeting.start),
                end: new Date(meeting.end),
                description: meeting.description,
                location: meeting.location,
                zoom_link: meeting.zoom_link,
                attendees: meeting.attendees || [],
                participant_status: meeting.participant_status || "unknown",
            }));

            SummarDebug.log(1, `Found ${events.length} events for date:`);
            events.forEach((event, index) => {
                SummarDebug.log(1, `  ${index + 1}. "${event.title}" (${event.start.toLocaleString()} - ${event.end.toLocaleString()})`);
            });

            // 정확한 시간에 진행 중인 이벤트 찾기
            const exactEvents = events.filter(event => 
                earliestTimestamp! >= event.start && earliestTimestamp! <= event.end
            );

            if (exactEvents.length > 0) {
                // 여러 이벤트가 있으면 우선순위로 정렬
                if (exactEvents.length > 1) {
                    this.sortEventsByPriority(exactEvents);
                }

                const selectedEvent = exactEvents[0];
                SummarDebug.log(1, `✅ Found exact calendar event: ${selectedEvent.title} (${selectedEvent.participant_status})`);
                return selectedEvent;
            }

            // 시간 범위와 겹치는 이벤트 찾기
            if (latestTimestamp) {
                const overlappingEvents = events.filter(event => 
                    event.start < latestTimestamp! && event.end > earliestTimestamp!
                );

                if (overlappingEvents.length > 0) {
                    // 우선순위로 정렬
                    const sortedEvents = this.sortEventsByPriority(overlappingEvents);

                    const selectedEvent = sortedEvents[0];
                    SummarDebug.log(1, `✅ Found overlapping calendar event: ${selectedEvent.title} (status: ${selectedEvent.participant_status})`);
                    return selectedEvent;
                }
            }

            SummarDebug.log(1, `❌ No matching calendar event found for timestamp: ${earliestTimestamp.toISOString()}`);
            return null;

        } catch (error) {
            SummarDebug.error(1, `Error fetching events for date:`, error);
            return null;
        }
    }

    /**
     * 특정 날짜의 캘린더 이벤트를 가져옵니다
     * @param targetDate 검색할 날짜
     * @returns ZoomMeeting 배열
     */
    async fetchEventsForDate(targetDate: Date): Promise<ZoomMeeting[]> {
        if (!(Platform.isMacOS && Platform.isDesktopApp)) {
            SummarDebug.log(1, "캘린더 기능은 macOS에서만 지원됩니다.");
            return [];
        }

        // Check if Swift is installed
        const swiftInstalled = await this.checkSwiftInstalled();
        if (!swiftInstalled) {
            // 스크립트 경로 구성
            const basePath = normalizePath((this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath());
            const installerPath = basePath + "/.obsidian/plugins/summar/install_swift.sh";
            
            // 설치 옵션이 있는 알림 표시
            const notice = SummarDebug.Notice(0, `Swift가 설치되어 있지 않습니다.\n\n캘린더 기능을 사용하려면 Swift가 필요합니다.\n\n지금 설치하시겠습니까?\n\n설치 방법을 선택하세요:`, 0);
            
            // 설치 버튼 추가
            if (notice && notice.noticeEl) notice.noticeEl.createEl("button", { text: "Swift 자동 설치" }, (button) => {
                button.style.marginRight = "10px";
                button.onclick = async () => {
                    if (notice) notice.hide();
                    
                    // 새로운 알림 표시 (진행 중)
                    const installNotice = SummarDebug.Notice(0, "Swift 설치 준비 중...\n\n터미널이 열리고 설치가 진행됩니다.\n\n관리자 권한이 필요할 수 있으며, 설치 파일 다운로드로 인해 몇 분 정도 소요될 수 있습니다.", 0);
                    
                    try {
                        // 설치 스크립트 실행
                        const { exec } = require("child_process");
                        const execAsync = promisify(exec);
                        await execAsync(`open -a Terminal.app ${installerPath}`);
                        
                        // 알림 업데이트
                        if (installNotice) installNotice.setMessage("Swift 설치가 터미널에서 진행 중입니다.\n\n설치가 완료되면 Obsidian을 재시작해주세요.\n\n설치 중에는 터미널 창을 닫지 마세요.");
                        
                        // 30초 후에 알림 내용 업데이트
                        setTimeout(() => {
                            if (installNotice) installNotice.setMessage("Swift 설치가 계속 진행 중입니다...\n\n설치가 완료되면 터미널에서 성공 메시지가 표시됩니다.\n\n설치 완료 후 Obsidian을 재시작해주세요.");
                            
                            // 1분 후에도 알림 유지
                            setTimeout(() => {
                                if (installNotice) installNotice.hide();
                            }, 60000);
                        }, 30000);
                        
                    } catch (error) {
                        // 설치 스크립트 실행 실패
                        if (installNotice) installNotice.hide();
                        SummarDebug.Notice(0, `Swift 설치 스크립트 실행에 실패했습니다: ${error.message}\n\n수동으로 설치해주세요.`);
                    }
                };
            });
            
            // 수동 설치 안내 링크 추가
            if (notice && notice.noticeEl) notice.noticeEl.createEl("button", { text: "수동 설치 안내" }, (button) => {
                button.onclick = () => {
                    if (notice) notice.hide();
                    SummarDebug.Notice(0, `Swift 수동 설치 방법:\n\n1. Swift 툴체인 설치 (권장, 용량이 작음):\n   - https://www.swift.org/download/ 에서 macOS용 Swift 다운로드\n   - 설치 안내에 따라 설치\n\n2. 또는 Xcode Command Line Tools 설치:\n   - 터미널에서 실행: xcode-select --install\n\n설치 과정이 완료되면 터미널에서 'swift --version' 명령어로 설치를 확인하세요.\n설치 후 Obsidian을 재시작하면 캘린더 기능을 사용할 수 있습니다.`);
                };
            });
            
            SummarDebug.log(1, "Swift가 설치되지 않아 캘린더 기능을 사용할 수 없습니다.");
            return [];
        }
        
        // Swift 모듈 관련 오류 확인
        try {
            const { exec } = require("child_process");
            const execAsync = promisify(exec);
            await execAsync("swift --version");
        } catch (error) {
            SummarDebug.log(1, "Swift 모듈 오류가 발생했습니다. 래퍼 스크립트에서 처리할 예정입니다.");
            // 오류는 래퍼 스크립트에서 자세히 처리하므로 여기서는 계속 진행합니다.
        }

        return new Promise((resolve, reject) => {
            // calendar_count가 없거나 0이면 실행하지 않음
            if (!this.plugin.settingsv2.schedule.calendarName.length || this.plugin.settingsv2.schedule.calendarName.length === 0) {
                SummarDebug.log(1, "캘린더가 설정되지 않아 fetchEventsForDate를 실행하지 않습니다.");
                resolve([]);
                return;
            }

            // Build argument list for Swift
            const args: string[] = [];
            
            // 날짜를 0시 기준으로 정규화 후 YYYY-MM-DD 형식으로 변환
            const normalizedDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
            const dateString = normalizedDate.getFullYear() + '-' + 
                String(normalizedDate.getMonth() + 1).padStart(2, '0') + '-' + 
                String(normalizedDate.getDate()).padStart(2, '0');
            args.push(`--search-date=${dateString}`);
            
            SummarDebug.log(1, `Fetching events for normalized date: ${dateString} (original: ${targetDate.toISOString()})`);
            
            // 캘린더가 하나도 없으면 실행하지 않음
            let calendarList: string[] = [];
            for (const calendarName of this.plugin.settingsv2.schedule.calendarName) {
                if (calendarName && calendarName.trim().length > 0) {
                    calendarList.push(calendarName.trim());
                }
            }
            if (calendarList.length === 0) {
                SummarDebug.log(1, "캘린더 목록이 비어 있어 fetchEventsForDate를 실행하지 않습니다.");
                resolve([]);
                return;
            }

            args.push(`--fetch-calendars=${calendarList.join(",")}`);
            const basePath = normalizePath((this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath());
            const wrapperPath = basePath + "/.obsidian/plugins/summar/fetch_calendar_wrapper.sh";
            SummarDebug.log(1, `Executing calendar wrapper with args: ${args.join(" ")}`);
            const process = spawn("/bin/bash", [wrapperPath, ...args]);
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
                        SummarDebug.log(1, `Successfully fetched ${meetings.length} events for date ${dateString}.`);
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
}

// class ConfirmModal extends Modal {
//     onSubmit: (result: boolean) => void;

//     constructor(app: App, onSubmit: (result: boolean) => void) {
//         super(app);
//         this.onSubmit = onSubmit;
//     }

//     onOpen() {
//         const { contentEl } = this;
//         contentEl.createEl("h3", { text: "Would you like to start recording?" });

//         const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

//         const yesButton = buttonContainer.createEl("button", { text: "Yes" });
//         yesButton.addEventListener("click", () => {
//             this.close();
//             this.onSubmit(true);
//         });

//         const noButton = buttonContainer.createEl("button", { text: "No" });
//         noButton.addEventListener("click", () => {
//             this.close();
//             this.onSubmit(false);
//         });
//     }

//     onClose() {
//         const { contentEl } = this;
//         contentEl.empty();
//     }
// }