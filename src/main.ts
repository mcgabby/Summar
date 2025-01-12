import { App, Plugin, PluginSettingTab, Setting, View, WorkspaceLeaf, Notice, Platform, Menu, Modal } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";

import { PluginSettings, OpenAIResponse } from "./types";
import { DEFAULT_SETTINGS, SummarViewContainer, fetchOpenai } from "./globals";
import { SummarTimer } from "./summartimer";
import { PluginUpdater } from "./pluginupdater";
import { ConfluenceAPI } from "./confluenceapi";
import { JsonBuilder } from "./jsonbuilder";
import { PdfToPng } from "./pdftopng";

export default class SummarPlugin extends Plugin {
  selectedLink: string | null = null;
  settings: PluginSettings;
  resultContainer: HTMLTextAreaElement;
  inputField: HTMLInputElement;

  PLUGIN_NAME: string = ""; // 플러그인 이름
  OBSIDIAN_PLUGIN_DIR: string = "";
  LOCAL_MANIFEST_PATH: string = "";

  async onload() {
    this.PLUGIN_NAME = this.manifest.id;
    this.OBSIDIAN_PLUGIN_DIR = path.join((this.app.vault.adapter as any).basePath, ".obsidian", "plugins");
    this.LOCAL_MANIFEST_PATH = path.join(this.OBSIDIAN_PLUGIN_DIR, this.PLUGIN_NAME, 'manifest.json');

    // 로딩 후 1분 뒤에 업데이트 확인
    setTimeout(async () => {
      try {
        console.log("Checking for plugin updates...");
        const pluginUpdater = new PluginUpdater(this);
        await pluginUpdater.updatePluginIfNeeded();
//        await updatePluginIfNeeded(this);
      } catch (error) {
        console.error("Error during plugin update:", error);
      }
    }, 1000 * 60); // 1분 (60초)    


    console.log("Summar Plugin loaded");

    this.settings = await this.loadSettingsFromFile();

    this.addSettingTab(new SummarSettingsTab(this));

    this.addRibbonIcon("scroll-text", "Open Summar View", this.activateView.bind(this));

    this.registerView(SummarView.VIEW_TYPE, (leaf) => new SummarView(leaf, this));

    if (Platform.isDesktopApp) {
      if (Platform.isWin) {
        console.log("Running on Windows Desktop");
      } else if (Platform.isMacOS) {
        console.log("Running on macOS Desktop");
      } else if (Platform.isLinux) {
        console.log("Running on Linux Desktop");
      }
    } else if (Platform.isMobile) {
      if (Platform.isIosApp) {
        console.log("Running on iOS");
      } else if (Platform.isAndroidApp) {
        console.log("Running on Android");
      }
    } else {
      console.log("Unknown platform");
    }

    // URL 컨텍스트 메뉴 등록
    this.registerEvent(
      this.app.workspace.on('url-menu', (menu: Menu, url: string) => {
        menu.addItem((item) => {
          item.setTitle("&Summary web page using Summar")
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
            new Notice("No URL provided.");
          }
        });
      },
    });

