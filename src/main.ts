import { App, Plugin, PluginSettingTab, Setting, View, WorkspaceLeaf, Platform, Menu, Modal, normalizePath } from "obsidian";

import { PluginSettings, OpenAIResponse } from "./types";
import { DEFAULT_SETTINGS, SummarViewContainer, SummarDebug, fetchOpenai, fetchLikeRequestUrl, extractDomain, containsDomain } from "./globals";
import { SummarTimer } from "./summartimer";
import { PluginUpdater } from "./pluginupdater";
import { ConfluenceAPI } from "./confluenceapi";
import { JsonBuilder } from "./jsonbuilder";
import { PdfToPng } from "./pdftopng";
import { SummarView } from "./summarview"
import { SummarRecordingPanel } from "./summarrecordingpanel"
import { SummarSettingsTab } from "./summarsettingtab";

export default class SummarPlugin extends Plugin {
  settings: PluginSettings;
  resultContainer: HTMLTextAreaElement;
  inputField: HTMLInputElement;

  OBSIDIAN_PLUGIN_DIR: string = "";
  PLUGIN_ID: string = ""; // 플러그인 아이디
  PLUGIN_DIR: string = ""; // 플러그인 디렉토리
  PLUGIN_MANIFEST: string = ""; // 플러그인 디렉토리의 manifest.json
  PLUGIN_SETTINGS: string = "";  // 플러그인 디렉토리의 data.json

  async onload() {
    this.OBSIDIAN_PLUGIN_DIR = normalizePath("/.obsidian/plugins");
    this.PLUGIN_ID = this.manifest.id;
    this.PLUGIN_DIR = normalizePath(this.OBSIDIAN_PLUGIN_DIR + "/" + this.PLUGIN_ID);
    this.PLUGIN_MANIFEST = normalizePath(this.PLUGIN_DIR + "/manifest.json");
    this.PLUGIN_SETTINGS = normalizePath(this.PLUGIN_DIR + "/data.json");

    this.settings = await this.loadSettingsFromFile();
    SummarDebug.initialize(this.settings.debugLevel);

    SummarDebug.log(1, `OBSIDIAN_PLUGIN_DIR: ${this.OBSIDIAN_PLUGIN_DIR}`);
    SummarDebug.log(1, `PLUGIN_ID: ${this.PLUGIN_ID}`);
    SummarDebug.log(1, `PLUGIN_DIR: ${this.PLUGIN_DIR}`);
    SummarDebug.log(1, `PLUGIN_MANIFEST: ${this.PLUGIN_MANIFEST}`);
    SummarDebug.log(1, `PLUGIN_SETTINGS: ${this.PLUGIN_SETTINGS}`);

    // 로딩 후 1분 뒤에 업데이트 확인
    setTimeout(async () => {
      try {
        SummarDebug.log(1, "Checking for plugin updates...");
        const pluginUpdater = new PluginUpdater(this);
        await pluginUpdater.updatePluginIfNeeded();
      } catch (error) {
        SummarDebug.error(1, "Error during plugin update:", error);
      }
    }, 1000 * 6); // 1분 (60초)    

    SummarDebug.log(1, "Summar Plugin loaded");


    this.addSettingTab(new SummarSettingsTab(this));

    this.addRibbonIcon("scroll-text", "Open Summar View", this.activateView.bind(this));    
    this.registerView(SummarView.VIEW_TYPE, (leaf) => new SummarView(leaf, this));

    this.addRibbonIcon("cassette-tape", "Record panel", this.activatePanel.bind(this));
    this.registerView(SummarRecordingPanel.VIEW_TYPE, (leaf) => new SummarRecordingPanel(leaf, this));


    if (Platform.isDesktopApp) {
      if (Platform.isWin) {
        SummarDebug.log(1, "Running on Windows Desktop");
      } else if (Platform.isMacOS) {
        SummarDebug.log(1, "Running on macOS Desktop");
      } else if (Platform.isLinux) {
        SummarDebug.log(1, "Running on Linux Desktop");
      }
    } else if (Platform.isMobile) {
      if (Platform.isIosApp) {
        SummarDebug.log(1, "Running on iOS");
      } else if (Platform.isAndroidApp) {
        SummarDebug.log(1, "Running on Android");
      }
    } else {
      SummarDebug.log(1, "Unknown platform");
    }

    // URL 컨텍스트 메뉴 등록
    this.registerEvent(
      this.app.workspace.on('url-menu', (menu: Menu, url: string) => {
        menu.addItem((item) => {
          item.setTitle("Summary web page using Summar")
            .setIcon("star")
            .onClick(() => {
              this.activateView();
              this.setLinkForCommand(url);
            });
        });

      })
    );

    // 커맨드 추가
    this.addCommand({
      id: "fetch-and-summarize-link",
      name: "Summary web page using Summar",
      callback: () => {
        this.openUrlInputDialog((url) => {
          if (url) {
            this.activateView();
            this.setLinkForCommand(url);
          } else {
            SummarDebug.Notice(0, "No URL provided.");
          }
        });
      },
    });

    this.addCommand({
      id: "pdf-to-markdown",
      name: "Convert PDF to Markdown",
      callback: () => {
        this.activateView();
        this.convertPdfToMarkdown();
      },
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(SummarView.VIEW_TYPE);
    SummarDebug.log(1, "Summar Plugin unloaded");
  }

  async activatePanel() {
    const existingLeaf = this.app.workspace.getLeavesOfType(SummarRecordingPanel.VIEW_TYPE)[0];

    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
    } else {
      const newLeaf = this.app.workspace.getRightLeaf(true);
      if (newLeaf) {
        await newLeaf.setViewState({
          type: SummarRecordingPanel.VIEW_TYPE,
        });
        this.app.workspace.revealLeaf(newLeaf);
      } else {
        SummarDebug.error(1, "No available left pane to open Summar Recording panel.");
      }
    }
  }

  async activateView() {
    const existingLeaf = this.app.workspace.getLeavesOfType(SummarView.VIEW_TYPE)[0];

    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
    } else {
      const newLeaf = this.app.workspace.getRightLeaf(false);
      if (newLeaf) {
        await newLeaf.setViewState({
          type: SummarView.VIEW_TYPE,
        });
        this.app.workspace.revealLeaf(newLeaf);
      } else {
        SummarDebug.error(1, "No available right pane to open Summar View.");
      }
    }
  }

