import { readCalendarJson } from "./googledrive-utils";
import { CalendarEvent } from "./calendarhandler";
import { SummarDebug } from "./globals";
import SummarPlugin from "./main";

/**
 * Schedules auto-launch of meetings from Google Calendar (events.json via Google Drive).
 * Runs independently from CalendarHandler (macOS Calendar path).
 */
export class GoogleCalendarScheduler {
    private timers: Map<number, NodeJS.Timeout> = new Map();
    private intervalId: NodeJS.Timeout | null = null;

    constructor(private plugin: SummarPlugin) {}

    start(): void {
        if (this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule) {
            this.plugin.reservedStatus.setStatusbarIcon("calendar-clock", "red");
        } else {
            this.plugin.reservedStatus.setStatusbarIcon("calendar-x", "var(--text-muted)");
        }

        this.updateScheduledMeetings();
        this.intervalId = setInterval(() => {
            this.updateScheduledMeetings();
        }, this.plugin.settingsv2.schedule.calendar_polling_interval);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
    }

    async updateScheduledMeetings(): Promise<void> {
        const jsonData = await readCalendarJson(
            this.plugin.settingsv2.schedule.googleDriveFilePath,
            undefined,
            this.plugin.app.vault.getName()
        );
        const calendarEvents = jsonData
            ? jsonData.events
                .filter((raw: any) => !raw.isAllDay)
                .map((raw: any) => this.convertToCalendarEvent(raw))
            : [];
        this.plugin.calendarHandler.setEvents(calendarEvents);

        if (!jsonData || jsonData.events.length === 0) return;

        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();

        const now = new Date();
        const MAX_DELAY = this.plugin.settingsv2.schedule.calendar_polling_interval * 3;
        const autoLaunch = this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule;
        const onlyAccepted = this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnlyAccepted;

        for (const raw of jsonData.events) {
            const event = this.convertToCalendarEvent(raw);
            const delayMs = event.start.getTime() - now.getTime();

            SummarDebug.log(1, `[GCal] 📅 ${event.title} | delay=${Math.round(delayMs / 1000)}s | status=${event.participant_status}`);

            if (!autoLaunch || delayMs <= 0 || delayMs >= MAX_DELAY) continue;
            if (this.timers.has(event.start.getTime())) continue;
            if (!event.zoom_link && !event.google_meet_link) continue;

            const status = event.participant_status ?? 'unknown';
            const statusAllowed = !onlyAccepted ||
                status === 'accepted' ||
                status === 'organizer' ||
                status === 'unknown';

            if (!statusAllowed) {
                SummarDebug.log(1, `[GCal]    ❌ Skipping (status: ${status}): ${event.title}`);
                continue;
            }

            const isGoogleMeet = !!event.google_meet_link;
            const timer = setTimeout(async () => {
                if (isGoogleMeet) {
                    await this.plugin.calendarHandler.launchGoogleMeetMeeting(event.google_meet_link as string);
                    if (this.plugin.settingsv2.recording.autoRecordOnVideoMeeting) {
                        if (this.plugin.recordingManager.getRecorderState() !== 'recording') {
                            await this.plugin.recordingManager.startRecording(
                                this.plugin.settingsv2.recording.recordingUnit
                            );
                        }
                        this.plugin.calendarHandler.scheduleGoogleMeetRecordingEndPrompt(event);
                        this.plugin.calendarHandler.startGoogleMeetWatcher(event);
                    }
                } else {
                    this.plugin.calendarHandler.launchZoomMeeting(event.zoom_link as string);
                }
                this.timers.delete(event.start.getTime());
            }, delayMs);

            this.timers.set(event.start.getTime(), timer);
            SummarDebug.log(1, `[GCal]    ⏰ Timer set for ${event.title} in ${Math.round(delayMs / 1000)}s`);
        }
    }

    private convertToCalendarEvent(raw: any): CalendarEvent {
        const meetingUrl: string = raw.meeting_url ?? '';
        const isZoom = /zoom\.us/i.test(meetingUrl);
        const isGoogleMeet = /meet\.google\.com/i.test(meetingUrl);

        // Map Google Calendar participant_status to internal format
        // Google: accepted | needsAction | declined | tentative | ''
        // Internal: accepted | organizer | unknown | pending | declined | tentative
        let participantStatus: string = raw.participant_status ?? 'unknown';
        if (participantStatus === 'needsAction') participantStatus = 'pending';
        if (participantStatus === '') participantStatus = 'unknown';

        return {
            title: raw.title ?? '',
            start: new Date(raw.start),
            end: new Date(raw.end),
            description: raw.description ?? '',
            location: raw.location ?? '',
            zoom_link: isZoom ? meetingUrl : '',
            google_meet_link: isGoogleMeet ? meetingUrl : '',
            attendees: raw.attendees ?? [],
            participant_status: participantStatus,
        };
    }
}
