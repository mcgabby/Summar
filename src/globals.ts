import { Notice } from "obsidian";
//import fetch from "node-fetch";
import { Http } from "@capacitor/http";

import { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  openaiApiKey: "",
  confluenceApiToken: "",
  useConfluenceAPI: true,
  confluenceBaseUrl: "https://wiki.workers-hub.com",
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
    // const response = await capacitorFetch("https://api.openai.com/v1/chat/completions", {
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



interface FetchParams {
  method?: string; // HTTP 메서드 (GET, POST 등)
  headers?: Record<string, string>; // 요청 헤더
  body?: string; // 요청 본문 (JSON 등)
}

export async function capacitorFetch(
  url: string,
  { method = "GET", headers = {}, body }: FetchParams = {}
): Promise<Response> {
  let currentUrl = url;
  const maxRedirects = 5; // 최대 리다이렉트 제한
  let redirectCount = 0;

  SummarDebug.log(1, `fetching $JSON.stringify(headers)`);

  while (redirectCount < maxRedirects) {
    const response = await Http.request({
      method,
      url: currentUrl,
      headers,
      data: method === "POST" || method === "PUT" ? body : undefined, // POST/PUT인 경우 Body 포함
    });

    // 정상 응답
    if (response.status >= 200 && response.status < 300) {
      return new Response(JSON.stringify(response.data), {
        status: response.status,
        headers: new Headers(response.headers),
      });
    }

    // 리다이렉트 처리
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) {
        throw new Error(`Redirect location missing at ${response.status}`);
      }

      currentUrl = location; // 새로운 URL 설정
      redirectCount++;

      // 301/302 리다이렉트는 GET으로 변경
      if (response.status === 301 || response.status === 302) {
        method = "GET";
        body = undefined;
      }

      console.log(`Redirecting to: ${currentUrl} (status: ${response.status})`);
    } else {
      // 30x가 아닌 경우 오류 발생
      throw new Error(`HTTP error: ${response.status} - ${response.data.toString()}`);
    }
  }

  throw new Error(`Too many redirects. Stopped after ${maxRedirects} redirects.`);
}