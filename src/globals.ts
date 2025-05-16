import { Notice, requestUrl, Hotkey, Modifier, RequestUrlParam, RequestUrlResponsePromise } from "obsidian";
import * as os from 'os';
import { Device } from '@capacitor/device';

import SummarPlugin from "./main";
import { PluginSettings } from "./types";

export const SWIFT_SCRIPT_TEMPLATE = `
import EventKit

let eventStore = EKEventStore()
let now = Date()
let endDate = Calendar.current.date(byAdding: .day, value: %d, to: now)!

// ✅ 특정 캘린더만 조회하도록 설정 (여기에 원하는 캘린더 이름을 추가하세요)
let targetCalendars: Set<String> = [%s]

// macOS 14 이상에서는 requestFullAccessToEventsWithCompletion 사용
func requestCalendarAccess(completion: @escaping (Bool) -> Void) {
    if #available(macOS 14.0, *) {
        eventStore.requestFullAccessToEvents { granted, error in
            completion(granted && error == nil)
        }
    } else {
        eventStore.requestAccess(to: .event) { granted, error in
            completion(granted && error == nil)
        }
    }
}

// 특정 문자열("zoom")이 포함된 일정만 필터링
func containsZoom(text: String?) -> Bool {
    guard let text = text?.lowercased() else { return false }
    return text.contains("zoom") || text.contains("https://zoom.us") || text.contains("zoommtg://")
}

// 시스템 로케일에 맞춘 날짜 포맷 변환
func formatDateToLocalString(date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss ZZZ"
    formatter.locale = Locale.current
    formatter.timeZone = TimeZone.current
    return formatter.string(from: date)
}

// Zoom 링크를 추출하는 함수 (http로 시작하고 zoom.us 도메인이 포함된 URL 찾기)
func extractZoomLink(from text: String?) -> String? {
    guard let text = text else { return nil }

    let pattern = #"https?://\\S*zoom\\.us\\S*"#
    let regex = try? NSRegularExpression(pattern: pattern, options: [])

    if let match = regex?.firstMatch(in: text, options: [], range: NSRange(location: 0, length: text.utf16.count)) {
        if let range = Range(match.range, in: text) {
            return String(text[range])
        }
    }

    return nil
}

// 캘린더 접근 권한 요청 및 데이터 가져오기
requestCalendarAccess { granted in
    guard granted else {
        print("{\\"error\\": \\"캘린더 접근 권한이 필요합니다.\\"}")
        exit(1)
    }

    // ✅ 특정 캘린더 필터링
    let calendars = eventStore.calendars(for: .event).filter { targetCalendars.contains($0.title) }

    let predicate = eventStore.predicateForEvents(withStart: now, end: endDate, calendars: calendars)
    let events = eventStore.events(matching: predicate)

    var filteredEvents: [[String: Any]] = []
    
    for event in events {
        let title = event.title ?? "제목 없음"
        let startDate = event.startDate ?? now
        let endDate = event.endDate ?? now
        let location = event.location ?? ""
        let notes = event.notes ?? ""

        // Zoom 키워드가 포함된 일정만 필터링
        //if containsZoom(text: title) || containsZoom(text: location) || containsZoom(text: notes) {
            let zoomLink = extractZoomLink(from: notes) ?? extractZoomLink(from: location) ?? ""

            let eventData: [String: Any] = [
                "title": title,
                "start": formatDateToLocalString(date: startDate),
                "end": formatDateToLocalString(date: endDate),
                "description": notes,
                "location": location,
                "zoom_link": zoomLink
            ]
            filteredEvents.append(eventData)
        //}
    }

    // JSON 변환 후 출력
    if let jsonData = try? JSONSerialization.data(withJSONObject: filteredEvents, options: .prettyPrinted),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    } else {
        print("{\\"error\\": \\"JSON 변환 오류\\"}")
    }

    exit(0) // 정상적으로 실행 완료 후 종료
}

// 비동기 실행을 위해 약간의 대기 필요
RunLoop.main.run()
`;