    this.addCommand({
      id: "pdf-to-markdown",
      name: "Convert PDF to Markdown",
      callback: () => {
        this.activateView();
        convertPdfToMarkdown(this.resultContainer, this);
      },
    });
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(SummarView.VIEW_TYPE);
    console.log("Summar Plugin unloaded");
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
        console.error("No available right pane to open Summar View.");
      }
    }
  }

  async getPluginDir(): Promise<string> {
    const pluginId = this.manifest.id;
    const pluginDir = path.join((this.app.vault.adapter as any).basePath, ".obsidian", "plugins", pluginId);
    return pluginDir;
  }

  async loadSettingsFromFile(): Promise<PluginSettings> {
    const pluginDir = await this.getPluginDir();
    const settingsPath = path.join(pluginDir, "data.json");
    if (fs.existsSync(settingsPath)) {
      try {
        const rawData = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(rawData);
        return Object.assign({}, DEFAULT_SETTINGS, settings);
      } catch (error) {
        console.error("Error reading settings file:", error);
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  }

  async saveSettingsToFile(settings: PluginSettings): Promise<void> {
    const pluginDir = await this.getPluginDir();
    const settingsPath = path.join(pluginDir, "data.json");
    try {
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      console.log("Settings saved to data.json");
    } catch (error) {
      console.error("Error saving settings file:", error);
    }
  }

  // 커맨드에서 사용할 링크 설정
  setLinkForCommand(link: string) {
    this.selectedLink = link;
    new Notice(`Link set for command: ${link}`);
    SummarViewContainer.appendText(this.inputField, link);
    fetchAndSummarize(this.resultContainer, link, this);
  }

  openUrlInputDialog(callback: (url: string | null) => void) {
    new UrlInputModal(this.app, callback).open();
  }
}

class SummarSettingsTab extends PluginSettingTab {
  plugin: SummarPlugin;

  constructor(plugin: SummarPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    if (!containerEl || !this.plugin.settings) {
      console.error("Settings or containerEl not initialized correctly.");
      return;
    }

    containerEl.empty();

    containerEl.createEl("h2", { text: "Summar Settings" });

    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("Enter your OpenAI API key.")
      .addText((text) => {
        text
          .setPlaceholder("Enter OpenAI API Key")
          .setValue(this.plugin.settings.openaiApiKey || "")
          .onChange(async (value) => {
            this.plugin.settings.openaiApiKey = value;
            await this.plugin.saveSettingsToFile(this.plugin.settings);
          });
      
      const textAreaEl = text.inputEl;
      textAreaEl.style.width = "100%";
    });

    new Setting(containerEl)
      .setName("Confluence API Token")
      .setDesc("Enter your Confluence API token.")
      .addText((text) => {
        text
          .setPlaceholder("Enter Confluence API Token")
          .setValue(this.plugin.settings.confluenceApiToken || "")
          .onChange(async (value) => {
            this.plugin.settings.confluenceApiToken = value;
            await this.plugin.saveSettingsToFile(this.plugin.settings);
          });
          const textAreaEl = text.inputEl;
          textAreaEl.style.width = "100%";
    });

    // Confluence Base URL with a checkbox in the same line
    new Setting(containerEl)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useConfluenceAPI).onChange(async (value) => {
          this.plugin.settings.useConfluenceAPI = value;
          await this.plugin.saveSettingsToFile(this.plugin.settings);

          // Dynamically enable/disable the input field
          const inputField = containerEl.querySelector<HTMLInputElement>(".confluence-url-input");
          if (inputField) {
            inputField.disabled = !value;
        }
      })
      )
      .addText((text) => {
        text.setPlaceholder("Enter your Confluence Base URL")
          .setValue(this.plugin.settings.confluenceBaseUrl || "https://wiki.workers-hub.com")
          .onChange(async (value) => {
            this.plugin.settings.confluenceBaseUrl = value;
            await this.plugin.saveSettingsToFile(this.plugin.settings);
          });

          const textAreaEl = text.inputEl;
          textAreaEl.style.width = "100%";
            
        // Assign a custom class for targeting
        text.inputEl.classList.add("confluence-url-input");

        // Disable the text field if "useConfluenceAPI" is false on initialization
        text.inputEl.disabled = !this.plugin.settings.useConfluenceAPI;
        
        // Save the reference to dynamically update later
      })
      .setName("Confluence Base URL")
      .setDesc("If you want to use the Confluence Open API, toggle it on; if not, toggle it off.");


    // Custom CSS for proper alignment
    const style = document.createElement("style");
    style.textContent = `
      .setting-container {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .setting-container input[type="checkbox"] {
        margin-right: 10px;
      }
      .setting-container label {
        margin-right: 10px;
      }
      .setting-container input[type="text"] {
        flex: 1;
      }
    `;
    containerEl.appendChild(style);
    

    new Setting(containerEl)
      .setName("System Prompt (for Web page summary)")
      .setDesc("This prompt will be added to the beginning of every chat.")

      new Setting(containerEl)
        .setHeading()
        .addTextArea((text) => {
          text
            .setPlaceholder("Enter system prompt")
            .setValue(this.plugin.settings.systemPrompt || "")
            .onChange(async (value) => {
              this.plugin.settings.systemPrompt = value;
              await this.plugin.saveSettingsToFile(this.plugin.settings);
            });

          const textAreaEl = text.inputEl;
          textAreaEl.style.width = "100%";
          textAreaEl.style.height = "150px";
          textAreaEl.style.resize = "none";

          // 간격을 좁히는 스타일 추가
          const descriptionEl = containerEl.querySelector('.setting-item-description') as HTMLElement;
          if (descriptionEl) {
            descriptionEl.style.marginBottom = "1px"; // 설명과 textarea 사이 간격 조정
          }
          textAreaEl.style.marginTop = "1px"; // textarea의 위쪽 간격 조정          
        })
    ;

    new Setting(containerEl)
      .setName("User Prompt (for Web page summary)")
      .setDesc("This prompt will guide the AI response.")

      new Setting(containerEl)
        .setHeading()
        .addTextArea((text) => {
          text
            .setPlaceholder("Enter user prompt")
            .setValue(this.plugin.settings.userPrompt || "")
            .onChange(async (value) => {
              this.plugin.settings.userPrompt = value;
              await this.plugin.saveSettingsToFile(this.plugin.settings);
            });

          const textAreaEl = text.inputEl;
          textAreaEl.style.width = "100%";
          textAreaEl.style.height = "150px";
          textAreaEl.style.resize = "none";
        })
        ;
      new Setting(containerEl)
      .setName("System Prompt (for PDF to Markdown)")
      .setDesc("This prompt will guide the AI response.")
      new Setting(containerEl)
        .setHeading()
        .addTextArea((text) => {
          text
            .setPlaceholder("Enter user prompt")
            .setValue(this.plugin.settings.pdfPrompt || "")
            .onChange(async (value) => {
              this.plugin.settings.pdfPrompt = value;
              await this.plugin.saveSettingsToFile(this.plugin.settings);
            });
      
      
          const textAreaEl = text.inputEl;
          textAreaEl.style.width = "100%";
          textAreaEl.style.height = "150px";
          textAreaEl.style.resize = "none";

        })
      ;
  }
}

