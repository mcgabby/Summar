import { SummarDebug, SummarRequestUrl } from "./globals";
import SummarPlugin from "./main";
import { RequestUrlResponse, RequestUrlResponsePromise } from "obsidian";

export interface SafeRequestResult {
  ok: boolean;
  status: number;
  statusText?: string;
  body?: string;
  json?: any;
  reason?: string;
  message?: string;
  headers?: Record<string, string>;
  error?: any;
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
      SummarDebug.log(0, "Please configure confluence API keys in the plugin settings.", 0);
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

    // Confluence REST API STT
    const apiUrl = `https://${confluenceDomain}/rest/api/content/${pageId}?expand=body.storage`;

    SummarDebug.log(1, "Fetching Confluence page content...");

    try {
      const response = await SummarRequestUrl(this.plugin, {
        url: apiUrl,
        method: "GET",
        headers: headers,
        throw: false,
      });

      if (response.status === 200) {
        SummarDebug.log(1, "Fetch complete!");

        return { title: response.json.title, content: response.json.body.storage.value }; // 타이틀과 콘텐츠 반환
      } else {
        SummarDebug.error(1, `Error: ${response.status}`);
        return { title: response.json.reason, content: response.json.message };
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
      const response: RequestUrlResponse = await SummarRequestUrl(this.plugin, {
        url: searchUrl,
        method: "GET",
        headers: headers,
        throw: false,
      });

      if (response.status === 200) {
        // 명시적으로 JSON 데이터를 ConfluenceResponse 타입으로 파싱
        const data = response.json;

        if (data.results && data.results.length > 0) {
          return data.results[0].id;
        } else {
          SummarDebug.error(1, "No results found for the given title and spaceKey.");
          throw new Error("Page not found.");
        }
      } else {
        SummarDebug.error(1,
          `Error: ${response.status} - ${response.json.message}`
        );
        throw new Error(`Failed to fetch Confluence page ID, status code: ${response.status}`);
      }
    } catch (error) {
      SummarDebug.error(1, "Error while fetching page ID:", error);
      throw error;
    }
  }

  async getSpaceKey(pageId: string): Promise<string> {
    const { confluenceApiToken, confluenceDomain } = this.plugin.settings;
    const headers = {
      Authorization: `Bearer ${confluenceApiToken}`,
      "Content-Type": "application/json",
      };

    const apiUrl = `https://${confluenceDomain}/rest/api/content/${pageId}`;

    try {
      const response = await SummarRequestUrl(this.plugin, {
        url: apiUrl,
        method: "GET",
        headers: headers,
        throw: false,
      });

      if (response.status === 200) {
        const json = await response.json as {
          space?: { key?: string };
        };
        return json.space?.key ?? "";
      } else {
        throw new Error(`Failed to fetch space key, status code: ${response.status}`);
      }
    } catch (error) {
      SummarDebug.error(1, "Error while fetching space key:", error);
      throw error;
    }
  }