export const DEFAULT_SETTINGS: PluginSettings = {
  openaiApiKey: "",
  googleApiKey: "",
  confluenceApiToken: "",

  confluenceParentPageUrl: "",
  confluenceParentPageSpaceKey: "",
  confluenceParentPageId: "",

  useConfluenceAPI: true,
  confluenceDomain: "https://wiki.workers-hub.com",
  systemPrompt: `너는 LY의 CTO Office 직원이야.
Wiki의 컨텐츠를 읽고 한국어로 문서의 내용을 전달해주는 일을 하고 있어.
사람이름은 모두 영문(대문자로 시작)으로 표시하되 존칭어는 생략해줘`,
  webPrompt: `다음의 Wiki컨텐츠를 읽고 의미를 놓치지 않는 수준의 내용의 한국어로 정리해줘.
테이블로 구성된 정보는 표로 인식하고 정보를 해석해야 해.
출력 포맷은 MarkDown입니다.
MarkDown의 Heading과 Bold는 사용하지마.
참석자는 생략해줘. No Update로 기재된 항목은 생략해줘.
한 줄에 텍스트는 최대 200자 이내로 요약되어야 해.
요약은 50줄 이내로 요약해야 해.
요약된 내용은 구조화된 형태로 이해하기 쉽게 재구성해줘.
날짜(년도, 연 포함)가 나오는 부분은 절대 생략하지 말고 포함해야 해.
텍스트에 URL 링크가 있다면 요약에 URL을 포함해줘. 텍스트와 연결되지 않은 URL에 링크가 걸리지는 않는지 검증한 뒤 URL을 포함해줘.
MarkDown에서 title, bold(**) 속성은 쓰지 않고 모두 bullet으로만 표현해줘.
응답할 때 '없습니다', '예정이다', '평가한다', '있다', '한다' 대신 '없음', '예정', '평가', '함', '있음'과 같은 축약된 어미를 사용해 줘.
요약된 정보에 대해서는 읽어보고 의미없는 정보는 생략해줘.`,
  pdfPrompt: `이 대화는 여러 PDF 페이지를 포함합니다. 각 페이지를 인식하여 마크다운 형식으로 변환하세요.
결과에는 페이지 번호가 추가되면 안됩니다. 문장이 여러 페이지가 나눠진 경우 markdown 결과에서는 연결해줘.
문서에 테이블을 포함하는 경우 <table>태그로 잘 표현될 수 있도록 만들어줘.
변환 시 줄바꿈과 들여쓰기를 일관되게 유지하십시오. 추측하지 말고, 가능한 한 정확하게 내용을 인식하고 검토하여 결과를 출력하세요.`,

//////
webModel: 'o1-mini',
// pdfModel: 'gpt-4o',
transcriptEndpoint: "whisper-1",
transcribingPrompt: "",
transcriptModel: 'o3-mini',
// customModel: 'o3-mini',
/////

  selectedDeviceId: "",
  recordingDir: "",
  recordingUnit: 15,
  recordingLanguage: "ko-KR",
  recordingPrompt: `
### 명령
• 아래에 제공된 STT 원문은 여러 사람이 발언한 내용이 섞여 있고, 정리가 되어 있지 않습니다.
• 제공된 단어 리스트를 먼저 참고하여, STT 원문에서 잘못 기입된 단어가 있으면 반드시 수정하세요.
• 회의 내용을 요약하지 말고, 원문 내용을 최대한 빠짐없이, 세부 내용까지 모두 포함하여 정리하세요.
• 중요한 의사결정 사항과 Action Item을 별도로 정리하세요.

### 제약사항
• 결과물은 오직 markdown 문서로만 작성하세요. 코드펜스(\`\`\`)는 사용하지 않습니다.
• markdown 이외의 다른 텍스트(설명, 안내 등)는 출력하지 않습니다.
• 제공된 정보만 사용하여 문서를 작성하세요. 추측이나 가정은 하지 않습니다.
• 결과물은 반드시 한국어로 작성하세요.
• 입력된 정보를 바탕으로 완결된 문서 형식으로 작성하세요.
• 구조의 순서는 정보가 잘 전달될 수 있도록 재배열할 수 있습니다.
• 불필요한 어미나 조사는 제거하고, 간결한 형태로 변환하세요.  
  예시: '고려해야 함' → '고려 필요', '개발할 계획임' → '개발할 계획', '요구하고 있음' → '요구 중'
• 논의 내용은 요약하지 말고, 최대한 원문 그대로, 세부 내용까지 모두 담으세요.
• 입력된 내용 중 누락이 없도록 하세요.
• **markdown에서 bold 표현은 사용하지 않습니다.**
• 단어 리스트에 있는 용어는 반드시 정확하게 표기하세요.

### 단어 리스트
• LY, LY Corp, LINE+
• CTO Scrum, Maintenance
• 구L, 구Y

#### Confluence 문서 제목
• EN: 영어 Confluence 문서 제목
• KO: 한국어 Confluence 문서 제목
• JA: 일본어 Confluence 문서 제목

### 검수
• 회의록을 작성한 후, 입력된 원문과 비교하여 누락된 내용이 없는지 반드시 확인하세요.
• 정보가 부족한 부분이 있다면, 회의록에 내용을 추가하세요.
• 추가 후 다시 검수 절차를 반복하세요.

### 출력 포맷

## 배경
• 내용
...

## Executive Summary
• 내용
...

## 논의 내용
1. 그룹화된 제목
    - 내용
        - 상세내용
        - 상세내용
    - 내용
        - 상세내용
        - 상세내용
2. 그룹화된 제목
    - 내용
        - 상세내용
        - 상세내용
...

## Action Item
• 내용
• 내용

---

**위 지침을 참고하여, STT 원문을 입력하면 회의록을 작성하세요.  
특히, 논의 내용은 요약하지 말고, 원문에 있는 모든 세부 내용을 빠짐없이 포함하세요.**

---
`,
  recordingResultNewNote: true,
  refineSummary: true,
  refiningPrompt: `회의의 내용을 녹음해서 텍스트로 변환 후 회의록을 작성했습니다.
회의록의 내용이 많이 생략된 것 같습니다. 원본 회의록과 비교해서 주어진 회의록의 포맷은 유지하되 이 회의록의 내용을 보강해주세요.
요약보다는 논의 내용을 정확하게 전달할 수 있도록 회의록을 작성해주세요.
작성된 회의록은 markdown 포맷의 일관성을 점검해주세요.`,
  //////
  testUrl: "",        // initial URL of the page to summarize
  debugLevel: 0,  // debug level

  cmd_max: 10,
  cmd_count: 0,
  calendar_count: 0,
  calendar_fetchdays: 1,
  calendar_polling_interval: 600000,
  calendar_zoom_only: false,
  autoRecording: false
};

