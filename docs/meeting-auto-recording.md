# Meeting Auto Recording - Requirements & Implementation

## 1. Overview

캘린더 일정에서 미팅 링크(Zoom, Google Meet)를 감지하여 자동으로 미팅 앱을 실행하고, 미팅 중 녹음을 진행한 후, 미팅 종료 시 녹음을 중지하고 자동 전사/요약을 수행하는 기능.

---

## 2. Current State: Zoom Meeting

### 2.1 Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ CalendarHandler (calendarhandler.ts)                                     │
│                                                                          │
│  init()                                                                  │
│  ├─ Swift 환경 검증 (checkSwiftEnvironment)                                │
│  ├─ updateScheduledMeetings() 초기 실행                                    │
│  └─ setInterval(10분) → updateScheduledMeetings() 주기적 실행              │
│                                                                          │
│  updateScheduledMeetings()                                               │
│  ├─ fetchZoomMeetings() → Swift 스크립트 실행 → JSON 파싱                   │
│  ├─ 일정 목록 갱신 (this.events)                                           │
│  └─ autoLaunchVideoMeetingOnSchedule 활성화 시                                     │
│     └─ setTimeout(delayMs) → launchZoomMeeting(zoom_link)                │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ RecordingManager (recordingmanager.ts)                                    │
│                                                                          │
│  startZoomAutoRecordWatcher()                                            │
│  └─ setInterval(3초)                                                     │
│     └─ exec('pgrep -x "CptHost"')                                       │
│        ├─ CptHost 발견 & !wasZoomRunning → startRecording()              │
│        └─ CptHost 미발견 & wasZoomRunning → toggleRecording()            │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Main Plugin (main.ts)                                                    │
│                                                                          │
│  toggleRecording()                                                       │
│  ├─ 녹음 중이 아니면 → startRecording()                                    │
│  └─ 녹음 중이면 → stopRecording()                                         │
│     ├─ 오디오 파일 수집                                                    │
│     ├─ audioHandler.sendAudioData() → STT 전사                            │
│     └─ recordingManager.summarize() → AI 요약                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Files

| File | Role |
|------|------|
| `src/fetch_calendar.swift` | macOS EventKit으로 캘린더 접근, Zoom 링크 추출 |
| `src/fetch_calendar_wrapper.sh` | Swift 환경 래퍼 스크립트 |
| `src/calendarhandler.ts` | 캘린더 폴링, Zoom 실행 예약, 이벤트 관리 |
| `src/recordingmanager.ts` | 녹음 관리, Zoom 프로세스 감시 (CptHost) |
| `src/audiohandler.ts` | 음성 파일 STT 처리 |
| `src/main.ts` | toggleRecording (녹음 → 전사 → 요약 파이프라인) |

### 2.3 Flow

```
1. 플러그인 로드 (main.ts:onload)
   ├─ CalendarHandler 초기화 (10분마다 캘린더 업데이트)
   └─ autoRecordOnZoomMeeting → startZoomAutoRecordWatcher() (3초마다 CptHost 감시)

2. 캘린더 업데이트 (10분 주기)
   ├─ fetchZoomMeetings() → Swift 스크립트 → JSON
   │   ├─ EventKit으로 캘린더 접근
   │   ├─ Zoom 링크 추출 (정규식: https?://\S*zoom\.us\S*)
   │   └─ 참석 상태 확인 (accepted/organizer/declined/pending/tentative)
   └─ autoLaunchVideoMeetingOnSchedule && shouldAutoLaunch
       └─ setTimeout(delayMs) → launchZoomMeeting() (macOS `open` 명령)

3. Zoom 미팅 시작 감지
   ├─ CptHost 프로세스 감지 (pgrep -x "CptHost", 3초 간격)
   ├─ wasZoomRunning 상태 전환 (false → true)
   └─ startRecording() 자동 호출
      ├─ 현재 캘린더 이벤트 조회 (findEventAtTime)
      ├─ 미팅 정보 저장 (meeting-info.md, event-metadata.json)
      └─ 녹음 시작 + 주기적 청크 저장 (recordingUnit 간격)

4. Zoom 미팅 종료 감지
   ├─ CptHost 프로세스 종료 감지
   ├─ wasZoomRunning 상태 전환 (true → false)
   └─ toggleRecording() 호출
      ├─ stopRecording() → 마지막 오디오 청크 저장
      ├─ audioHandler.sendAudioData() → STT 전사
      └─ recordingManager.summarize() → AI 요약 (→ refine)
```