  async loadSettingsFromFile(): Promise<PluginSettings> {
    if (await this.app.vault.adapter.exists(this.PLUGIN_SETTINGS)) {
      console.log("Settings file exists:", this.PLUGIN_SETTINGS);
    } else {
      console.log("Settings file does not exist:", this.PLUGIN_SETTINGS);
    }
    if (await this.app.vault.adapter.exists(this.PLUGIN_SETTINGS)) {
      console.log("Reading settings from data.json");
      try {
        const rawData = await this.app.vault.adapter.read(this.PLUGIN_SETTINGS);
        // const settings = JSON.parse(rawData);
        // return Object.assign({}, DEFAULT_SETTINGS, settings);
        const settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(rawData)) as PluginSettings;
        const domain = extractDomain(settings.confluenceDomain);
        if (domain) {
          settings.confluenceDomain = domain;
        } else {
          settings.confluenceDomain = "";
        }
        return settings;
      } catch (error) {
        console.log("Error reading settings file:", error);
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  }

  async saveSettingsToFile(settings: PluginSettings): Promise<void> {
    try {
      await this.app.vault.adapter.mkdir(this.PLUGIN_DIR)
      await this.app.vault.adapter.write(this.PLUGIN_SETTINGS,JSON.stringify(settings, null, 2));
      SummarDebug.log(1, "Settings saved to data.json");
    } catch (error) {
      SummarDebug.error(1, "Error saving settings file:", error);
    }
  }

  // 커맨드에서 사용할 링크 설정
  setLinkForCommand(link: string) {
    SummarDebug.Notice(0, `Link set for command: ${link}`);
    SummarViewContainer.updateText(this.inputField, link);
    this.fetchAndSummarize(link);
  }

  openUrlInputDialog(callback: (url: string | null) => void) {
    new UrlInputModal(this.app, callback).open();
  }


  /*
   * fetchAndSummarize 함수는 URL을 가져와서 요약을 생성합니다.
   * @param resultContainer 결과를 표시할 textarea 엘리먼트
   * @param url 가져올 URL
   * @param plugin 플러그인 인스턴스
   */
  async fetchAndSummarize(url: string) {
    const { confluenceApiToken, confluenceDomain, useConfluenceAPI, openaiApiKey, systemPrompt, userPrompt } = this.settings;
    const resultContainer = this.resultContainer;
    const timer = new SummarTimer(resultContainer);

    if (!openaiApiKey) {
      SummarDebug.Notice(0, "Please configure OpenAI API key in the plugin settings.", 0);
      SummarViewContainer.updateText(resultContainer, "Please configure OpenAI API key in the plugin settings.");
      return;
    }

    if (!confluenceApiToken) {
      SummarDebug.Notice(0, "If you want to use the Confluence API, please configure the API token in the plugin settings.", 0);
    }

    SummarViewContainer.updateText(resultContainer, "Fetching and summarizing...");

    try {
      timer.startTimer();

      // extractConfluenceInfo 함수 호출
      const { confluenceApiToken } = this.settings;

      const conflueceapi = new ConfluenceAPI(this);
      let pageId = "";
      let page_content: string = "";

      if (confluenceApiToken && confluenceDomain && containsDomain(url, this.settings.confluenceDomain)) {
        const result = await conflueceapi.getPageId(url);

        SummarDebug.log(1, "Extracted Confluence Info:");
        SummarDebug.log(1, `Page ID: ${result.pageId}`);
        SummarDebug.log(1, `Space Key: ${result.spaceKey}`);
        SummarDebug.log(1, `Title: ${result.title}`);
        pageId = result.pageId as string;
      }
      if (pageId) {
        try {
          if (useConfluenceAPI && confluenceApiToken) {
            const { title, content } = await conflueceapi.getPageContent(pageId);
            page_content = await content;
            SummarDebug.log(2, `Fetched Confluence page content:\n ${content}`);
          } else {
            const response = await fetchLikeRequestUrl(url, {
              headers: {
                Authorization: `Bearer ${confluenceApiToken}`,
              },
            });
            page_content = await response.text();
          }
        } catch (error) {
          SummarDebug.error(1, "Failed to fetch page content:", error);
        }
      } else {
        const response = await fetchLikeRequestUrl(url);

        page_content = await response.text();
      }
      SummarViewContainer.updateText(resultContainer, "Fedtched page content");

      SummarDebug.log(2, "Fetched page content:", page_content);

      const body_content = JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${userPrompt}\n\n${page_content}` },
        ],
        max_tokens: 16384,
      });

      //SummarViewContainer.updateText(resultContainer, body_content);

      SummarViewContainer.updateText(resultContainer, "Summarizing...");

      const aiResponse = await fetchOpenai(openaiApiKey, body_content);
      timer.stopTimer();

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        SummarDebug.error(1, "OpenAI API Error:", errorText);
        SummarViewContainer.updateText(resultContainer, `Error: ${aiResponse.status} - ${errorText}`);

        return;
      }

      const aiData = (await aiResponse.json()) as OpenAIResponse;

      if (aiData.choices && aiData.choices.length > 0) {
        const summary = aiData.choices[0].message.content || "No summary generated.";
        SummarViewContainer.updateText(resultContainer, summary);
      } else {
        SummarViewContainer.updateText(resultContainer, "No valid response from OpenAI API.");
      }

    } catch (error) {
      timer.stopTimer();
      SummarDebug.error(1, "Error:", error);
      SummarViewContainer.updateText(resultContainer, "An error occurred while processing the request.");
    }
  }


  /*
   * convertPdfToMarkdown 함수는 PDF를 이미지로 변환한 후 마크다운으로 변환합니다.
   * @param resultContainer 결과를 표시할 textarea 엘리먼트
   * @param plugin 플러그인 인스턴스
   */

  async convertPdfToMarkdown() {
    const { openaiApiKey } = this.settings;
    const resultContainer = this.resultContainer;

    if (!openaiApiKey) {
      SummarDebug.Notice(0, "Please configure OpenAI API key in the plugin settings.", 0);
      SummarViewContainer.updateText(resultContainer, "Please configure OpenAI API key in the plugin settings.");
      return;
    }

    const timer = new SummarTimer(resultContainer);
    const pdftopng = new PdfToPng(resultContainer, this);
    try {
      if (!(await pdftopng.isPopplerInstalled())) {
        SummarDebug.Notice(0, "Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
        SummarViewContainer.updateText(resultContainer, "Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
        throw new Error("Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
      }

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".pdf";
      const openaiApiKey = this.settings.openaiApiKey;
      const pdfPrompt = this.settings.pdfPrompt;

      fileInput.onchange = async () => {
        if (fileInput.files && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          SummarDebug.Notice(1, file.name);

          const base64Values = await pdftopng.convert(file, (SummarDebug.level() < 4));

          // JsonBuilder 인스턴스 생성
          const jsonBuilder = new JsonBuilder();

          // 기본 데이터 추가
          jsonBuilder.addData("model", "gpt-4o");

          // 시스템 메시지 추가
          jsonBuilder.addToArray("messages", {
            role: "system",
            content: [
              {
                type: "text",
                text: pdfPrompt,
              },
            ],
          });

          base64Values.forEach((base64, index) => {
            SummarDebug.log(2, `${index + 1}번 파일의 Base64: ${base64}`);
            const page_prompt = `다음은 PDF의 페이지 ${index + 1}입니다.`;
            jsonBuilder.addToArray("messages", {
              role: "user",
              content: [
                {
                  type: "text",
                  text: page_prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${base64}`,
                  },
                },
              ],
            });
          });

          jsonBuilder.addToArray("messages", {
            role: "user",
            content: [
              {
                type: "text",
                text: "모든 페이지가 전송되었습니다. 이제 전체 PDF의 마크다운 결과를 출력하세요.",
              },
            ],
          });

          const body_content = jsonBuilder.toString();
          SummarDebug.log(2, body_content);

          SummarViewContainer.updateText(resultContainer, "Converting PDF to markdown. This may take a while...");

          timer.startTimer();
          const aiResponse = await fetchOpenai(openaiApiKey, body_content);
          timer.stopTimer();

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            SummarDebug.error(1, "OpenAI API Error:", errorText);
            SummarViewContainer.updateText(resultContainer, `Error: ${aiResponse.status} - ${errorText}`);
            return;
          }

          const aiData = (await aiResponse.json()) as OpenAIResponse;

          if (aiData.choices && aiData.choices.length > 0) {
            const summary = aiData.choices[0].message.content || "No summary generated.";
            const markdownContent = extractMarkdownContent(summary);
            if (markdownContent) {
              SummarViewContainer.updateText(resultContainer, markdownContent);
            } else {
              SummarViewContainer.updateText(resultContainer, JSON.stringify(aiData, null, 2));
            }
          } else {
            SummarViewContainer.updateText(resultContainer, "No valid response from OpenAI API.");
          }

          SummarDebug.log(1, "PDF conversion to images complete.");
        }
      };
      fileInput.click();
    } catch (error) {
      timer.stopTimer();

      SummarDebug.error(1, "Error during PDF to PNG conversion:", error);
      SummarViewContainer.updateText(resultContainer, `Error during PDF to PNG conversion: ${error}`);
      SummarDebug.Notice(0, "Failed to convert PDF to PNG. Check console for details.");
    }
  }

  async startRecording(): Promise<void> {
    try {
      const deviceId = this.settings.selectedDeviceId;
      if (!deviceId) {
        SummarDebug.Notice(0, "No audio device selected.", 0);
        return;
      }
  
      // Create MediaStream from selected device
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId },
      });
  
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
  
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: "audio/wav" });
        const audioUrl = URL.createObjectURL(audioBlob);
  
        // Blob URL can be used to save or attach the file
        console.log("Audio URL:", audioUrl);
        SummarDebug.Notice(1, "Recording completed.");
      };
  
      recorder.start();
      SummarDebug.Notice(1, "Recording started!");
  
      // Example: Stop recording after 5 seconds
      setTimeout(() => recorder.stop(), 5000);
    } catch (error) {
      console.error("Error starting recording:", error);
      SummarDebug.Notice(1, "An error occurred during recording.");
    }
  }  
}