class SummarView extends View {
  static VIEW_TYPE = "summar-view";

  plugin: SummarPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: SummarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SummarView.VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Summar: AI-Powered Summarizer";
  }

  async onOpen(): Promise<void> {
    console.log("Summar View opened");
    this.renderView();
  }

  async onClose(): Promise<void> {
    console.log("Summar View closed");
  }

  private async renderView(): Promise<void> {
    const container = this.containerEl;
    container.empty();

    const inputContainer = container.createEl("div", {
      cls: "input-container",
    });
    inputContainer.style.display = "flex";
    inputContainer.style.alignItems = "center";
    inputContainer.style.gap = "10px";
    inputContainer.style.marginBottom = "10px";

    const inputField = inputContainer.createEl("input", {
      type: "text",
      placeholder: "Enter Web page URL",
    });
    inputField.style.flexGrow = "1";
    inputField.style.padding = "8px";
    inputField.style.border = "1px solid #ccc";
    inputField.style.borderRadius = "5px";
    inputField.style.boxSizing = "border-box";
    this.plugin.inputField = inputField;

    const fetchButton = inputContainer.createEl("button", { text: "GO" });
    fetchButton.style.padding = "8px 12px";
    fetchButton.style.border = "1px solid #ccc";
    fetchButton.style.borderRadius = "5px";
    fetchButton.style.cursor = "pointer";
    fetchButton.style.flexShrink = "0";

    const pdfButton = container.createEl("button", { text: "PDF -> Markdown" });
    pdfButton.style.width = "100%";
    pdfButton.style.marginBottom = "10px";
    pdfButton.style.padding = "8px 12px";
    pdfButton.style.border = "1px solid #ccc";
    pdfButton.style.borderRadius = "5px";
    pdfButton.style.cursor = "pointer";
    
    const resultContainer = container.createEl("textarea", {
      cls: "result-content",
    });

    resultContainer.style.width = "100%";
    resultContainer.style.height = "calc(100% - 90px)";
    resultContainer.style.border = "1px solid #ccc";
    resultContainer.style.padding = "10px";
    // resultContainer.style.backgroundColor = "#fffff9";
    resultContainer.style.whiteSpace = "pre-wrap";
    resultContainer.style.overflowY = "auto";
    resultContainer.style.resize = "none";
    resultContainer.readOnly = true;

    this.plugin.resultContainer = resultContainer;

    if (!Platform.isMacOS) {
      // 버튼을 안보이게 하고 비활성화
      pdfButton.style.display = "none"; // 안보이게 하기
      pdfButton.disabled = true;        // 비활성화
    }

    pdfButton.onclick = async () => {
      convertPdfToMarkdown(resultContainer, this.plugin);
    };

    fetchButton.onclick = async () => {
      const url = inputField.value.trim();
      if (!url) {
        new Notice("Please enter a valid URL.");
        return;
      }

      fetchAndSummarize(resultContainer, url, this.plugin);
    };
  }
}












