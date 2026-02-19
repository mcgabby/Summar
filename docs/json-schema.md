# Summar 플러그인 JSON 데이터 구조 정리

## JSON 파일과 런타임 구조체 매핑

### 파일 로딩 순서 및 의존성

플러그인 로딩 시 다음 순서로 JSON 파일들이 처리됩니다:

1. **`models.json`** → `SummarPlugin.modelsJson` (전체 모델 데이터)
   - 로딩 함수: `loadModelsFromFile()`
   - 추가 매핑: `modelsByCategory`, `defaultModelsByCategory`

2. **`prompts.json`** → `SummarPlugin.defaultPrompts` (기본 프롬프트 참조)
   - 로딩 함수: `loadPromptsFromFile()`
   - 사용자 설정이 비어있을 때만 `settings`에 적용

3. **`model-pricing.json`** → `SummarPlugin.modelPricing` (모델 가격 정보)
   - 로딩 함수: `loadModelPricingFromFile()`

4. **`data-v2.json`** → `SummarPlugin.settingsv2` (사용자 설정, V2 구조)
   - 로딩 함수: `loadSettingsFromFile()`
   - 위 3개 파일의 데이터를 참조하여 기본값 설정
   - 기존 `data.json`은 마이그레이션 후 `data-v1.json`으로 백업됨

### 매핑 관계

| JSON 파일 | 런타임 속성 | 타입 | 설명 |
|-----------|-------------|------|------|
| `models.json` | `modelsJson` | `ModelData` | 전체 모델 데이터 원본 |
| `prompts.json` | `defaultPrompts` | `DefaultPrompts` | 기본 프롬프트 참조용 |
| `model-pricing.json` | `modelPricing` | `any` | 모델별 가격 정보 |
| `data-v2.json` | `settingsv2` | `PluginSettingsV2` | 사용자 개인 설정 (V2 구조) |
| `data-v1.json` | - | - | V1 설정 백업 파일 (마이그레이션 시 생성) |

### 사용자 설정 보호

- JSON 파일들은 **기본값 제공**용으로만 사용
- 사용자가 이미 설정한 값은 **덮어쓰지 않음**
- 설정이 비어있을 때만 기본값 적용

---

## manifest.json

플러그인 메타 정보(Obsidian 표준)

- `author`: 플러그인 제작자 이름 (예: "Snow Kwon")
- `authorUrl`: 제작자/회사 URL (예: "https://linepluscorp.com")  
- `description`: 플러그인 설명 (예: "Summarizes the content of web pages and PDFs using the OpenAI API.")
- `id`: 플러그인 고유 ID (예: "summar")
- `isDesktopOnly`: 데스크탑 전용 여부 (false - 모바일 지원)
- `minAppVersion`: 최소 지원 Obsidian 버전 (예: "0.13.0")
- `name`: 플러그인 이름 (예: "Summar: AI-Powered Summarizer")
- `version`: 플러그인 버전 (예: "1.1.77")
- `mcwork`: 내부 작업 버전 (예: "1.0.0")

---

## models.json

AI 모델 목록 및 분류 - 각 기능별 사용 가능한 모델과 기본 모델 정의

