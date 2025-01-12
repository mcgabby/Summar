import { PluginSettings } from "./types";
import fetch from "node-fetch";

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
  url: "",
  pdfPrompt: `이 대화는 여러 PDF 페이지를 포함합니다. 각 페이지를 인식하여 마크다운 형식으로 변환하세요.
결과에는 페이지 번호가 추가되면 안됩니다. 문장이 여러 페이지가 나눠진 경우 markdown 결과에서는 연결해줘.
문서에 테이블을 포함하는 경우 <table>태그로 잘 표현될 수 있도록 만들어줘.
변환 시 줄바꿈과 들여쓰기를 일관되게 유지하십시오. 추측하지 말고, 가능한 한 정확하게 내용을 인식하고 검토하여 결과를 출력하세요.`
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
    console.log(`openaiApiKey: ${openaiApiKey}`);
    console.log(`bodyContent: ${bodyContent}`);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: bodyContent,
    });
    return response;
  } catch (error) {
    console.error("Error fetching data from OpenAI API:", error);
    throw error; // Re-throw the error for higher-level handling
  }
}