export class SummarViewContainer {
   plugin: SummarPlugin;

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Updates the value of a result container.
   * @param resultContainer The container object to update.
   * @param message The message to set as the value.
   */
  updateResultText(message: string): void {
      this.plugin.resultContainer.value = message;
  }

  appendResultText(message: string): void {
      this.plugin.resultContainer.value += message;
  }

  enableNewNote(enabled: boolean, newNotePath?: string) {
    if (this.plugin.newNoteButton) {
      this.plugin.newNoteButton.disabled = !enabled;
      this.plugin.newNoteButton.classList.toggle("disabled", !enabled);
    }

    if (this.plugin.newNoteLabel) {
      this.plugin.newNoteLabel.classList.toggle("disabled", !enabled);
    }

    if (enabled) {
      const now = new Date();
      const formattedDate = now.getFullYear().toString().slice(2) +
        String(now.getMonth() + 1).padStart(2, "0") +
        now.getDate().toString().padStart(2, "0") + "-" +
        now.getHours().toString().padStart(2, "0") +
        now.getMinutes().toString().padStart(2, "0");

      this.plugin.newNoteName = newNotePath ? newNotePath : formattedDate;
      if (!this.plugin.newNoteName.includes(".md")) {
        this.plugin.newNoteName += ".md";
      }
    } else {
      this.plugin.newNoteName = "";
    }
  } 
}

export async function fetchOpenai(plugin: SummarPlugin, openaiApiKey: string, bodyContent: string): Promise<any> {
  try {
    SummarDebug.log(1, `openaiApiKey: ${openaiApiKey}`);
    SummarDebug.log(2, `bodyContent: ${bodyContent}`);

    const response = await SummarRequestUrl(plugin, {
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: bodyContent,
    });
    return response;
  } catch (error) {
    SummarDebug.error(1, "Error fetching data from OpenAI API:", error);
    throw error; // Re-throw the error for higher-level handling
  }
}


export class SummarDebug {
  private static debugLevel: number = 0;

  static initialize(debugLevel: number): void {
    this.debugLevel = debugLevel;
  }

