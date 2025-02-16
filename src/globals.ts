import { Notice, requestUrl, Hotkey, Modifier } from "obsidian";
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
        if containsZoom(text: title) || containsZoom(text: location) || containsZoom(text: notes) {
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
        }
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
  confluenceApiToken: "",
  useConfluenceAPI: true,
  confluenceDomain: "https://wiki.workers-hub.com",
  systemPrompt: `너는 LY의 CTO Office 직원이야.
Wiki의 컨텐츠를 읽고 한국어로 문서의 내용을 전달해주는 일을 하고 있어.
다음 단어는 주의해줘: 出澤(Idezawa), 三枝(Saegusa), 坂上(Sakaue), 妹尾(Senoo), 片野(Katano), 大寺(Odera)
사람이름은 모두 영문(대문자로 시작)으로 표시하되 존칭어는 생략해줘`,
  userPrompt: `다음의 Wiki컨텐츠를 읽고 의미를 놓치지 않는 수준의 내용의 한국어로 정리해줘.
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
  selectedDeviceId: "",
  recordingDir: "",
  recordingUnit: 15,
  recordingLanguage: "ko",
  recordingPrompt: "# 명령\n아래는 회의록에 대하여 STT 로 입력받은 내용이야. 좀 정리가 안되어 있고 여러사람이 말하는 것이 섞여 있어. 본 회의에 대하여 요약해 주고 중요한 의사결정사항이 무엇인지  Action Item 이 무엇인지 정리해줘.\n\n# 제약사항\n* 제일 먼저 다음에 제공될 단어리스트를 읽고 Transcription에서 잘못 기입되었을 것으로 판단되는 텍스트는 보정해 주세요.\n* 제공한 정보만 포함해서 문서를 작성하세요. 추측이나 가정은 피해주세요.\n* 출력되는 결과는 한국어로 작성하고 markdown 이외의 다른 결과는 출력하지 마세요.\n* 입력되는 정보를 기반으로 완결된 문서 형식으로 작성되어야 합니다.\n* 구조의 순서는 입력되는 정보가 잘 전달될 수 있도록 재배열할 수 있습니다.\n* 고려해야 함' -> '고려 필요', 개발할 계획임' -> '개발할 계획', 요구하고 있음' -> '요구 중' 과 같이주어진 문장에서 불필요한 어미나 조사를 제거하고 간결한 형태로 변환하세요.\n* markdown에서 bold 표현은 사용하지 마세요.\n* 입력된 내용 중에 누락이 발생하지 않도록 해주세요.\n* 논의 내용은 요약하지 말고 최대한 원문 그대로를 담아줘.\n\n\n# 단어 리스트\n* LY, LY Corp, CTO Scrum, Maintenance\n* 구L, 구Y\n* 의빈님, 순호님, 진수님, 종범님, 민철님, 유진님, 세현님\n\n# 출력포맷\n```\n## 배경\n- 내용\n...\n\n## Executive Summary\n- 내용\n- 내용\n...\n\n## 논의 내용\n1. 그룹화된 제목\n\t- 내용\n\t\t- 상세내용\n\t\t- 상세내용\n\t- 내용\n\t\t- 상세내용\n\t\t- 상세내용\n2. 그룹화된 제목\n\t- 내용\n\t\t- 상세내용\n\t\t- 상세내용\n\t- 내용\n\t\t- 상세내용\n\t\t- 상세내용\n....\n\n## Action Item\n- 내용1\n- 내용1\n\n## Confluence 문서 제목\n- EN: 영어 Confluence 문서 제목\n- KO: 한국어 Confluence 문서 제목\n- JA: 일본어 Confluence 문서 제목\n```\n\n#  검수\n* 회의록을 작성한 뒤 입력한 원문과 비교해서 누락이 있는지 확인하는 절차를 가지세요.\n* 정보가 부족한 부분이 있다면 회의록에 내용을 더 추가해주세요.\n* 추가한 이후에는 다시 검수하는 절차를 다시 수행해주세요.\n\n# STT로 입력받은 내용은 아래와 같습니다.\n----\n",
//////
  testUrl: "",        // initial URL of the page to summarize
  debugLevel: 0,  // debug level

  cmd_count: 0,
  calendar_count: 0,
  calendar_fetchdays: 1,
  calendar_polling_interval: 600000,
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
}

export async function fetchOpenai(openaiApiKey: string, bodyContent: string): Promise<any> {
  try {
    SummarDebug.log(1, `openaiApiKey: ${openaiApiKey}`);
    SummarDebug.log(2, `bodyContent: ${bodyContent}`);

    const response = await fetchLikeRequestUrl("https://api.openai.com/v1/chat/completions", {
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


export class FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  private _arrayBuffer: ArrayBuffer | null;
  private _text: string | null;

  constructor(
      ok: boolean,
      status: number,
      statusText: string,
      headers: Record<string, string>,
      arrayBuffer: ArrayBuffer | null = null,
      text: string | null = null
  ) {
      this.ok = ok;
      this.status = status;
      this.statusText = statusText;
      this.headers = new Headers(headers);
      this._arrayBuffer = arrayBuffer;
      this._text = text;
  }

  // ArrayBuffer 반환
  async arrayBuffer(): Promise<ArrayBuffer> {
      if (this._arrayBuffer) {
          return this._arrayBuffer;
      }
      throw new Error("Response does not contain an ArrayBuffer");
  }

  // 텍스트 반환
  async text(): Promise<string> {
      if (this._text !== null) {
          return this._text;
      }
      if (this._arrayBuffer) {
          const decoder = new TextDecoder();
          return decoder.decode(this._arrayBuffer);
      }
      throw new Error("Response does not contain text");
  }

  // JSON 반환
  async json<T = unknown>(): Promise<T> {
      const textData = await this.text();
      try {
          return JSON.parse(textData) as T;
      } catch (error) {
          throw new Error("Failed to parse JSON: " + error);
      }
  }
}

export async function fetchLikeRequestUrl(
  input: string,
  init?: RequestInit
): Promise<FetchLikeResponse> {
  let url = input;
  let method = init?.method ?? "GET";
  let headers = init?.headers ?? {};
  let body = init?.body;

  // Content-Type 자동 설정
  if (body instanceof FormData) {
    // FormData의 경우 Content-Type을 자동 처리
    headers = { ...headers, "Content-Type": "multipart/form-data" };
  } else if (typeof body === "string") {
    // String 데이터를 전송할 경우
    headers = { ...headers, "Content-Type": "application/json" };
  } else if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
    // Binary 데이터를 전송할 경우
    headers = { ...headers, "Content-Type": "application/octet-stream" };
  }

  const maxRedirects = 5; // 최대 리다이렉트 횟수
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    const response = await requestUrl({
      url,
      method,
      headers: headers as Record<string, string>,
      body: typeof body === "string" || body instanceof Uint8Array ? body : undefined,
    });

    SummarDebug.log(1, `response.status: ${response.status}`);

    // Redirect 처리 (30x 상태코드)
    if (response.status >= 300 && response.status < 400 && response.headers["location"]) {
      url = response.headers["location"];
      redirectCount++;
      continue;
    }

    return new FetchLikeResponse(
      response.status >= 200 && response.status < 300,
      response.status,
      (response.status==200) ? "" : response.text,
      response.headers,
      response.arrayBuffer,
      response.text
    );
  }

  throw new Error(`Too many redirects: exceeded ${maxRedirects} attempts`);
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

export function parseHotkey(hotkeyString: string): Hotkey {
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