- `model_list`: 모델 그룹별 모델 정보 객체
  - `webModel`: 웹페이지 요약용 모델 그룹
    - `default`: 기본 모델 (예: "gpt-4.1-mini")
    - `models`: 사용 가능한 모델 목록
      - `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`, `gpt-5.2`, `gpt-5.2-chat-latest`, `o1-mini`, `o3-mini`
      - `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-3-pro-preview`, `gemini-3-flash-preview`
  - `pdfModel`: PDF 요약용 모델 그룹
    - `default`: 기본 모델 (예: "gpt-4o")
    - `models`: 사용 가능한 모델 목록
      - `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`, `gpt-5.2`, `gpt-5.2-chat-latest`
  - `sttModel`: 음성 인식용 모델 그룹
    - `default`: 기본 모델 (예: "whisper-1")
    - `models`: 사용 가능한 모델 목록
      - `whisper-1`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`
      - `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-3-flash-preview`
  - `transcriptSummaryModel`: 녹취 요약용 모델 그룹
    - `default`: 기본 모델 (예: "gpt-4.1-mini")
    - `models`: 사용 가능한 모델 목록
      - `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`, `gpt-5.2`, `gpt-5.2-chat-latest`, `o1-mini`, `o3-mini`
      - `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-3-pro-preview`, `gemini-3-flash-preview`
  - `customModel`: 커스텀 명령용 모델 그룹
    - `default`: 기본 모델 (예: "gpt-4.1-mini")
    - `models`: 사용 가능한 모델 목록
      - `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`, `gpt-5.2`, `gpt-5.2-chat-latest`, `o1-mini`, `o3-mini`
      - `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-3-pro-preview`, `gemini-3-flash-preview`
---

## prompts.json

각 기능별 기본 프롬프트 텍스트 - 언어별로 구성된 프롬프트 템플릿

- `default_prompts`: 언어별 기본 프롬프트 객체
  - `ko`: 한국어 프롬프트 (현재 지원 언어)
    - `webPrompt`: 웹페이지 요약 프롬프트 (배열 형태)
      - 웹페이지 내용을 한국어로 요약하는 상세한 지침
      - 마크다운 형식 출력, 제목/볼드 미사용, 불릿 포인트 사용
      - 200자 이내 한 줄, 50줄 이내 요약 제한
    - `pdfPrompt`: PDF 요약 프롬프트 (배열 형태)
      - 여러 PDF 페이지를 마크다운으로 변환하는 지침
      - 페이지 번호 제거, 테이블 태그 사용, 정확한 내용 인식
    - `sttPrompt`: 모델별 음성 인식 프롬프트 (객체 형태)
      - `"gpt-4o-transcribe"`: gpt-4o-transcribe 모델용 프롬프트 (배열 형태)
      - `"gpt-4o-mini-transcribe"`: gpt-4o-mini-transcribe 모델용 프롬프트 (배열 형태)
      - `"gemini-2.0-flash"`: gemini-2.0-flash 모델용 프롬프트 (배열 형태)
      - `"gemini-2.5-flash"`: gemini-2.5-flash 모델용 프롬프트 (배열 형태)
    - `transcriptSummaryPrompt`: 녹취 요약 프롬프트 (배열 형태)
      - STT 원문을 회의록으로 정리하는 상세한 지침
      - 단어 리스트를 참고한 오타 수정
      - 마크다운 형식, 볼드 표현 금지
      - 배경, Executive Summary, 논의 내용, Action Item 구조
    - `refineSummaryPrompt`: 요약 정제 프롬프트 (배열 형태)
      - 회의록 보강 및 누락 내용 추가 지침
      - 기존 포맷 유지하면서 내용 보완

---

## model-pricing.json

모델별 과금 정보 - OpenAI와 Gemini 모델의 토큰당 가격 정보

- `openai`: OpenAI 모델별 과금 정보
  - `gpt-5.2`: `{ "inputPerK": 0.00175, "outputPerK": 0.014 }`
  - `gpt-5.2-pro`: `{ "inputPerK": 0.021, "outputPerK": 0.168 }`
  - `gpt-5.2-chat-latest`: `{ "inputPerK": 0.00175, "outputPerK": 0.014 }`
  - `gpt-5.2-codex`: `{ "inputPerK": 0.00175, "outputPerK": 0.014 }`
  - `gpt-5.1`: `{ "inputPerK": 0.00125, "outputPerK": 0.010 }`
  - `gpt-5.1-chat-latest`: `{ "inputPerK": 0.00125, "outputPerK": 0.010 }`
  - `gpt-5.1-codex`: `{ "inputPerK": 0.00125, "outputPerK": 0.010 }`
  - `gpt-5.1-codex-mini`: `{ "inputPerK": 0.00025, "outputPerK": 0.002 }`
  - `gpt-5`: `{ "inputPerK": 0.00125, "outputPerK": 0.010 }`
  - `gpt-5-mini`: `{ "inputPerK": 0.00025, "outputPerK": 0.002 }`
  - `gpt-5-nano`: `{ "inputPerK": 0.00005, "outputPerK": 0.0004 }`
  - `gpt-4.1`: `{ "inputPerK": 0.002, "outputPerK": 0.008 }`
  - `gpt-4.1-mini`: `{ "inputPerK": 0.0004, "outputPerK": 0.0016 }`
  - `gpt-4.1-nano`: `{ "inputPerK": 0.0001, "outputPerK": 0.0004 }`
  - `gpt-4o`: `{ "inputPerK": 0.0025, "outputPerK": 0.010 }`
  - `gpt-4o-mini`: `{ "inputPerK": 0.00015, "outputPerK": 0.0006 }`
  - `gpt-4`: `{ "inputPerK": 0.03, "outputPerK": 0.06 }`
  - `gpt-4-turbo`: `{ "inputPerK": 0.01, "outputPerK": 0.03 }`
  - `gpt-3.5-turbo`: `{ "inputPerK": 0.0005, "outputPerK": 0.0015 }`
  - `o1`: `{ "inputPerK": 0.015, "outputPerK": 0.060 }`
  - `o1-pro`: `{ "inputPerK": 0.150, "outputPerK": 0.600 }`
  - `o1-mini`: `{ "inputPerK": 0.0011, "outputPerK": 0.0044 }`
  - `o3`: `{ "inputPerK": 0.002, "outputPerK": 0.008 }`
  - `o3-pro`: `{ "inputPerK": 0.020, "outputPerK": 0.080 }`
  - `o3-mini`: `{ "inputPerK": 0.0011, "outputPerK": 0.0044 }`
  - `o4-mini`: `{ "inputPerK": 0.0011, "outputPerK": 0.0044 }`
  - `whisper-1`: `{ "inputPerMinute": 0.006 }` (음성 모델, 분당 가격)
  - `gpt-4o-transcribe`: `{ "inputPerMinute": 0.006 }`
  - `gpt-4o-mini-transcribe`: `{ "inputPerMinute": 0.003 }`

- `gemini`: Gemini 모델별 과금 정보
  - `gemini-3-pro-preview`: 토큰 수에 따른 차등 가격
    - `under200k`: `{ "inputPerK": 0.002, "outputPerK": 0.012 }`
    - `over200k`: `{ "inputPerK": 0.004, "outputPerK": 0.018 }`
  - `gemini-2.5-pro`: 토큰 수에 따른 차등 가격
    - `under200k`: `{ "inputPerK": 0.00125, "outputPerK": 0.01 }`
    - `over200k`: `{ "inputPerK": 0.0025, "outputPerK": 0.015 }`
  - `gemini-3-flash-preview`: `{ "inputPerK": 0.0005, "outputPerK": 0.003, "audioPerK": 0.001 }`
  - `gemini-2.5-flash`: `{ "inputPerK": 0.0003, "outputPerK": 0.0025, "audioPerK": 0.001 }`
  - `gemini-2.5-flash-lite`: `{ "inputPerK": 0.0001, "outputPerK": 0.0004, "audioPerK": 0.0003 }`
  - `gemini-2.0-flash`: `{ "inputPerK": 0.0001, "outputPerK": 0.0004, "audioPerK": 0.0007 }`

**가격 단위**: USD 기준, K=1000토큰

---

## data.json

사용자 설정 및 플러그인 데이터 - 설정 탭에서 관리되는 모든 설정값

### 스키마 정보
- `settingsSchemaVersion`: 설정 스키마 버전 (string, 현재: "2.0.0")

---

## 탭별 설정 필드

### 1. Common Tab (`common-tab`)
**핵심 API 설정**
- `openaiApiKey`: OpenAI API 키 (string, 기본: "")
- `openaiApiEndpoint`: OpenAI API 엔드포인트 (string, 기본: "")
- `googleApiKey`: Google Gemini API 키 (string, 기본: "")

**Confluence 연동 설정**
- `confluenceApiToken`: Confluence API 토큰 (string, 기본: "")
- `useConfluenceAPI`: Confluence API 사용 여부 (boolean, 기본: true)
- `confluenceDomain`: Confluence 도메인 (string, 기본: "")
- `confluenceParentPageUrl`: 부모 페이지 URL (string, 기본: "")
- `confluenceParentPageSpaceKey`: Space 키 (string, 기본: "")
- `confluenceParentPageId`: 부모 페이지 ID (string, 기본: "")

**Slack 연동 설정**
- `useSlackAPI`: Slack API 사용 여부 (boolean, 기본: false)
- `slackBotToken`: Slack Bot 토큰 (string, 기본: "")
- `slackChannelId`: Slack 채널 ID 또는 사용자명 (string, 기본: "")
- `slackWorkspaceDomain`: Slack 워크스페이스 도메인 (string, 기본: "")
- `slackApiDomain`: 커스텀 Slack API 도메인 (string, 기본: "")

### 2. Webpage Tab (`webpage-tab`)
- `webModel`: 웹페이지 요약 모델 (string, 기본: "" → `models.json`의 `webModel.default`에서 자동 설정)
- `webPrompt`: 웹페이지 요약 프롬프트 (string, 기본: "" → `prompts.json`의 `ko.webPrompt`에서 자동 설정)

### 3. PDF Tab (`pdf-tab`) *macOS 데스크탑 전용*
- `pdfModel`: PDF 요약 모델 (string, 기본: "" → `models.json`의 `pdfModel.default`에서 자동 설정)
- `pdfPrompt`: PDF 요약 프롬프트 (string, 기본: "" → `prompts.json`의 `ko.pdfPrompt`에서 자동 설정)

### 4. Recording Tab (`recording-tab`)
**녹음 기본 설정**
- `autoRecordOnVideoMeeting`: Video 미팅 자동 녹음 여부 (boolean, 기본: false)
- `customVocabulary`: STT 정확도를 높이기 위한 콤마 구분 사용자 용어 목록 (string, 기본: "")
- `selectedDeviceId`: 디바이스별 기본 입력 장치 ID 맵 (record<string,string>, 기본: `{}`)
- `recordingDir`: 녹음 파일 저장 디렉토리 (string, 기본: "")
- `saveTranscriptAndRefineToNewNote`: 녹취 결과를 새 노트로 저장 여부 (boolean, 기본: true)
- `addLinkToDailyNotes`: Daily Notes에 회의록 링크 추가 여부 (boolean, 기본: true)
- `recordingUnit`: 녹음 단위 초 (number, 기본: 15)
- `recordingLanguage`: 녹취 언어 코드 (string, 기본: "ko-KR")

**음성 인식 및 요약 설정**
- `sttModel`: 음성 인식 모델 (string, 기본: "" → `models.json`의 `sttModel.default`에서 자동 설정)
- `sttPrompt`: 모델 키별 커스텀 프롬프트 맵 (record<string,string>, 기본 키: `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gemini-2.0-flash`, `gemini-2.5-flash`)
- `transcriptSummaryModel`: 녹취 요약 모델 (string, 기본: "" → `models.json`의 `transcriptSummaryModel.default`에서 자동 설정)
- `transcriptSummaryPrompt`: 녹취 요약 프롬프트 (string, 기본: "" → `prompts.json`의 `ko.transcriptSummaryPrompt`에서 자동 설정)
- `refineSummary`: 요약 정제 사용 여부 (boolean, 기본: true)
- `refineSummaryPrompt`: 요약 정제 프롬프트 (string, 기본: "" → `prompts.json`의 `ko.refineSummaryPrompt`에서 자동 설정)

### 5. Custom Command Tab (`custom-tab`)
- `cmd_max`: 커스텀 명령어 최대 개수 (number, 기본: 10)
- `cmd_count`: 현재 커스텀 명령어 개수 (number, 기본: 0)
- `cmd_text_N`: N번째 커스텀 명령어 표시명 (string, 동적 키 1~cmd_max)
- `cmd_prompt_N`: N번째 커스텀 명령어 프롬프트 (string, 동적 키 1~cmd_max)
- `cmd_model_N`: N번째 커스텀 명령어 모델 (string, 동적 키 1~cmd_max, 코드 내 기본값: "gpt-4o")
- `cmd_hotkey_N`: N번째 커스텀 명령어 단축키 (string, 동적 키 1~cmd_max)
- `cmd_append_to_note_N`: N번째 명령어 결과 노트 추가 여부 (boolean, 동적 키 1~cmd_max)
- `cmd_copy_to_clipboard_N`: N번째 명령어 결과 클립보드 복사 여부 (boolean, 동적 키 1~cmd_max)

### 6. Schedule Tab (`schedule-tab`) *macOS 데스크탑 전용*
- `calendar_count`: 연동된 캘린더 개수 (number, 기본: 0, 최대: 5)
- `calendar_1` ~ `calendar_5`: 각 캘린더 식별자 (string, 동적 키)
- `calendar_fetchdays`: 캘린더 이벤트 조회 기간 일 (number, 기본: 1)
- `calendar_polling_interval`: 캘린더 자동 갱신 주기 ms (number, 기본: 600000)
- `googleDriveFilePath`: Google Drive 캘린더 이벤트 저장 경로 (string, 기본: "Summar/calendar/events.json")
- `googleDriveSyncInterval`: Google Drive 동기화 간격 초 단위 (number, 기본: 900)
- `autoLaunchVideoMeetingOnSchedule`: 일정 기반 화상회의 자동 실행 여부 (boolean, 기본: false)
- `autoLaunchVideoMeetingOnlyAccepted`: 수락한 일정만 화상회의 자동 실행 여부 (boolean, 기본: true)
- `calendarName`: 선택된 캘린더 이름 배열 (string[], 기본: [])

### 7. Conversation Tab (`conversation-tab`)
- `conversationModel`: SummarView 대화/후속 프롬프트에 사용할 기본 모델 (string, 기본: "")
- `cleanupRetentionMinutes`: conversations 디렉토리에 보관할 기간(분) (number, 기본: `60 * 24 * 7`, 7일)

### 8. Stats Tab (`stats-tab`)
*이 탭은 설정 필드가 없고 통계 정보만 표시함*

---

## 탭에서 관리하지 않는 설정 필드

### 내부 시스템 설정
- `debugLevel`: 디버그 레벨 0-3 (number, 기본: 0)
- `testUrl`: 테스트용 URL (string, 기본: "")
- `autoUpdateInterval`: 자동 업데이트 주기(밀리초) (number, 기본: 86400000)
- `settingHelper`: 설정 도우미 상태 플래그 (string, 기본: "")

### 구버전 호환성 설정 (1.0.0 이전, deprecated)
- `systemPrompt`: 시스템 프롬프트 (string, deprecated, 기본: "")
- `recordingResultNewNote`: 녹취 결과 새 노트 저장 (boolean, deprecated, 기본: true)
- `transcriptSTT`: STT 모델 (string, deprecated → sttModel, 기본: "")
- `transcribingPrompt`: 음성 인식 프롬프트 (string, deprecated → sttPrompt, 기본: "")
- `transcriptModel`: 녹취 모델 (string, deprecated → transcriptSummaryModel, 기본: "")
- `recordingPrompt`: 녹취 프롬프트 (string, deprecated → transcriptSummaryPrompt, 기본: "")
- `refiningPrompt`: 정제 프롬프트 (string, deprecated → refineSummaryPrompt, 기본: "")

**마이그레이션 시 자동 정리되는 추가 deprecated 필드들:**
- `userPrompt`: 사용자 프롬프트 (string, deprecated)
- `confluenceBaseUrl`: Confluence 베이스 URL (string, deprecated)
- `autoRecording`: 자동 녹음 (boolean, deprecated)
- `resultNewNote`: 결과 새 노트 (boolean, deprecated)
- `transcriptEndpoint`: 녹취 엔드포인트 (string, deprecated)
- `calendar_zoom_only`: Zoom 전용 캘린더 (boolean, deprecated)

---

## 런타임 데이터 (메모리에서만 관리)

플러그인 실행 중에만 존재하는 동적 데이터 - data.json에 저장되지 않음

### 플러그인 내부 상태
- `deviceId`: 현재 디바이스 식별자 (고유값)
- `version`: 데이터 구조 버전
- `userAgent`: API 호출 시 사용하는 User-Agent 
- `sessionId`: 현재 세션 식별자

### 캐시 및 로딩된 데이터
- `modelsJson`: models.json에서 로딩된 모델 정보
- `modelPricing`: model-pricing.json에서 로딩된 가격 정보
- `defaultPrompts`: prompts.json에서 로딩된 기본 프롬프트
- `calendarEventsCache`: 캘린더 이벤트 캐시 데이터
- `confluenceCache`: Confluence 관련 캐시 데이터

### 통계 및 로그 정보
- `lastStatsUpdate`: 마지막 통계 갱신 시각 (timestamp)
- `lastPromptUpdate`: 마지막 프롬프트 갱신 시각 (timestamp)
- `lastModelUpdate`: 마지막 모델 목록 갱신 시각 (timestamp)
- `apiLogCount`: API 호출 총 개수
- `apiLogErrorCount`: API 실패 개수
- `apiLogSuccessCount`: API 성공 개수
- `apiLogLastError`: 마지막 API 에러 메시지
- `apiLogLastSuccess`: 마지막 API 성공 메시지
- `apiLogLastTimestamp`: 마지막 API 호출 시각 (timestamp)

---

## 파일 위치 및 관리

### JSON 파일 위치
- `manifest.json`: `/src/manifest.json` (빌드 시 플러그인 루트로 복사)
- `models.json`: `/src/models.json` (빌드 시 플러그인 루트로 복사)
- `prompts.json`: `/src/prompts.json` (빌드 시 플러그인 루트로 복사)
- `model-pricing.json`: `/src/model-pricing.json` (빌드 시 플러그인 루트로 복사)
- `data.json`: `/.obsidian/plugins/summar/data.json` (사용자 설정 저장)

### 로딩 순서
1. `models.json` → 2. `prompts.json` → 3. `model-pricing.json` → 4. `data.json`
- 의존성 순서에 따라 순차적 로딩
- 에러 발생 시 기본값으로 fallback

### 설정 마이그레이션
- 설정 스키마 버전 `settingsSchemaVersion`으로 관리
- 1.0.0 이전 버전에서 업그레이드 시 자동 변환
- 구버전 키는 새 키로 매핑 후 제거
- **V2 시스템 도입 시**: 자동으로 `data-v2.json`으로 마이그레이션되며, 기존 파일은 `data-v1.json`으로 백업

---

**참고사항:**
- 모든 JSON 파일은 플러그인 로딩 시 동적으로 읽어와 사용됩니다
- `data.json`만 사용자 설정을 저장하며, 나머지는 읽기 전용입니다
- 설정 변경 시 `data.json`에만 저장되고, 다른 JSON 파일은 플러그인 업데이트 시에만 변경됩니다

---

## data-v2.json (V2 설정 파일)

새로운 통합 설정 구조 - `PluginSettingsV2` 클래스로 관리되는 차세대 설정 시스템

### 스키마 정보
- `schemaVersion`: 설정 스키마 버전 (string, 현재: "2.0.1")

### 섹션별 설정 구조

#### 1. Common 섹션 (`common`)
**핵심 API 설정**
- `openaiApiKey`: OpenAI API 키 (string, 기본: "")
- `openaiApiEndpoint`: OpenAI API 엔드포인트 (string, 기본: "")
- `googleApiKey`: Google Gemini API 키 (string, 기본: "")

**Confluence 연동 설정**
- `useConfluenceAPI`: Confluence API 사용 여부 (boolean, 기본: true)
- `confluenceApiToken`: Confluence API 토큰 (string, 기본: "")
- `confluenceDomain`: Confluence 도메인 (string, 기본: "")
- `confluenceParentPageUrl`: 부모 페이지 URL (string, 기본: "")
- `confluenceParentPageSpaceKey`: Space 키 (string, 기본: "")
- `confluenceParentPageId`: 부모 페이지 ID (string, 기본: "")

**Slack 연동 설정** *macOS 데스크탑 전용*
- `useSlackAPI`: Slack API 사용 여부 (boolean, 기본: false)
- `slackBotToken`: Slack Bot 토큰 (string, 기본: "")
- `slackChannelId`: 채널명 또는 사용자명 (#channel 또는 @username 형식, string, 기본: "")
- `slackWorkspaceDomain`: Slack 워크스페이스 도메인 (도메인만, 예: "your-team.slack.com", string, 기본: "")
- `slackApiDomain`: 커스텀 Slack API 도메인 (엔터프라이즈용, 도메인만, string, 기본: "")

**Slack 연동 설정**
- `useSlackAPI`: Slack API 사용 여부 (boolean, 기본: false)
- `slackBotToken`: Slack Bot 토큰 (string, 기본: "")
- `slackChannelId`: Slack 채널 ID 또는 사용자명 (string, 기본: "")
- `slackWorkspaceDomain`: Slack 워크스페이스 도메인 (string, 기본: "")
- `slackApiDomain`: 커스텀 Slack API 도메인 (string, 기본: "")

#### 2. Web 섹션 (`web`)
**웹페이지 요약 설정**
- `webModel`: 웹페이지 요약 모델 (string, 기본: "" → `models.json`의 `webModel.default`에서 자동 설정)
- `webPrompt`: 웹페이지 요약 프롬프트 (string, 기본: "" → `prompts.json`의 `ko.webPrompt`에서 자동 설정)

#### 3. PDF 섹션 (`pdf`)
**PDF 요약 설정** *macOS 데스크탑 전용*
- `pdfModel`: PDF 요약 모델 (string, 기본: "" → `models.json`의 `pdfModel.default`에서 자동 설정)
- `pdfPrompt`: PDF 요약 프롬프트 (string, 기본: "" → `prompts.json`의 `ko.pdfPrompt`에서 자동 설정)

#### 4. Recording 섹션 (`recording`)
**녹음 기본 설정**
- `autoRecordOnVideoMeeting`: Video 미팅 자동 녹음 여부 (boolean, 기본: false)
- `customVocabulary`: STT에 사용할 사용자 정의 용어 목록 (string, 기본: "")
- `selectedDeviceId`: 디바이스별 오디오 장치 매핑 (object, 기본: {})
  - 키: 디바이스 식별자 (string)
  - 값: 선택된 오디오 장치명 (string)
- `recordingDir`: 녹음 파일 저장 디렉토리 (string, 기본: ""), 폴더 자동완성 제안 지원
- `organizeByDate`: 녹음 파일을 날짜별 폴더 구조로 정리 (boolean, 기본: false)
  - 활성화 시 `YYYY/YYYY-MM/YYYY-MM-DD (Day)` 형식의 계층 폴더 구조 생성
- `saveTranscriptAndRefineToNewNote`: 녹취 결과를 새 노트로 저장 여부 (boolean, 기본: true)
- `addLinkToDailyNotes`: Daily Notes에 회의록 링크 추가 여부 (boolean, 기본: true)
- `recordingUnit`: 녹음 단위 초 (number, 기본: 15)
- `recordingLanguage`: 녹취 언어 코드 (string, 기본: "ko-KR")

**음성 인식 및 요약 설정**
- `sttModel`: 음성 인식 모델 (string, 기본: "" → `models.json`의 `sttModel.default`에서 자동 설정)
- `sttPrompt`: 모델별 음성 인식 프롬프트 (object, 기본: {}). gemini- 접두사 모델은 모두 프롬프트 입력 가능
  - `"gpt-4o-transcribe"`: gpt-4o-transcribe 모델용 프롬프트 (string, V1에서 마이그레이션된 값)
  - `"gpt-4o-mini-transcribe"`: gpt-4o-mini-transcribe 모델용 프롬프트 (string, 기본: "")
  - `"gemini-2.0-flash"`: gemini-2.0-flash 모델용 프롬프트 (string, 기본: "" → `prompts.json`에서 자동 설정)
  - `"gemini-2.5-flash"`: gemini-2.5-flash 모델용 프롬프트 (string, 기본: "" → `prompts.json`에서 자동 설정)
  - `"gemini-3-flash-preview"`: gemini-3-flash-preview 모델용 프롬프트 (string, 기본: "" → `prompts.json`에서 자동 설정)
- `transcriptSummaryModel`: 녹취 요약 모델 (string, 기본: "" → `models.json`의 `transcriptSummaryModel.default`에서 자동 설정)
- `transcriptSummaryPrompt`: 녹취 요약 프롬프트 (string, 기본: "" → `prompts.json`의 `ko.transcriptSummaryPrompt`에서 자동 설정)
- `refineSummary`: 요약 정제 사용 여부 (boolean, 기본: true)
- `refineSummaryPrompt`: 요약 정제 프롬프트 (string, 기본: "" → `prompts.json`의 `ko.refineSummaryPrompt`에서 자동 설정)

#### 5. Custom 섹션 (`custom`)
**커스텀 명령어 설정**
- `max`: 커스텀 명령어 최대 개수 (number, 기본: 10)
- `command`: 커스텀 명령어 배열 (CustomCommand[], 기본: [])
  - 각 명령어 객체 구조:
    - `text`: 명령어 표시명 (string)
    - `prompt`: 명령어 프롬프트 (string)
    - `model`: 사용할 AI 모델 (string)
    - `hotkey`: 단축키 (string)
    - `appendToNote`: 결과를 노트에 추가 여부 (boolean)
    - `copyToClipboard`: 결과를 클립보드에 복사 여부 (boolean)

#### 6. Schedule 섹션 (`schedule`)
**캘린더 연동 설정** *macOS 데스크탑 전용*
- `calendar_fetchdays`: 캘린더 이벤트 조회 기간 일 (number, 기본: 1)
- `calendar_polling_interval`: 캘린더 자동 갱신 주기 ms (number, 기본: 600000)
- `googleDriveFilePath`: Google Drive 캘린더 이벤트 저장 경로 (string, 기본: "Summar/calendar/events.json")
- `googleDriveSyncInterval`: Google Drive 동기화 간격 초 단위 (number, 기본: 900)
- `autoLaunchVideoMeetingOnSchedule`: 일정 기반 화상회의 자동 실행 여부 (boolean, 기본: false)
- `autoLaunchVideoMeetingOnlyAccepted`: 수락한 일정만 화상회의 자동 실행 여부 (boolean, 기본: true)
- `calendarName`: 연동된 캘린더 이름 배열 (string[], 기본: [], 최대: 5개)

#### 7. Conversation 섹션 (`conversation`)
**대화 및 보관 설정**
- `conversationModel`: SummarView의 후속 질문/대화에 사용할 기본 모델 (string, 기본: "")
- `cleanupRetentionMinutes`: conversations 디렉토리 보관 기간(분) (number, 기본: 10080)

#### 8. System 섹션 (`system`)
**시스템 설정**
- `debugLevel`: 디버그 레벨 0-3 (number, 기본: 0)
- `testUrl`: 테스트용 URL (string, 기본: "")
- `autoUpdateInterval`: 자동 업데이트 주기 (number, 기본: 86400000)
- `settingHelper`: Setting Helper 내 상태 저장 (string, 기본: "")

### V1→V2 마이그레이션

#### 자동 변환 규칙
**동적 키를 배열로 변환:**
- `cmd_text_N`, `cmd_prompt_N` 등 → `custom.command` 배열
- `calendar_N` → `schedule.calendarName` 배열
- `selectedDeviceId_*` → `recording.selectedDeviceId` 객체

**단일 값을 객체로 변환:**
- `sttPrompt` → `recording.sttPrompt` 객체
  - V1의 `sttPrompt` 값은 `recording.sttPrompt["gpt-4o-transcribe"]`로 마이그레이션
  - `recording.sttPrompt["gpt-4o-mini-transcribe"]`는 빈 문자열로 초기화
  - `recording.sttPrompt["gemini-2.0-flash"]`는 `prompts.json`의 기본값으로 설정
  - `recording.sttPrompt["gemini-2.5-flash"]`는 `prompts.json`의 기본값으로 설정

**섹션별 재구성:**
- 기존 flat 구조를 7개 섹션으로 분류
- 모든 설정값의 타입 검증 및 기본값 적용
- 더 이상 사용하지 않는 설정 필드 자동 제거

### 자동 초기화 및 보완 시스템

**V2 설정 로드 시 자동 보완:**
- `defaultPrompts.sttPrompt`에 존재하는 모든 모델에 대해 누락된 프롬프트 자동 추가
- 기존 설정값이 비어있거나 존재하지 않는 경우에만 기본값 적용
- 변경사항이 발생한 경우 자동으로 `data-v2.json`에 저장
- 로그를 통해 추가된 프롬프트 정보 확인 가능

#### 호환성 보장
- V1 `data.json` 존재 시 자동 마이그레이션 실행
- 마이그레이션 완료 후 기존 `data.json`을 `data-v1.json`으로 백업
- 새로운 V2 설정은 `data-v2.json`에 저장
- 마이그레이션 실패 시 `data-v1.json`에서 복구 가능

### 파일 위치 및 관리

#### V2 설정 파일 위치
- `data-v2.json`: `/.obsidian/plugins/summar/data-v2.json` (V2 사용자 설정 저장)
- `data-v1.json`: `/.obsidian/plugins/summar/data-v1.json` (V1 설정 백업 파일, 마이그레이션 시 생성)

#### 마이그레이션 프로세스
1. **플러그인 시작 시 파일 확인**
   - `data-v2.json` 존재 시: V2 설정 직접 로드
   - `data-v2.json` 없고 `data.json` 존재 시: 마이그레이션 프로세스 시작

2. **마이그레이션 단계**
   - V1 `data.json` 파일 읽기 및 파싱
   - V2 구조로 데이터 변환 (`PluginSettingsV2.migrateFromV1()` 실행)
   - 변환된 데이터를 `data-v2.json`에 저장
   - 성공 시 기존 `data.json`을 `data-v1.json`으로 이름 변경 (백업)

3. **오류 처리**
   - 마이그레이션 실패 시 `data.json` 유지
   - V2 로딩 실패 시 `data-v1.json`에서 V1 설정 복구 가능
   - 모든 파일 손상 시 기본값으로 초기화

#### 로딩 및 저장
- `PluginSettingsV2` 클래스로 통합 관리
- 메모리 상에서 실시간 동기화
- 설정 변경 시 즉시 `data-v2.json`에 저장
- 순환 참조 방지를 위한 안전한 JSON 직렬화

#### 검증 및 무결성
- 스키마 버전 확인
- 배열 타입 및 범위 검증
- 설정 동기화 상태 확인
- 로딩 실패 시 기본값으로 fallback

**V2 시스템 장점:**
- 섹션별 구조화된 설정 관리
- 배열 기반의 직관적인 데이터 구조
- 타입 안전성 보장
- 자동 마이그레이션으로 원활한 업그레이드
- 통합된 설정 클래스로 일관된 데이터 접근
- Slack Canvas/메시지 이중 모드 지원
- 엔터프라이즈 도메인 구성 지원
- 동적 UI 제어 및 스마트 설정 상태 관리

---

## 새로운 기능 및 통합 (2025년 7월 이후 추가)

### Slack API 통합
**주요 기능:**
- **Slack Canvas 생성**: 노트 내용을 Slack Canvas로 변환하여 팀과 공유
- **Slack 메시지 전송**: 채널 또는 DM으로 노트 내용을 메시지로 전송
- **이중 모드 지원**: Canvas 모드와 메시지 모드 선택 가능
- **빈 토큰 지원**: Bot 토큰 없이도 API 호출 가능 (제한적 기능)
- **엔터프라이즈 지원**: 커스텀 Slack API 도메인 설정 지원

**마크다운 변환:**
- Obsidian 마크다운을 Slack 호환 형식으로 자동 변환
- 볼드, 이탤릭, 불릿 포인트, 코드 블록 등 완벽 지원
- Canvas용 마크다운과 메시지용 mrkdwn 형식 별도 처리

**동적 UI 제어:**
- `useSlackAPI` 토글에 따른 하위 설정 자동 활성화/비활성화
- 채널 타입 자동 감지 (public/private 채널, DM 등)
- 동적 툴팁으로 채널 정보 표시

### 최신 AI 모델 지원
**새로 추가된 OpenAI 모델:**
- `gpt-5.2` 시리즈: `gpt-5.2`, `gpt-5.2-pro`, `gpt-5.2-chat-latest`, `gpt-5.2-codex`
- `gpt-5.1` 시리즈: `gpt-5.1`, `gpt-5.1-chat-latest`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`
- `gpt-5` 시리즈: `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-chat-latest`
- `o3`/`o4` 시리즈: `o3`, `o3-pro`, `o3-mini`, `o4-mini`
- 특수 모델: `o1-pro`, `codex-mini-latest`, `computer-use-preview`

