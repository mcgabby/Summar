import { exec } from "child_process";
import { promisify } from "util";
import { SummarDebug } from "./globals";

const execAsync = promisify(exec);
interface CalendarEvent {
    title: string;
    start: Date;
    end: Date;
    description?: string;
    location?: string;
}

/**
 * 예약된 Zoom 미팅 타이머를 관리하기 위한 전역 Map
 * key: "제목-시작시간", value: 예약된 setTimeout의 반환값
 */
const scheduledMeetings = new Map<string, NodeJS.Timeout>();

/**
 * macOS의 Calendar 앱에서 **현재 시각부터 24시간 이내**의 이벤트 중
 * 제목, 설명, 또는 위치에 "zoom"이 포함된 이벤트들을 가져오는 함수.
 */
async function fetchTodaysZoomMeetingsMac(): Promise<CalendarEvent[]> {
    const appleScriptLines = [
        'tell application "Calendar"',
        '    set matchingEvents to {}',
        '    set theStart to current date',
        '    set theEnd to theStart + 7 * 24 * hours',
        '    repeat with aCal in calendars',
        '        set theEvents to (every event of aCal whose start date ≥ theStart and start date ≤ theEnd)',
        '        repeat with e in theEvents',
        '            ignoring case',
        '                if ((summary of e as string) contains "zoom") or ((description of e as string) contains "zoom") or ((location of e as string) contains "zoom") then',
        '                    set eventInfo to (summary of e as string) & "||" & (start date of e as string) & "||" & (end date of e as string) & "||" & (description of e as string) & "||" & (location of e as string)',
        '                    set matchingEvents to matchingEvents & {eventInfo}',
        '                end if',
        '            end ignoring',
        '        end repeat',
        '    end repeat',
        '    return matchingEvents',
        'end tell'
      ];
      
    // 각 줄마다 -e 옵션을 붙여서 실행
    const scriptArgs = appleScriptLines.map(line => `-e ${JSON.stringify(line)}`).join(" ");
    try {
        const { stdout, stderr } = await execAsync(`osascript ${scriptArgs}`);
        if (stderr && stderr.trim()) {
          console.error("AppleScript 에러:", stderr);
        }
        const output = stdout.trim();
        if (!output) return [];
    
        const lines = output.split("\n").map(line => line.trim()).filter(line => line.length > 0);
        const events: CalendarEvent[] = [];
        for (const line of lines) {
          const parts = line.split("||");
          if (parts.length >= 5) {
            const [title, startStr, endStr, description, location] = parts;
            events.push({
              title: title.trim(),
              start: new Date(startStr.trim()),
              end: new Date(endStr.trim()),
              description: description.trim(),
              location: location.trim(),
            });
            SummarDebug.log(1, `이벤트: ${title} (${startStr} ~ ${endStr})`);
          }
        }
        return events;
    } catch (error) {
      SummarDebug.error(1, "macOS에서 이벤트를 가져오는 중 오류 발생:", error);
      return [];
    }
  }
  
  /**
   * 이벤트 내에서 Zoom URL을 추출하는 헬퍼 함수.
   * Zoom URL은 보통 description 또는 location 필드에 포함됩니다.
   */
  function extractZoomUrl(event: CalendarEvent): string | null {
    // Zoom 관련 URL을 찾기 위한 정규표현식 (http/https 혹은 zoommtg 프로토콜)
    const zoomUrlRegex = /(https?:\/\/[^\s"]*(zoom\.us|zoommtg:\/\/)[^\s"]*)/i;
    let match = event.description && event.description.match(zoomUrlRegex);
    if (match && match[0]) {
      return match[0];
    }
    match = event.location && event.location.match(zoomUrlRegex);
    if (match && match[0]) {
      return match[0];
    }
    return null;
  }
  
  /**
   * 전달받은 Zoom URL을 사용하여 Zoom 미팅을 실행하는 함수.
   * macOS에서는 'open' 명령어를 사용합니다.
   */
  async function launchZoomMeeting(url: string): Promise<void> {
    try {
      SummarDebug.log(1, `Zoom 미팅 실행 중: ${url}`);
      const { stderr } = await execAsync(`open "${url}"`);
      if (stderr && stderr.trim()) {
        SummarDebug.error(1, "Zoom 미팅 실행 중 에러 발생:", stderr);
      }
    } catch (error) {
      SummarDebug.error(1,"Zoom 미팅 실행 실패:", error);
    }
  }


/**
 * 10분마다 캘린더의 Zoom 미팅 일정 변경을 체크하여
 * 새 일정은 해당 시작시간에 맞춰 Zoom 미팅을 실행하도록 예약하고,
 * 더 이상 존재하지 않거나 변경된 일정에 대해서는 기존 예약을 취소합니다.
 */
export async function updateScheduledMeetings(): Promise<void> {
  SummarDebug.log(1, "일정 업데이트 중...");
  try {
    const events = await fetchTodaysZoomMeetingsMac();
    const now = new Date();
    const newMeetingKeys = new Set<string>();

    let count = 0;
    for (const event of events) {
      // 고유 키: 이벤트 제목과 시작시간을 조합
      SummarDebug.log(1, `schedule count: ${++count}`);
      const meetingKey = `${event.title}-${event.start.toISOString()}`;
      newMeetingKeys.add(meetingKey);

      // 아직 시작되지 않은 미래의 이벤트에 대해 예약 (이미 예약되어 있으면 건너뜁니다)
      if (event.start.getTime() > now.getTime() && !scheduledMeetings.has(meetingKey)) {
        const zoomUrl = extractZoomUrl(event);
        if (zoomUrl) {
          const delay = event.start.getTime() - now.getTime();
          SummarDebug.log(1, `새로운 Zoom 미팅 예약: ${event.title} (시작: ${event.start.toLocaleString()}, 예약까지 ${Math.round(delay / 1000)}초)`);
          const timer = setTimeout(async () => {
            SummarDebug.log(1, `예약된 Zoom 미팅 실행: ${event.title} 시작시간: ${event.start.toLocaleString()}`);
            await launchZoomMeeting(zoomUrl);
            scheduledMeetings.delete(meetingKey);
          }, delay);
          scheduledMeetings.set(meetingKey, timer);
        } else {
          SummarDebug.log(1, `Zoom URL을 찾을 수 없음: ${event.title}`);
        }
      } else {
        // 이미 지난 이벤트에 대해 예약이 있다면 취소
        if (scheduledMeetings.has(meetingKey)) {
          clearTimeout(scheduledMeetings.get(meetingKey)!);
          scheduledMeetings.delete(meetingKey);
        }
      }
    }

    // 기존에 예약된 타이머 중 새 이벤트 목록에 없는 것은 취소 (예: 일정 삭제 또는 변경)
    for (const key of scheduledMeetings.keys()) {
      if (!newMeetingKeys.has(key)) {
        clearTimeout(scheduledMeetings.get(key)!);
        scheduledMeetings.delete(key);
        SummarDebug.log(1, `예약 취소된 Zoom 미팅: ${key}`);
      }
    }
  } catch (error) {
    SummarDebug.error(1, "예약 업데이트 중 오류 발생:", error);
  }
}