### 2.4 Key Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `schedule.autoLaunchVideoMeetingOnSchedule` | false | 캘린더 일정에 따라 Zoom 자동 실행 |
| `schedule.autoLaunchVideoMeetingOnlyAccepted` | true | accepted/organizer 상태만 자동 실행 |
| `schedule.calendar_polling_interval` | 600,000ms | 캘린더 업데이트 주기 (10분) |
| `recording.autoRecordOnZoomMeeting` | false | Zoom 미팅 시 자동 녹음 |
| `recording.recordingUnit` | 15분 | 녹음 청크 저장 간격 |
| `recording.organizeByDate` | false | 녹음을 날짜별 폴더에 정리 |

### 2.5 Auto Launch Conditions

```typescript
const shouldAutoLaunch =
    autoLaunchVideoMeetingOnSchedule &&                    // 설정 활성화
    delayMs > 0 && delayMs < MAX_DELAY &&          // 시간 범위 내 (polling * 3)
    !this.timers.has(event.start.getTime()) &&     // 중복 예약 방지
    event.zoom_link && event.zoom_link.length > 0 && // Zoom 링크 존재
    (!autoLaunchVideoMeetingOnlyAccepted ||                // 참석 상태 조건
     event.participant_status === "accepted" ||
     event.participant_status === "organizer" ||
     event.participant_status === "unknown");
```

---

## 3. New Feature: Google Meet Support

### 3.1 Requirements

1. 캘린더 일정에서 Google Meet 링크를 추출한다
2. 일정 시작 시 Google Meet을 브라우저에서 실행하고 녹음을 자동 시작한다
3. 일정 종료 시 녹음 종료 안내창을 표시한다
4. 안내창에는 "녹음 종료"와 "5분 후 다시 확인" 두 버튼을 보여준다
5. "5분 후 다시 확인"을 선택하면 5분 후 동일한 안내창을 다시 보여준다 (반복)
6. 사용자가 "녹음 종료"를 선택하면 자동 전사 → 자동 요약을 진행한다
7. 기존 Zoom 미팅 로직은 변경 없이 유지한다

### 3.2 Zoom vs Google Meet

| Item | Zoom | Google Meet |
|------|------|-------------|
| Link Pattern | `https?://\S*zoom\.us\S*` | `https?://meet\.google\.com/[a-z]+-[a-z]+-[a-z]+` |
| App Type | Native app (독립 프로세스) | Browser-based (브라우저 탭) |
| Launch | `open "zoom_url"` | `open "meet_url"` |
| Meeting Detection | `pgrep -x "CptHost"` (프로세스 감지) | **불가능** (브라우저 탭이므로 프로세스 감지 불가) |
| End Detection | CptHost 프로세스 종료 감지 | **캘린더 일정 종료 시간 기반 + 사용자 확인** |
| Recording Start | CptHost 감지 시 자동 시작 | 일정 시작 시간에 자동 시작 |
| Recording Stop | CptHost 종료 감지 시 자동 종료 | 일정 종료 → 안내창 → 사용자 확인 후 종료 |

### 3.3 Implementation Flow

```
1. 캘린더 업데이트 (10분 주기)
   │
   ├─ Google Meet 링크가 있는 일정 발견
   │
   └─ 일정 시작 시간에 타이머 설정
      │
      ├─ [시작 시간] Google Meet 실행 (open URL → 기본 브라우저에서 열림)
      ├─ [시작 시간] 녹음 자동 시작 (startRecording)
      │
      └─ [종료 시간] 안내창 타이머 설정
         │
         └─ [종료 시간 도달] 안내창 표시 (Modal)
            │
            ├─ "녹음 종료" 클릭
            │   └─ toggleRecording() → stopRecording → 전사 → 요약
            │
            └─ "5분 후 다시 확인" 클릭
                └─ setTimeout(5분) → 동일 안내창 다시 표시 (반복)
```