**새로 추가된 Gemini 모델:**
- `gemini-3-pro-preview`: 계층형 가격 (under200k/over200k)
- `gemini-3-flash-preview`: 오디오 처리 지원
- `gemini-2.5-flash-lite`: 경량 모델

**업데이트된 가격 정보:**
- 모든 신규 모델의 토큰당 정확한 가격 반영
- 음성 모델 분당 가격 업데이트
- Gemini 모델 오디오 처리 가격 (`audioPerK`) 추가
- 계층형 가격 모델 동적 감지 지원 (JSON 구조의 `under200k`/`over200k` 키 존재 여부로 판단)

### 대화 아카이빙 및 SummarView 개선 (2025-09)
- `conversation` 섹션 신설로 SummarView 대화 모델과 보관 기간을 JSON에서 직접 관리합니다.
- `conversations/` 디렉토리에 저장된 대화 파일은 `cleanupRetentionMinutes` 값에 따라 자동 정리됩니다.
- SummarOutputManager가 원본 파일명을 추적하여 재불러오기 시 기존 키/노트 링크를 복원합니다.
- Reply 버튼, sticky header, 접기/펼치기 로직이 대화 아이템과 동기화되도록 UI 스키마가 확장되었습니다.

### 녹음 및 STT 품질 향상 (2025-09)
- Recording 섹션에 `customVocabulary` 필드를 추가하여 콤마 구분 도메인 용어를 음성 인식에 반영합니다.
- `recording.selectedDeviceId`가 맵 구조로 바뀌어 환경별 기본 입력 장치를 저장합니다.
- `recording.sttPrompt`는 모델별 프롬프트를 보관하는 객체로 확장되어 Whisper·Gemini·Google(Beta) 모델별 문구를 재정의할 수 있습니다.

### UI/UX 개선사항
**설정 탭 개선:**
- 시각적 구분을 위한 HR 요소 추가
- 도메인 입력 시 https:// 자동 처리
- 동적 버튼 상태 관리 및 즉각적인 피드백
- 스크롤 가능한 탭 네비게이션

**향상된 툴팁 시스템:**
- 채널 타입별 다른 아이콘 표시
- 동적 채널 정보 로딩
- 지연 시간 조절 가능한 툴팁

**CSS 스코핑:**
- Obsidian UI와의 충돌 방지를 위한 CSS 클래스 스코핑
- 플러그인 전용 스타일 네임스페이스 적용