  // 페이지 생성
  async createPage(title: string, content: string): Promise<{ updated: boolean, statusCode: number; message: string, reason?: string }> {
    const { confluenceApiToken, confluenceDomain, confluenceParentPageSpaceKey, confluenceParentPageId } = this.plugin.settings;

    const existingPageId = await this.findExistingPage(title);
    if (existingPageId) {
      // SummarDebug.log(1, `${existingPageId} already exists. Skipping creation.`);
      return await this.updatePage(existingPageId, title, content);
    } else {
      SummarDebug.log(1, `Page not found. Creating new page.`);
    }

    SummarDebug.log(1, `createPage - 1`);
    const apiUrl = `https://${confluenceDomain}/rest/api/content`;
    SummarDebug.log(1, `createPage - 2`);
    const requestBody = {
      type: "page",
      title: title,
      space: {
        key: confluenceParentPageSpaceKey,
      },
      ancestors: [
        { id: confluenceParentPageId }
      ],      
      body: {
        storage: {
          value: content,
          representation: "storage",
        },
      },
    };

    SummarDebug.log(1, `createPage - 4`);
    try {
      const response: RequestUrlResponse = await SummarRequestUrl(this.plugin, {
        url: apiUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${confluenceApiToken}`,
          "user-agent": `Obsidian-Summar/${this.plugin.manifest.version}`,
        },
        body: JSON.stringify(requestBody),
        throw: false,
      });
      SummarDebug.log(1, `createPage - 5`);

      if (response.status === 200) {
        SummarDebug.log(1, `createPage - 5.1`);

        // 생성된 페이지의 URL 생성
        const pageUrl = `https://${confluenceDomain}${response.json._links.webui}`;
        SummarDebug.log(1, `Confluence page created successfully: ${pageUrl}`);
        
        return {
          updated: false,
          statusCode: 200,
          message: pageUrl
        };
      } else {
        SummarDebug.log(1, `createPage - 5.2`);
        SummarDebug.log(1, `statusCode: ${response.json.statusCode}`);
        SummarDebug.log(1, `message: ${response.json.message}`);
        SummarDebug.log(1, `reason: ${response.json.reason}`);

        return { updated: false, statusCode: response.json.statusCode, message: response.json.message, reason: response.json.reason };
      }
    } catch (error: any) { 
      SummarDebug.log(1, `createPage - 6`);

      if (error?.response) {
        SummarDebug.log(1, `createPage - 6.1`);
      } else {
        SummarDebug.log(1, `createPage - 6.2`);
      }
      // SummarDebug.Notice(0, `Error while creating Confluence page: ${error}`,0);
      throw error;
    }
  }

  async findExistingPage(title: string): Promise<string | null> {
    const { confluenceApiToken, confluenceDomain, confluenceParentPageSpaceKey, confluenceParentPageId } = this.plugin.settings;
  
    const searchUrl = `https://${confluenceDomain}/rest/api/content?title=${encodeURIComponent(title)}&spaceKey=${confluenceParentPageSpaceKey}&expand=ancestors`;
  
    const response: RequestUrlResponse = await SummarRequestUrl(this.plugin, {
      url: searchUrl,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${confluenceApiToken}`,
        "Content-Type": "application/json",
        "user-agent": `Obsidian-Summar/${this.plugin.manifest.version}`,
      },
    });
  
    if (response.status !== 200) return null;
    const pages = response.json.results as any[];
  
    for (const page of pages) {
      const ancestors = page.ancestors || [];
      if (ancestors.some((a: any) => a.id === confluenceParentPageId)) {
        return page.id; // 이미 존재하는 페이지 ID 반환
      }
    }
  
    return null;
  }

  async updatePage(pageId: string, title: string, content: string): Promise<{ updated: boolean, statusCode: number; message: string; reason?: string }> {
    const { confluenceApiToken, confluenceDomain } = this.plugin.settings;
  
    // 현재 버전 조회
    const pageInfoRes: RequestUrlResponse = await SummarRequestUrl(this.plugin, {
      url: `https://${confluenceDomain}/rest/api/content/${pageId}?expand=version`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${confluenceApiToken}`,
        "Content-Type": "application/json",
      },
    });
  
    if (pageInfoRes.status !== 200) {
      return {
        updated: false,
        statusCode: pageInfoRes.status,
        message: pageInfoRes.json.message || "Failed to fetch current page version.",
        reason: pageInfoRes.json.reason,
      };
    }
    
    const updateBody = {
      id: pageId,
      type: "page",
      title,
      version: { number: pageInfoRes.json.version.number + 1 },
      body: {
        storage: {
          value: content,
          representation: "storage",
        },
      },
    };

    const updateRes: RequestUrlResponse = await SummarRequestUrl(this.plugin, {
      url: `https://${confluenceDomain}/rest/api/content/${pageId}`,
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${confluenceApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateBody),
    });
  
    if (updateRes.status === 200) {
      return { updated: true, statusCode: 200, message: `https://${confluenceDomain}${updateRes.json._links.webui}` };
    } else {
      return {
        updated: false,
        statusCode: updateRes.status,
        message: updateRes.json.message || "Failed to update page.",
        reason: updateRes.json.reason,
      };
    }
  }

}