### 3.4 Recording End Prompt UI

```
┌─────────────────────────────────────────┐
│  Meeting Recording                       │
├─────────────────────────────────────────┤
│                                         │
│  "[미팅 제목]" has ended.               │
│                                         │
│  Would you like to stop recording?      │
│                                         │
│  ┌──────────────┐  ┌────────────────┐   │
│  │ Stop Recording│  │ Remind in 5min │   │
│  └──────────────┘  └────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 4. Implementation Plan

### 4.1 Files to Modify

| # | File | Changes |
|---|------|---------|
| 1 | `src/fetch_calendar.swift` | Google Meet 링크 추출 함수 추가, eventData에 `google_meet_link` 필드 추가 |
| 2 | `src/calendarhandler.ts` | CalendarEvent/ZoomMeeting 인터페이스에 `google_meet_link` 추가, Google Meet 실행/녹음/안내창 로직 |
| 3 | `src/recordingendprompt.ts` **(new)** | 녹음 종료 안내창 Modal 클래스 (SRP: 별도 파일) |
| 4 | `src/main.ts` | Google Meet 녹음 종료 후 전사/요약 연결 |

### 4.2 Detailed Changes

#### 4.2.1 fetch_calendar.swift

```swift
// 추가: Google Meet 링크 추출 함수
func extractGoogleMeetLink(from text: String?) -> String? {
    guard let text = text else { return nil }
    let pattern = #"https?://meet\.google\.com/[a-z]+-[a-z]+-[a-z]+"#
    let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive)
    if let match = regex?.firstMatch(in: text, options: [],
                                      range: NSRange(location: 0, length: text.utf16.count)) {
        if let range = Range(match.range, in: text) {
            return String(text[range])
        }
    }
    return nil
}

// eventData에 google_meet_link 필드 추가
let googleMeetLink = extractGoogleMeetLink(from: notes)
                  ?? extractGoogleMeetLink(from: location) ?? ""

let eventData: [String: Any] = [
    // ... 기존 필드 유지 ...
    "zoom_link": zoomLink,
    "google_meet_link": googleMeetLink,    // NEW
    // ...
]
```

#### 4.2.2 calendarhandler.ts

**Interface 변경:**
```typescript
interface CalendarEvent {
    // ... 기존 필드 ...
    zoom_link?: string;
    google_meet_link?: string;    // NEW
}

interface ZoomMeeting {
    // ... 기존 필드 ...
    zoom_link: string;
    google_meet_link: string;     // NEW
}
```

**updateScheduledMeetings() 변경:**
```typescript
// 기존 Zoom 자동 실행 로직 유지 (변경 없음)
if (shouldAutoLaunch) {
    // ... Zoom 실행 (기존 코드)
}

// Google Meet 자동 실행 + 녹음 로직 추가
const hasGoogleMeetLink = event.google_meet_link && event.google_meet_link.length > 0;
const shouldAutoLaunchGoogleMeet =
    this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule &&
    delayMs > 0 && delayMs < MAX_DELAY &&
    !this.timers.has(event.start.getTime()) &&
    !event.zoom_link &&              // Zoom 링크가 없는 경우만
    hasGoogleMeetLink &&
    (참석 상태 조건);

if (shouldAutoLaunchGoogleMeet) {
    const timer = setTimeout(async () => {
        await this.launchMeeting(event.google_meet_link);
        await this.plugin.recordingManager.startRecording(
            this.plugin.settingsv2.recording.recordingUnit
        );
        this.scheduleRecordingEndPrompt(event);
    }, delayMs);
    this.timers.set(event.start.getTime(), timer);
}
```

**새 메서드:**
```typescript
// Google Meet 실행 (기존 launchZoomMeeting과 동일 구조)
async launchMeeting(url: string): Promise<void>

// 녹음 종료 안내창 스케줄링
private scheduleRecordingEndPrompt(event: CalendarEvent): void {
    const endDelayMs = event.end.getTime() - Date.now();
    if (endDelayMs > 0) {
        setTimeout(() => this.showRecordingEndPrompt(event), endDelayMs);
    }
}