// 정규식을 사용하여 마크다운 내용만 추출
function extractMarkdownContent(fullText: string): string | null {
  // 정규식 패턴
  const markdownRegex = /```markdown\n([\s\S]*?)\n```/;

  // 정규식 매칭
  const match = fullText.match(markdownRegex);

  // 매칭된 내용 반환 또는 null
  return match ? match[1] : fullText;
}


// 사용자 입력을 처리하기 위한 모달 클래스
class UrlInputModal extends Modal {
  private callback: (url: string | null) => void;

  constructor(app: App, callback: (url: string | null) => void) {
    super(app);
    this.callback = callback;
  }

  onOpen() {
    const { contentEl } = this;

    // 모달 제목
    contentEl.createEl("h2", { text: "Enter a URL" });

    // URL 입력 필드
    let input: HTMLInputElement;
    new Setting(contentEl)
      .setName("URL")
      .setDesc("Please enter the URL you want to summarize.")
      .addText((text) => {
        input = text.inputEl;
        text.setPlaceholder("https://example.com");

        // 클립보드에서 URL 가져오기
        navigator.clipboard.readText().then((clipboardText) => {
          input.value = clipboardText; // 클립보드 내용 입력창에 설정
        }).catch((err) => {
          SummarDebug.error(1, "Failed to read clipboard content: ", err);
        });
      });

    // 확인 및 취소 버튼
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("OK")
          .setCta()
          .onClick(() => {
            okButtonHandler();
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => {
            this.callback(null); // 취소 시 null 반환
            this.close(); // 모달 닫기
          })
      );

    // OK 버튼 핸들러
    const okButtonHandler = () => {
      const url = input.value.trim();
      if (url) {
        this.callback(url); // URL 전달
        this.close(); // 모달 닫기
      } else {
        SummarDebug.Notice(0, "Please enter a valid URL.");
      }
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}