async function fetchAndSummarize(resultContainer: { value: string }, url: string, plugin: any) {
  const { confluenceApiToken, confluenceBaseUrl, useConfluenceAPI, openaiApiKey, systemPrompt, userPrompt } = plugin.settings;
  const timer = new SummarTimer(resultContainer);

  if (!openaiApiKey) {
    new Notice("Please configure OpenAI API key in the plugin settings.");
    SummarViewContainer.updateText(resultContainer, "Please configure OpenAI API key in the plugin settings.");  
    return;
  }

  if (!confluenceApiToken) {
    new Notice("If you want to use the Confluence API, please configure the API token in the plugin settings.");
  }

  SummarViewContainer.updateText(resultContainer, "Fetching and summarizing...");

  try {
    timer.startTimer();

    // extractConfluenceInfo 함수 호출
    const { confluenceApiToken } = plugin.settings;

    const conflueceapi = new ConfluenceAPI(plugin);
    let pageId = "";
    let page_content: string = "";

    if (confluenceApiToken && confluenceBaseUrl) {
      const result = await conflueceapi.getPageId(url);


      // const result = await extractConfluenceInfo(url, plugin);
      // 결과 출력
console.log("Extracted Confluence Info:");
console.log(`Page ID: ${result.pageId}`);
console.log(`Space Key: ${result.spaceKey}`);
console.log(`Title: ${result.title}`);
      pageId = result.pageId as string;
    }
    if (pageId) {
      try {
        if (useConfluenceAPI&&confluenceApiToken) {
          const { title, content } = await conflueceapi.getPageContent(pageId);
          //          const { title, content } = await getConfluencePageContent(result.pageId, confluenceApiToken, confluenceBaseUrl);
          page_content = await content;
console.log(`Fetched Confluence page content:\n ${content}`);
        } else {
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${confluenceApiToken}`,
            },
          });
          page_content = await response.text();
        }
      } catch (error) {
        console.error("Failed to fetch page content:", error);
      }
    } else {
      const response = await fetch(url);

      page_content = await response.text();
    }

console.log("Fetched page content:", page_content);

    const body_content = JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${userPrompt}\n\n${page_content}` },
      ],
      max_tokens: 16384,
    });

    const aiResponse = await fetchOpenai(openaiApiKey, body_content);
    timer.stopTimer();

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("OpenAI API Error:", errorText);
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
    console.error("Error:", error);
    SummarViewContainer.updateText(resultContainer, "An error occurred while processing the request.");
  }
}


/**
 * Convert a PDF file to PNG images using Poppler and Jimp.
 * @param file The PDF file to be converted.
 * @param app Obsidian's app instance for accessing the file system.
 */
async function convertPdfToMarkdown(resultContainer: { value: string }, plugin: any) {
  const { openaiApiKey } = plugin.settings;

  if (!openaiApiKey) {
    new Notice("Please configure OpenAI API key in the plugin settings.");
    SummarViewContainer.updateText(resultContainer, "Please configure OpenAI API key in the plugin settings.");
    return;
  }

  const timer = new SummarTimer(resultContainer);
  const pdftopng = new PdfToPng(resultContainer);
  try {
      if (!(await pdftopng.isPopplerInstalled())) {  
        new Notice("Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
        SummarViewContainer.updateText(resultContainer, "Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
        throw new Error("Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
      }

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".pdf";
      const openaiApiKey = plugin.settings.openaiApiKey;
      const pdfPrompt = plugin.settings.pdfPrompt;

      fileInput.onchange = async () => {
        if (fileInput.files && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          new Notice(file.name);

          const base64Values = await pdftopng.convert(file, true);

          // JsonBuilder 인스턴스 생성
          const jsonBuilder = new JsonBuilder();

          // 기본 데이터 추가
          jsonBuilder
            .addData("model", "gpt-4o");

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
            console.log(`${index + 1}번 파일의 Base64: ${base64}`);
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
          console.log(body_content);


          SummarViewContainer.updateText(resultContainer, "Converting PDF to markdown. This may take a while...");

          timer.startTimer();
          const aiResponse = await fetchOpenai(openaiApiKey, body_content);
          timer.stopTimer();

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error("OpenAI API Error:", errorText);
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

          console.log("PDF conversion to images complete.");
        }
      };
      fileInput.click();
  } catch (error) {
    timer.stopTimer();

    console.error("Error during PDF to PNG conversion:", error);
    SummarViewContainer.updateText(resultContainer, `Error during PDF to PNG conversion: ${error}`);
    new Notice("Failed to convert PDF to PNG. Check console for details.");
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
          console.error("Failed to read clipboard content: ", err);
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
        new Notice("Please enter a valid URL.");
      }
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}