// 녹음 종료 안내창 표시 (5분 반복)
private showRecordingEndPrompt(event: CalendarEvent): void {
    if (this.plugin.recordingManager.getRecorderState() !== "recording") return;
    new RecordingEndPromptModal(this.plugin.app, event.title, {
        onStop: () => this.plugin.toggleRecording(),
        onRemind: () => setTimeout(() => this.showRecordingEndPrompt(event), 5 * 60 * 1000)
    }).open();
}
```

#### 4.2.3 recordingendprompt.ts (New File)

```typescript
import { App, Modal } from "obsidian";

interface RecordingEndPromptCallbacks {
    onStop: () => void;
    onRemind: () => void;
}

export class RecordingEndPromptModal extends Modal {
    private title: string;
    private callbacks: RecordingEndPromptCallbacks;

    constructor(app: App, title: string, callbacks: RecordingEndPromptCallbacks) {
        super(app);
        this.title = title;
        this.callbacks = callbacks;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Meeting Recording" });
        contentEl.createEl("p", { text: `"${this.title}" has ended.` });
        contentEl.createEl("p", { text: "Would you like to stop recording?" });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

        buttonContainer.createEl("button", { text: "Stop Recording", cls: "mod-cta" })
            .addEventListener("click", () => {
                this.close();
                this.callbacks.onStop();
            });

        buttonContainer.createEl("button", { text: "Remind in 5min" })
            .addEventListener("click", () => {
                this.close();
                this.callbacks.onRemind();
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}
```

### 4.3 Both Zoom & Google Meet in Same Event

하나의 일정에 Zoom과 Google Meet 링크가 모두 있는 경우:
- **Zoom 링크 우선** 적용 (기존 동작 유지)
- Google Meet 로직은 `!event.zoom_link` 조건으로 Zoom이 없는 경우만 실행

---

## 5. Coexistence: Zoom & Google Meet

| Scenario | Zoom | Google Meet |
|----------|------|-------------|
| Link Detection | `zoom_link` field | `google_meet_link` field |
| Auto Launch | setTimeout → `open "zoom_url"` | setTimeout → `open "meet_url"` |
| Recording Start | CptHost 프로세스 감지 → 자동 | 일정 시작 시간 → 자동 |
| Recording Stop | CptHost 종료 감지 → 자동 | 일정 종료 → 안내창 → 사용자 확인 |
| Transcription | toggleRecording → sendAudioData | toggleRecording → sendAudioData (동일) |
| Summarization | recordingManager.summarize() | recordingManager.summarize() (동일) |

---

## 6. Edge Cases

| Case | Handling |
|------|----------|
| Zoom + Google Meet 동시 존재 | Zoom 링크 우선 적용 |
| Google Meet 종료 후 사용자가 계속 녹음 | 5분마다 안내창 반복 표시, 사용자 결정 존중 |
| 일정 시작 전 이미 녹음 중 | 중복 녹음 방지 (isRecording 체크) |
| 일정 없이 수동 녹음 | 기존 동작 유지 (안내창 표시 안 함) |
| 안내창 표시 중 녹음이 이미 중지됨 | getRecorderState() 체크 후 안내창 미표시 |
| 캘린더 업데이트로 동일 일정 재예약 | timers Map으로 중복 예약 방지 |

---

## 7. Verification

### 7.1 Google Meet Link Extraction
- [ ] 캘린더에 Google Meet 링크가 포함된 일정 생성
- [ ] 플러그인 로그에서 `google_meet_link` 필드 확인

### 7.2 Auto Launch + Recording
- [ ] 테스트용 Google Meet 일정 (1-2분 후 시작) 생성
- [ ] 일정 시작 시 브라우저에서 Google Meet 열림 확인
- [ ] 녹음 자동 시작 확인

### 7.3 End Prompt
- [ ] 일정 종료 시간에 안내창 표시 확인
- [ ] "5분 후 다시 확인" 클릭 → 5분 후 재표시 확인
- [ ] "녹음 종료" 클릭 → 전사/요약 진행 확인

### 7.4 Zoom Regression
- [ ] Zoom 일정 자동 실행 정상 동작 확인
- [ ] CptHost 기반 자동 녹음/종료 정상 동작 확인
- [ ] Zoom + Google Meet 동시 일정에서 Zoom 우선 확인
