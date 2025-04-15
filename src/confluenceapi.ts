import { SummarDebug, fetchLikeRequestUrl } from "./globals";
import SummarPlugin from "./main";

interface ConfluencePage {
  id: string;
  title: string;
}

interface ConfluenceResponse {
  results: ConfluencePage[];
}

interface ConfluencePageContentResponse {
  title: string;
  body: {
    storage: {
      value: string;
    };
  };
}

export class ConfluenceAPI {
  private plugin: SummarPlugin;

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
  }

  async getPageId(
    url: string
  ): Promise<{ pageId?: string; spaceKey?: string; title?: string }> {
    let pageId: string | undefined;
    let spaceKey: string | undefined;
    let title: string | undefined;

    SummarDebug.log(1, `Entered getPageId`);

    const { confluenceApiToken, confluenceDomain } = this.plugin.settings;

    if (!confluenceApiToken || !confluenceDomain) {
      SummarDebug.Notice(0, "Please configure confluence API keys in the plugin settings.", 0);
      return { pageId, spaceKey, title };
    } else {
      SummarDebug.log(1, `confluenceApiToken: ${confluenceApiToken}`);
      SummarDebug.log(1, `confluenceDomain: ${confluenceDomain}`);
    }

    // URL을 소문자로 변환
    const lowerCaseUrl = url.toLowerCase();

    if (lowerCaseUrl.includes("pageid=")) {
      // URL에서 pageId 추출
      pageId = url.split(/pageId=/i)[1].split("&")[0];
    } else {
      // URL에서 spaceKey와 title 추출
      if (lowerCaseUrl.includes("spacekey=") && lowerCaseUrl.includes("title=")) {
        spaceKey = url.split(/spaceKey=/i)[1].split("&")[0];
        title = decodeURIComponent(url.split(/title=/i)[1].split("&")[0]).replace(/\+/g, " ");
      } else {
        const pathSegments = url.split("/");
        if (pathSegments.length >= 6) {
          SummarDebug.log(1, "pathSegments: " + pathSegments);
          spaceKey = pathSegments[4];
          title = decodeURIComponent(pathSegments[5]).replace(/\+/g, " ");
        }
      }

      // 페이지 ID 검색
      if (spaceKey && title) {
        title = title.includes("#") ? title.split("#")[0] : title;
        SummarDebug.log(1, "spaceKey: " + spaceKey);
        SummarDebug.log(1, "title: " + title);
        try {
          SummarDebug.log(1, "Searching for page");
          pageId = await this.getPageIdFromTitle(spaceKey, title);
          SummarDebug.log(1, `Found page ID: ${pageId}`);
        } catch (error) {
          SummarDebug.error(1, "Error while fetching page ID:", error);
        }
      }
      else {
        SummarDebug.error(1, "Invalid URL format. Cannot extract spaceKey or title.");
        return { pageId, spaceKey, title };
      }
    }

    return { pageId, spaceKey, title };
  }

  async getPageContent(pageId: any): Promise<{ title: string; content: string }> {
    const { confluenceApiToken, confluenceDomain } = this.plugin.settings;

    const headers = {
      Authorization: `Bearer ${confluenceApiToken}`,
      "Content-Type": "application/json",
    };

    // Confluence REST API endpoint
    const apiUrl = `https://${confluenceDomain}/rest/api/content/${pageId}?expand=body.storage`;

    SummarDebug.log(1, "Fetching Confluence page content...");

    try {
      const response = await fetchLikeRequestUrl(apiUrl, { headers });

      if (response.ok) {
        const data = await (response.json()) as ConfluencePageContentResponse;
        const content = data.body.storage.value;
        const title = data.title; // 타이틀 가져오기
        SummarDebug.log(1, "Fetch complete!");

        return { title, content }; // 타이틀과 콘텐츠 반환
      } else {
        SummarDebug.error(1, `Error: ${response.status} - ${response.statusText}`);
        throw new Error(`Failed to fetch Confluence page, status code: ${response.status}`);
      }
    } catch (error) {
      SummarDebug.error(1, "Error while fetching Confluence page content:", error);
      throw error;
    }
  }

  private async getPageIdFromTitle(
    spaceKey: string,
    title: string
  ): Promise<string> {
    const { confluenceApiToken, confluenceDomain } = this.plugin.settings;
    const headers = {
      Authorization: `Bearer ${confluenceApiToken}`,
      "Content-Type": "application/json",
    };

    // Confluence REST API URL 생성
    const searchUrl = `https://${confluenceDomain}/rest/api/content?title=${encodeURIComponent(
      title
    )}&spaceKey=${encodeURIComponent(spaceKey)}&expand=body.storage`;

    SummarDebug.log(1, "searchUrl: " + searchUrl);

    try {
      const response = await fetchLikeRequestUrl(searchUrl, { headers });

      if (response.ok) {
        // 명시적으로 JSON 데이터를 ConfluenceResponse 타입으로 파싱
        const data = (await response.json()) as ConfluenceResponse;

        if (data.results && data.results.length > 0) {
          return data.results[0].id;
        } else {
          SummarDebug.error(1, "No results found for the given title and spaceKey.");
          throw new Error("Page not found.");
        }
      } else {
        SummarDebug.error(1,
          `Error: ${response.status} - ${response.statusText}`
        );
        throw new Error(`Failed to fetch Confluence page ID, status code: ${response.status}`);
      }
    } catch (error) {
      SummarDebug.error(1, "Error while fetching page ID:", error);
      throw error;
    }
  }

  async createPage(title: string, content: string): Promise<void> {
    const { confluenceApiToken, confluenceDomain, confluenceSpaceKey, confluenceParentPageId } = this.plugin.settings;
    // const headers = {
    //   Authorization: `Bearer ${confluenceApiToken}`,
    //   "Content-Type": "application/json",
    // };
/*
curl -X POST "https://wiki.workers-hub.com/rest/api/content" \
  -H "Authorization: Bearer <PAT>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "page",
    "title": "Test Page from curl",
    "space": { "key": "~mcgabby" },
    "body": {
      "storage": {
        "value": "<p>This is a <strong>test page</strong> created via curl.</p>",
        "representation": "storage"
      }
    }
  }'\
  --write-out "\n\n[HTTP Response Code]: %{http_code}\n" \
  --silent \
  --show-error

*/
    
    SummarDebug.log(1, `createPage - 1`);
    const apiUrl = `https://${confluenceDomain}/rest/api/content`;
    SummarDebug.log(1, `createPage - 2`);
    const requestBody = {
      type: "page",
      title: title,
      space: {
        key: confluenceSpaceKey,
      },
      // parent: { 
      //   id: this.plugin.settings.confluenceParentPageId,
      // },
      body: {
        storage: {
          // value: content,
          value: "test",
          representation: "storage",
        },
      },
    };
    SummarDebug.log(1, `API URL: ${apiUrl}`);
    SummarDebug.log(1, `confluenceSpaceKey: ${confluenceSpaceKey}`);
    SummarDebug.log(1, `confluenceParentPageId: ${confluenceParentPageId}`);
    SummarDebug.log(1, `Request Headers: ${confluenceApiToken}`); // 토큰 직접 로깅은 피하세요
    SummarDebug.log(1, `Request Body: ${JSON.stringify(requestBody)}`);
    SummarDebug.log(1, `createPage - 3`);
    // if (confluenceParentPageId && confluenceParentPageId.length > 0) {
    //   SummarDebug.log(1, `createPage - 3.1`);
      
    //   Object.assign(requestBody, {
    //     ancestors: {
    //       id: confluenceParentPageId,
    //     },
    //   });
    // }
    SummarDebug.log(1, `createPage - 4`);
    try {
      const response = await fetchLikeRequestUrl(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${confluenceApiToken}`,
        },
        body: JSON.stringify(requestBody),
      });
      SummarDebug.log(1, `createPage - 5`);
      if (response.ok) {
        SummarDebug.Notice(0, "Confluence page created successfully.",0);
      } else {
        SummarDebug.Notice(0, `Failed to create Confluence page: ${response.statusText}`,0);
        throw new Error(`Failed to create Confluence page, status code: ${response.status}`);
      }
    } catch (error) { 
      SummarDebug.log(1, `createPage - 6`);
      SummarDebug.Notice(0, `Error while creating Confluence page: ${error}`,0);
      throw error;
    }
  }
}