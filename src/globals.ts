import { Notice, requestUrl } from "obsidian";

import { PluginSettings } from "./types";

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

  url: "",        // initial URL of the page to summarize
  debugLevel: 0  // debug level
};



export class SummarViewContainer {
  /**
   * Updates the value of a result container.
   * @param resultContainer The container object to update.
   * @param message The message to set as the value.
   */
  static updateText(resultContainer: { value: string }, message: string): void {
    if (resultContainer)
      resultContainer.value = message;
  }

  static appendText(resultContainer: { value: string }, message: string): void {
    if (resultContainer)
      resultContainer.value += message;
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

export async function fetchLikeRequestUrl(input: string, init?: RequestInit): Promise<FetchLikeResponse> {
  let url = input;
  let method = init?.method ?? "GET";
  let headers = init?.headers ?? {};
  let body = init?.body;

  const maxRedirects = 5; // 최대 리다이렉트 횟수
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
      const response = await requestUrl({
          url,
          method,
          headers: headers as Record<string, string>,
          body: typeof body === "string" ? body : undefined,
      });

      SummarDebug.log(1,`response.status: ${response.status}`);

      // Redirect 처리 (30x 상태코드)
      if (response.status >= 300 && response.status < 400 && response.headers["location"]) {
          url = response.headers["location"];
          redirectCount++;
          continue;
      }

      const fetchLikeResponse = new FetchLikeResponse(
        response.status >= 200 && response.status < 300,
        response.status,
        "",
        response.headers,
        response.arrayBuffer,
        response.text
      );
      return fetchLikeResponse;
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
