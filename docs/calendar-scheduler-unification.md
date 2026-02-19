# Calendar Scheduler Unification Plan

## Overview

CalDAV(macOS Calendar / Swift)와 GCal(Google Calendar / events.json) 두 스케줄러를
하나로 통합하고, calendarType 설정으로 어떤 소스를 사용할지 결정한다.

## Goals

1. `system.calendarType` ('CalDAV' | 'GCal') 으로 소스 선택
2. 두 소스 모두 `CalendarHandler.events`(단일 이벤트 저장소)를 채움
3. `findEventAtTime()`, `findEventFromAudioFiles()` 등 기존 메서드는 변경 없이 동작
4. 설정 탭 UI 분기를 summar_common.json(네트워크 의존) 대신 calendarType으로 결정
5. 기존 CalDAV 사용자는 자동 마이그레이션(calendarName 유무 추론)

---

## Phase 1: pluginsettingsv2.ts — calendarType 추가

### 변경 내용

**1-1. `system` 섹션에 calendarType 추가**

```typescript
system: {
  debugLevel: number;
  testUrl: string;
  autoUpdateInterval: number;
  settingHelper: string;
  calendarType: 'CalDAV' | 'GCal';  // 추가
} = {
  debugLevel: 0,
  testUrl: "",
  autoUpdateInterval: 1000 * 60 * 60 * 24,
  settingHelper: "",
  calendarType: 'GCal'              // 기본값
};
```

**1-2. `resetToDefaults()`에 calendarType 추가**

```typescript
Object.assign(this.system, {
  debugLevel: 0,
  testUrl: "",
  autoUpdateInterval: 1000 * 60 * 60 * 24,
  settingHelper: "",
  calendarType: 'GCal'  // 추가
});
```

**1-3. `mergeWithLoaded()`에 마이그레이션 추론 추가**

`system` 병합 직후에 삽입:

```typescript
if (loaded.system) {
  Object.assign(this.system, loaded.system);
}

// calendarType이 저장 파일에 없는 구버전 사용자를 위한 추론
// schedule은 위에서 이미 병합 완료됨
if (!(loaded.system as any)?.calendarType) {
  const hasCalDAV = this.schedule.calendarName
    .filter(n => n.trim() !== '').length > 0;
  this.system.calendarType = hasCalDAV ? 'CalDAV' : 'GCal';
}
```

**스키마 버전 bump 불필요** — Object.assign 병합 방식이 새 필드를 자연스럽게 처리함

---

## Phase 2: google-calendar-scheduler.ts — events 동기화 및 상태바 업데이트

### 변경 내용

**2-1. `start()`에 reservedStatus 업데이트 추가**

CalDAV는 `CalendarHandler.init()` 안에서 상태바를 업데이트하지만, GCal 모드에서는
해당 코드가 실행되지 않는다. `GoogleCalendarScheduler.start()`에서 동일하게 처리:

```typescript
start(): void {
  // 상태바 아이콘 업데이트 (CalendarHandler.init()과 동일한 로직)
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
```

**2-2. `updateScheduledMeetings()`에서 calendarHandler.events 업데이트**

`setEvents()` 호출을 이벤트 유무와 관계없이 항상 실행한다.
이렇게 해야 자정 이후 이전 날의 이벤트가 `calendarHandler.events`에 남아있는
stale data 문제를 방지할 수 있다:

```typescript
async updateScheduledMeetings(): Promise<void> {
  const jsonData = await readCalendarJson(
    this.plugin.settingsv2.schedule.googleDriveFilePath,
    undefined,
    this.plugin.app.vault.getName()
  );

  // ★ events.json이 비어있거나 읽기 실패해도 항상 events를 업데이트
  //    (빈 배열로 초기화해 stale 데이터 방지)
  const calendarEvents = jsonData
    ? jsonData.events.map(raw => this.convertToCalendarEvent(raw))
    : [];
  this.plugin.calendarHandler.setEvents(calendarEvents);

  if (!jsonData || jsonData.events.length === 0) return;

  this.timers.forEach(timer => clearTimeout(timer));
  this.timers.clear();

  // ... 기존 스케줄링 로직 유지 ...
}
```

### calendarhandler.ts에 setEvents() 추가

```typescript
// 외부에서 events 배열을 교체할 수 있도록 (GCal 스케줄러가 사용)
setEvents(events: CalendarEvent[]): void {
  this.events = events;
}
```

이렇게 하면 `findEventAtTime()`, `findEventFromAudioFiles()`, `displayEvents()`가
calendarType에 관계없이 항상 최신 이벤트를 참조한다.

---

## Phase 3: calendarhandler.ts — CalDAV 스케줄링 가드 추가

### 변경 내용

`init()` 내의 플랫폼 가드에 calendarType 조건 추가:

```typescript
private async init() {
  try {
    if (Platform.isMacOS && Platform.isDesktopApp
        && this.plugin.settingsv2.system.calendarType === 'CalDAV') {  // ★ 추가
      await this.checkSwiftEnvironment();
      await this.updateScheduledMeetings();
      if (this.plugin.settingsv2.schedule.autoLaunchVideoMeetingOnSchedule) {
        this.plugin.reservedStatus.setStatusbarIcon("calendar-clock", "red");
      } else {
        this.plugin.reservedStatus.setStatusbarIcon("calendar-x", "var(--text-muted)");
      }
      this.intervalId = setInterval(() => {
        this.updateScheduledMeetings();
      }, this.plugin.settingsv2.schedule.calendar_polling_interval);
    }
  } catch (error) { ... }
}
```

`stop()` 변경 없음 — GCal 모드에서 `intervalId`가 미초기화 상태이더라도
`clearInterval(undefined)`은 no-op으로 안전하다.

---

## Phase 4: main.ts — 스케줄러 선택 단일 분기

### 변경 내용

**4-1. 타입 선언을 optional로 변경**

calendarType='CalDAV'일 때 `googleCalendarScheduler`가 초기화되지 않으므로
TypeScript 컴파일 오류 방지를 위해 optional 타입으로 변경:

```typescript
// 변경 전
googleCalendarScheduler: GoogleCalendarScheduler;

// 변경 후
googleCalendarScheduler?: GoogleCalendarScheduler;
```

**4-2. 스케줄러 초기화를 단일 분기로 통합**

```typescript
// 변경 전
this.calendarHandler = new CalendarHandler(this);
this.googleCalendarScheduler = new GoogleCalendarScheduler(this);
this.googleCalendarScheduler.start();

// 변경 후
this.calendarHandler = new CalendarHandler(this);        // 항상 생성 (UI/조회 메서드 필요)
if (this.settingsv2.system.calendarType === 'GCal') {
  this.googleCalendarScheduler = new GoogleCalendarScheduler(this);
  this.googleCalendarScheduler.start();
}
// CalDAV: CalendarHandler.init()이 내부적으로 처리 (Phase 3 가드)
```

**4-3. onunload() — null 체크는 기존대로 유지**

```typescript
if (this.googleCalendarScheduler) {
  this.googleCalendarScheduler.stop();
  SummarDebug.log(1, "Stopped Google Calendar scheduler");
}
```

optional 타입이므로 `if` 체크가 TypeScript에서도 정상 동작한다.

---

## Phase 5: summarsettingtab.ts — calendarType으로 UI 분기

### 핵심 제약사항

`renderGoogleCalendarUI(containerEl, webAppUrl)`에 전달하는 `webAppUrl`은
사용자가 배포한 Google Apps Script URL(`config.calendar.selectCalendar`)이다.
이 값은 `settingHelper`(summar_common.json 엔드포인트 URL)와 **다르다**.

