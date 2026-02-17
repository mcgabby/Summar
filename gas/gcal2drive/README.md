# gcal2drive2 - Google Calendar to Google Drive Sync

Google Calendar 이벤트를 Google Drive에 JSON 형식으로 자동 동기화하는 Google Apps Script 프로젝트입니다.

## 주요 기능

- ✅ 여러 캘린더에서 이벤트 수집
- ✅ 회의 URL 자동 추출 (Zoom/Google Meet/Microsoft Teams)
- ✅ 주기적 자동 동기화 (N분마다)
- ✅ 캘린더 변경 시 즉시 동기화
- ✅ Google Drive에 JSON 파일로 저장
- ✅ Summar 통합 지원 (URL 파라미터)

## 배포 방법

### 1. Google Apps Script 프로젝트 생성

1. [Google Apps Script](https://script.google.com) 접속
2. 새 프로젝트 생성
3. 프로젝트 이름: `gcal2drive2`

### 2. 파일 추가

**Code.gs**
- 프로젝트에 `Code.gs` 파일 생성
- 이 디렉토리의 `Code.gs` 내용 복사/붙여넣기

**Settings.html**
- 프로젝트에 `Settings.html` 파일 추가 (+ 버튼 → HTML)
- 이 디렉토리의 `Settings.html` 내용 복사/붙여넣기

### 3. Advanced Calendar API 활성화

1. Apps Script 에디터에서 왼쪽 메뉴 → Services (⊕ 버튼)
2. "Google Calendar API" 검색 후 추가
3. Identifier: `Calendar` (기본값)

### 4. 웹앱 배포

1. 오른쪽 상단 "배포" → "새 배포"
2. 유형 선택: "웹 앱"
3. 설정:
   - **설명**: `gcal2drive2 v1.0`
   - **다음 계정으로 실행**: 나
   - **액세스 권한**: 나만 (또는 필요에 따라 조정)
4. "배포" 클릭
5. **웹 앱 URL 복사** (나중에 사용)

## 사용 방법

### 옵션 1: Summar에서 실행 (권장)

Summar 설정창에서 다음 URL로 웹앱 실행:

```
https://script.google.com/macros/s/[deployment-id]/exec?filePath=Summar/calendar/events.json&interval=10
```

**파라미터:**
- `filePath`: Google Drive 저장 경로 (폴더 포함)
- `interval`: 동기화 간격 (분 단위, **1, 5, 10, 15, 30만 허용**)

### 옵션 2: 직접 실행

웹 앱 URL을 브라우저에서 직접 열기:

```
https://script.google.com/macros/s/[deployment-id]/exec
```

기본값 사용:
- filePath: `Summar/calendar/events.json`
- interval: `10분`

### 설정 과정

1. **권한 승인**: 처음 실행 시 Google Calendar/Drive 권한 승인
2. **캘린더 선택**: 동기화할 캘린더 체크박스 선택
3. **저장**: "Save Settings & Start Sync" 버튼 클릭
4. **자동 동기화**:
   - 즉시 1회 동기화 실행
   - N분마다 자동 동기화
   - 캘린더 변경 시 즉시 동기화

## JSON 출력 형식

```json
{
  "selectedCalendars": [
    {
      "id": "primary",
      "name": "Work Calendar"
    },
    {
      "id": "user@example.com",
      "name": "Personal"
    }
  ],
  "lastSync": "2025-02-17T10:30:00.000Z",
  "events": [
    {
      "calendarName": "Work Calendar",
      "title": "Team Meeting",
      "start": "2025-02-17T14:00:00.000Z",
      "end": "2025-02-17T15:00:00.000Z",
      "meeting_url": "https://zoom.us/j/123456789",
      "description": "Weekly team sync",
      "location": "Conference Room A",
      "attendees": [
        "alice@example.com",
        "bob@example.com"
      ],
      "participant_status": "accepted",
      "isAllDay": false
    }
  ]
}
```

## 저장 위치

Google Drive:
```
/Summar/
  └── calendar/
      └── events.json
```

폴더가 없으면 자동으로 생성됩니다.

## 트리거 관리

스크립트가 자동으로 생성하는 트리거:

1. **Time-based trigger**: N분마다 `syncEventsToDrive()` 실행
2. **Calendar update triggers**: 각 선택한 캘린더의 이벤트 변경 시 `syncEventsToDrive()` 실행

트리거 확인:
- Apps Script 에디터 → 왼쪽 메뉴 → 트리거 (⏰)

## 문제 해결

### 캘린더가 로드되지 않음
- Google Calendar API가 활성화되어 있는지 확인
- 권한 승인이 완료되었는지 확인

### 동기화가 작동하지 않음
1. Apps Script 에디터 → 실행 로그 확인
2. 트리거가 생성되어 있는지 확인 (⏰ 메뉴)
3. Properties Service 확인:
   ```javascript
   PropertiesService.getUserProperties().getProperties()
   ```

### 회의 URL이 추출되지 않음
- 이벤트에 conferenceData가 있는지 확인
- location 또는 description에 URL이 포함되어 있는지 확인
- 지원 형식: `zoom.us`, `meet.google.com`, `teams.microsoft.com`

### 동기화 간격 에러
- Google Apps Script의 `everyMinutes()`는 **1, 5, 10, 15, 30분만 지원**
- 다른 값(예: 40분)을 전달하면 에러 발생
- Summar에서는 자동으로 가장 가까운 유효한 값으로 변환됨

## 코드 재사용

이 프로젝트는 다음 로직을 재사용합니다:

**gcal2drive에서:**
- `collectMeetingLinks()` → `extractMeetingUrl()`
- `stripHtml()`
- `ensureCheckUpcomingEventsTrigger()` → `ensureSyncTrigger()`
- `ensureCalendarEventUpdateTriggers()` → `ensureCalendarTriggers()`

**FetchEventsFromCalendar에서:**
- `getOrCreateFolderFromPath()`

## 라이선스

MIT License