  static Notice(debugLevel: number, msg: string | DocumentFragment, duration?: number): void {
    if (this.debugLevel >= debugLevel)
      new Notice(msg, duration);
  }
  static log(debugLevel: number, message?: any, ...optionalParams: any[]): void {
    if (this.debugLevel >= debugLevel)
      console.log(message, ...optionalParams);
  }

  static error(debugLevel: number, message?: any, ...optionalParams: any[]): void {
    if (this.debugLevel >= debugLevel)
      console.error(message, ...optionalParams);
  }
  static level(): number {
    return this.debugLevel;
  }
}

export function SummarRequestUrl(plugin: SummarPlugin, request: RequestUrlParam | string): RequestUrlResponsePromise {
  let requestParam: RequestUrlParam;
  
  if (typeof request === 'string') {
    // request가 문자열이면 객체로 변환
    requestParam = { url: request, headers: {}, method: "GET", body: "", throw: true }; 
  } else {
    // request가 객체이면 그대로 사용
    requestParam = request;
    // 기존 헤더가 없으면 빈 객체로 초기화
    if (!requestParam.headers) {
      requestParam.headers = {};
    }
  }

  // User-Agent 헤더 추가
  requestParam.headers = { ...requestParam.headers, "user-agent": `Obsidian-Summar/${plugin.manifest.version}` };


  
  // curl 디버깅 로그 출력
  let curlDebug = `curl -X ${requestParam.method} "${requestParam.url}" \\`;
  for (const [key, value] of Object.entries(requestParam.headers)) {
    curlDebug += `\n-H "${key}: ${value}" \\`;
  }
  if (requestParam.body) {
    if (typeof requestParam.body === "string") {
      curlDebug += `\n-d '${requestParam.body}' \\`;
    } else if (requestParam.body instanceof ArrayBuffer) {
      const byteArray = new Uint8Array(requestParam.body);
      const base64String = btoa(String.fromCharCode(...byteArray));
      curlDebug += `\n--data-binary '${base64String}' \\`;
    }
  }
  curlDebug += `\n--write-out "\\n\\n[HTTP Response Code]: %{http_code}\\n" \\`;
  curlDebug += `\n--silent \\`;
  curlDebug += `\n--show-error`;
  SummarDebug.log(3, curlDebug);

  return requestUrl(requestParam); // 수정된 객체로 requestUrl 호출
}

export function extractDomain(url: string): string | null {
  // URL에서 도메인을 추출하는 정규식
  const domainPattern = /^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i;
  const match = url.match(domainPattern);
  return match ? match[1] : null;
}

