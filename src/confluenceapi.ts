import { Notice } from "obsidian";
import fetch from "node-fetch";

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
  private plugin: any;

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  async getPageId(
    url: string
  ): Promise<{ pageId?: string; spaceKey?: string; title?: string }> {
    let pageId: string | undefined;
    let spaceKey: string | undefined;
    let title: string | undefined;

    const { confluenceApiToken, confluenceBaseUrl } = this.plugin.settings;

    if (!confluenceApiToken || !confluenceBaseUrl) {
      new Notice("Please configure API keys in the plugin settings.");
      return { pageId, spaceKey, title };
    }
    if (url.includes("pageId=")) {
      // URL에서 pageId 추출
      pageId = url.split("pageId=")[1].split("&")[0];
    } else {

      // URL에서 spaceKey와 title 추출
      if (url.includes("spaceKey=") && url.includes("title=")) {
        spaceKey = url.split("spaceKey=")[1].split("&")[0];
        title = decodeURIComponent(url.split("title=")[1].split("&")[0]).replace(/\+/g, " ");
      } else {
        const pathSegments = url.split("/");
        if (pathSegments.length >= 6) {
          console.log("pathSegments: " + pathSegments);
          spaceKey = pathSegments[4];
          title = decodeURIComponent(pathSegments[5]).replace(/\+/g, " ");
        }
      }
      console.log("spaceKey: " + spaceKey);
      console.log("title: " + title);

      // 페이지 ID 검색
      if (spaceKey && title) {
        try {
          console.log("Searching for page");
          pageId = await this.getPageIdFromTitle(spaceKey, title);
          console.log(`Found page ID: ${pageId}`);
        } catch (error) {
          console.error("Error while fetching page ID:", error);
        }
      }
      else {
        console.error("Invalid URL format. Cannot extract spaceKey or title.");
        return { pageId, spaceKey, title };
      }
    }

    return { pageId, spaceKey, title };
  }

  async getPageContent(pageId: any): Promise<{ title: string; content: string }> {
    const { confluenceApiToken, confluenceBaseUrl } = this.plugin.settings;

    const headers = {
      Authorization: `Bearer ${confluenceApiToken}`,
      "Content-Type": "application/json",
    };

    // Confluence REST API endpoint
    const apiUrl = `${confluenceBaseUrl}/rest/api/content/${pageId}?expand=body.storage`;

    console.log("Fetching Confluence page content...");

    try {
      const response = await fetch(apiUrl, { headers });

      if (response.ok) {
        const data = await (response.json()) as ConfluencePageContentResponse;
        const content = data.body.storage.value;
        const title = data.title; // 타이틀 가져오기
        console.log("Fetch complete!");

        return { title, content }; // 타이틀과 콘텐츠 반환
      } else {
        console.error(`Error: ${response.status} - ${response.statusText}`);
        throw new Error(`Failed to fetch Confluence page, status code: ${response.status}`);
      }
    } catch (error) {
      console.error("Error while fetching Confluence page content:", error);
      throw error;
    }
  }

  private async getPageIdFromTitle(
    spaceKey: string,
    title: string
  ): Promise<string> {
    const { confluenceApiToken, confluenceBaseUrl } = this.plugin.settings;
    const headers = {
      Authorization: `Bearer ${confluenceApiToken}`,
      "Content-Type": "application/json",
    };

    // Confluence REST API URL 생성
    const searchUrl = `${confluenceBaseUrl}/rest/api/content?title=${encodeURIComponent(
      title
    )}&spaceKey=${encodeURIComponent(spaceKey)}&expand=body.storage`;

    console.log("searchUrl: " + searchUrl);

    try {
      const response = await fetch(searchUrl, { headers });

      if (response.ok) {
        // 명시적으로 JSON 데이터를 ConfluenceResponse 타입으로 파싱
        const data = (await response.json()) as ConfluenceResponse;

        if (data.results && data.results.length > 0) {
          return data.results[0].id;
        } else {
          console.error("No results found for the given title and spaceKey.");
          throw new Error("Page not found.");
        }
      } else {
        console.error(
          `Error: ${response.status} - ${response.statusText}`
        );
        throw new Error(`Failed to fetch Confluence page ID, status code: ${response.status}`);
      }
    } catch (error) {
      console.error("Error while fetching page ID:", error);
      throw error;
    }
  }

}