`CalendarSettingModal`이 이 URL을 사용해 GAS 웹앱을 열기 때문에
([calendarsettingmodal.ts:293](../src/calendarsettingmodal.ts#L293)),
GCal 브랜치에서는 여전히 `summar_common.json` fetch가 필요하다.

따라서 Phase 5에서 달성하는 것은:
- **제거**: 네트워크 응답으로 calendarType을 결정하는 로직
- **유지**: GCal 브랜치에서 webAppUrl 획득을 위한 fetch

### 변경 내용

```typescript
// 변경 전
async buildCalendarSettings(containerEl: HTMLElement): Promise<void> {
  containerEl.createEl('h2', { text: 'Calendar integration' });
  const helperUrl = 'https://line-objects-dev.com/summar/summar_common.json';
  try {
    const response = await SummarRequestUrlWithTimeout(this.plugin, helperUrl, 2000);
    if (response.status === 200 && response.json) {
      const config = response.json as SettingHelperConfig;
      if (config.calendar?.selectCalendar) {
        await this.renderGoogleCalendarUI(containerEl, config.calendar.selectCalendar);
        await this.renderCommonCalendarUI(containerEl, true);
        return;
      }
    }
  } catch (error) {
    console.log('[Calendar Settings] Failed to fetch summar_common.json, using CalDAV setting');
  }
  this.renderCalDAVUI(containerEl);
  await this.renderCommonCalendarUI(containerEl, false);
}

// 변경 후
async buildCalendarSettings(containerEl: HTMLElement): Promise<void> {
  containerEl.createEl('h2', { text: 'Calendar integration' });

  if (this.plugin.settingsv2.system.calendarType === 'GCal') {
    // UI 분기는 calendarType으로 결정 (네트워크 불필요)
    // 단, CalendarSettingModal에 전달할 GAS 웹앱 URL은 summar_common.json에서 가져옴
    let webAppUrl = '';
    try {
      let helperUrl = this.plugin.settingsv2.system.settingHelper;
      if (!helperUrl || helperUrl.length === 0) {
        helperUrl = 'https://line-objects-dev.com/summar/summar_common.json';
      }
      const response = await SummarRequestUrlWithTimeout(this.plugin, helperUrl, 2000);
      if (response.status === 200 && response.json) {
        const config = response.json as SettingHelperConfig;
        webAppUrl = config.calendar?.selectCalendar ?? '';
      }
    } catch (error) {
      console.log('[Calendar Settings] Failed to fetch webAppUrl from summar_common.json');
    }
    await this.renderGoogleCalendarUI(containerEl, webAppUrl);
    await this.renderCommonCalendarUI(containerEl, true);
  } else {
    this.renderCalDAVUI(containerEl);
    await this.renderCommonCalendarUI(containerEl, false);
  }
}
```

---

## 수정 파일 요약

| 파일 | 변경 내용 |
|------|----------|
| `src/pluginsettingsv2.ts` | system.calendarType 추가, resetToDefaults 업데이트, mergeWithLoaded에 CalDAV 추론 로직 추가 |
| `src/google-calendar-scheduler.ts` | start()에 reservedStatus 업데이트 추가, updateScheduledMeetings()에서 setEvents() 항상 호출 |
| `src/calendarhandler.ts` | setEvents() 메서드 추가, init()에 calendarType 가드 추가 |
| `src/main.ts` | googleCalendarScheduler를 optional 타입으로 변경, 스케줄러 선택 단일 분기로 통합 |
| `src/summarsettingtab.ts` | buildCalendarSettings()에서 UI 분기를 calendarType으로 결정, webAppUrl fetch는 GCal 브랜치에서만 실행 |

---

## 데이터 흐름 비교

### 변경 전

```
CalDAV:  CalendarHandler.init() → fetchZoomMeetings() → this.events → 스케줄링 + 조회
GCal:    GoogleCalendarScheduler → readCalendarJson()               → 스케줄링만
         (조회 시 this.events가 비어있어 findEventAtTime 실패)

설정 탭: summar_common.json fetch 결과로 GCal/CalDAV UI 분기 결정
```

### 변경 후

```
CalDAV:  CalendarHandler.init() [calendarType='CalDAV']
           → fetchZoomMeetings() → this.events → 스케줄링 + 조회

GCal:    GoogleCalendarScheduler.start() [calendarType='GCal']
           → readCalendarJson()
           → calendarHandler.setEvents() → this.events (항상 최신화, stale 방지)
           → 스케줄링 + 조회 (findEventAtTime, findEventFromAudioFiles 정상 동작)

설정 탭: calendarType으로 UI 분기 결정 (네트워크 독립)
         GCal 브랜치에서만 webAppUrl 획득 목적으로 summar_common.json fetch
```

---

## 사이드이펙트 검토

| 항목 | 결과 |
|------|------|
| CalendarHandler.stop() — GCal 모드에서 intervalId 미초기화 | clearInterval(undefined) = no-op, 안전 |
| calendarName 빈 배열일 때 GCal 추론 | 'GCal'로 추론, 정상 |
| 설정 탭 CalDAV 섹션의 calendarHandler.updateScheduledMeetings() 호출 | CalDAV 브랜치에서만 렌더링되므로 안전 |
| GoogleCalendarScheduler 첫 updateScheduledMeetings() 비동기 | 이후 즉시 events 접근 없음, 안전 |
| displayEvents() GCal 모드에서 호출 가능성 | CalDAV 브랜치에서만 렌더링, GCal 모드에서 호출되지 않음 |
| webAppUrl fetch 실패 시 (네트워크 불가) | webAppUrl = '' → Calendar Setting 모달 버튼이 빈 URL을 열게 됨 (기존과 동일한 한계) |

---

## 검증 포인트

1. **GCal 모드**: 일정 시작 시 자동 실행 → 녹음 종료 후 `findEventAtTime()`으로 미팅 정보 정상 매칭
2. **CalDAV 모드**: 기존 동작과 동일
3. **기존 CalDAV 사용자 업데이트**: calendarName 있음 → calendarType='CalDAV' 자동 추론
4. **신규 설치**: calendarName 없음 → calendarType='GCal' 기본값
5. **설정 탭**: calendarType='GCal'이면 Google Calendar UI, 'CalDAV'이면 CalDAV UI (네트워크 없이 즉시 렌더링)
6. **상태바**: GCal/CalDAV 모두 autoLaunchVideoMeetingOnSchedule 설정에 따라 정확히 업데이트
7. **stale 이벤트**: 자정 이후 또는 events.json이 비어있을 때 이전 이벤트가 남아있지 않음