export function containsDomain(text: string, domain: string): boolean {
  // 정규식을 사용해 특정 도메인이 포함되어 있는지 확인
  const domainPattern = new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?${domain.replace('.', '\\.')}`, 'i');
  return domainPattern.test(text);
}

export function parseHotkey(hotkeyString: string): Hotkey | undefined{
  if (!hotkeyString || hotkeyString.length===0) return undefined;
  const parts = hotkeyString.split('+').map(part => part.trim().toLowerCase());
  const key = parts.pop() || '';  // 마지막 부분은 실제 키

  const modifiers: Modifier[] = parts.map(part => {
    switch (part) {
      case 'ctrl': return 'Mod';
      case 'shift': return 'Shift';
      case 'alt': return 'Alt';
      case 'cmd': return 'Meta';
      default: return '' as Modifier;  // 빈 문자열을 Modifier로 캐스팅
    }
  }).filter(Boolean) as Modifier[];  // 타입 필터링

  return { modifiers, key };
}

async function getDeviceName(): Promise<string> {
  // 데스크탑 환경인 경우
  if (os && os.hostname) {
    SummarDebug.log(1, `desktop: ${os.hostname()}`);
    return os.hostname();
  }

  // 모바일(Android, iOS) 환경인 경우
  try {
      const info = await Device.getInfo();
      SummarDebug.log(1, `mobile: ${info.name}`);
      return info.name || "Unknown Device";
  } catch (error) {
      SummarDebug.error(1, 'Failed to get device name:', error);
      return "Unknown Device";
  }
}

function replaceAllSpecialChars(input: string): string {
  // 알파벳, 숫자를 제외한 모든 문자를 '_'로 변환
  const encodedInput = encodeURIComponent(input);
  const allSpecialCharsRegex = /[^a-zA-Z0-9]/g;
  return encodedInput.replace(allSpecialCharsRegex, '_');
}

// 디바이스 ID 로드 또는 생성
export async function getDeviceId(plugin: any): Promise<string> {
  const deviceName = await getDeviceName();

  const deviceId = `selectedDeviceId_${replaceAllSpecialChars(deviceName)}`;
  SummarDebug.log(1, `deviceId: ${deviceId}`);
  return deviceId;
}

// 특수문자 제거 및 안전한 키 생성 함수
export function sanitizeLabel(label: string): string {
  return label.replace(/[ .,+'"']/g, '_').toLowerCase();
}

// 저장된 라벨을 기반으로 deviceId를 반환하는 함수
export async function getDeviceIdFromLabel(savedLabel: string): Promise<string | null> {
  try {
      // 마이크 권한 요청 및 초기화
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      // 초기화 지연 (Android 환경 안정화)
      await new Promise(resolve => setTimeout(resolve, 500));

      // 장치 목록 가져오기
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      // 저장된 라벨을 정규화
      const normalizedSavedLabel = sanitizeLabel(savedLabel);

      // 라벨 비교를 통해 일치하는 deviceId 찾기
      for (const device of audioDevices) {
          const deviceLabel = device.label || "Unknown Device";
          const normalizedDeviceLabel = sanitizeLabel(deviceLabel);

          if (normalizedDeviceLabel === normalizedSavedLabel) {
              return device.deviceId;
          }
      }

      // 일치하는 장치가 없는 경우
      // console.warn("No matching device found for label:", savedLabel);
      SummarDebug.log(1,`No matching device found for label: ${savedLabel}`);
      return null;

  } catch (error) {
      SummarDebug.error(1, "Error while retrieving deviceId from label:", error);
      return null;
  }
}
export async function showSettingsTab(plugin: SummarPlugin, tabname: string) {
  // 설정 창 열기
  (plugin.app as any).commands.executeCommandById("app:open-settings");

  // Shadow DOM까지 모두 탐색하는 재귀 함수
  const deepQuerySelectorAll = (root: ParentNode, selector: string): HTMLElement[] => {
    const elements = Array.from(root.querySelectorAll(selector)) as HTMLElement[];
    const shadowHosts = Array.from(root.querySelectorAll('*')).filter(el => (el as HTMLElement).shadowRoot) as HTMLElement[];

    shadowHosts.forEach(shadowHost => {
      if (shadowHost.shadowRoot) {
        elements.push(...deepQuerySelectorAll(shadowHost.shadowRoot, selector));
      }
    });

    return elements;
  };

  // Summar 설정창이 열릴 때까지 감시하는 함수
  const waitForSummarTab = () => {
    const settingsContainer = document.querySelector('.mod-settings');
    if (settingsContainer) {
      // SummarDebug.log(3, "설정창 감지 완료");

      // 현재 선택된 탭 확인
      const activeTab = settingsContainer.querySelector('.vertical-tab-nav-item.is-active') as HTMLElement;
      if (activeTab) {
        // SummarDebug.log(3, "현재 선택된 탭:", activeTab.innerText);
      }

      // Summar 탭 찾기
      const navLinks = deepQuerySelectorAll(settingsContainer, '.vertical-tab-nav-item');
      let summarTabClicked = false;

      navLinks.forEach((link) => {
        const linkEl = link as HTMLElement;
        // SummarDebug.log(3, "탭 이름:", linkEl.innerText);

        if (linkEl.innerText.includes("Summar")) {
          // SummarDebug.log(3, "Summar 설정창 활성화 시도");

          // Summar 탭 클릭
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          linkEl.dispatchEvent(clickEvent);

          summarTabClicked = true;
        }
      });

      // Summar 설정창이 선택되지 않으면 계속 감시
      if (!summarTabClicked) {
        // SummarDebug.log(3, "Summar 설정창이 즉시 열리지 않음, 다시 감지...");
        requestAnimationFrame(waitForSummarTab);
      } else {
        // SummarDebug.log(3, "Summar 설정창 클릭됨, schedule-tab 감지 시작");
        plugin.summarSettingTab.activateTab(tabname);
      }
    } else {
      // SummarDebug.log(3, "설정창이 아직 로드되지 않음, 다시 확인...");
      requestAnimationFrame(waitForSummarTab);
    }
  };

  // 설정창이 완전히 열릴 때까지 감시 시작
  requestAnimationFrame(waitForSummarTab);
}