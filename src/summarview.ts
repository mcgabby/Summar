import { View, WorkspaceLeaf, Platform, setIcon, normalizePath, MarkdownView } from "obsidian";

import SummarPlugin  from "./main";
import { SummarDebug, SummarViewContainer, showSettingsTab } from "./globals";
import { ConfluenceAPI } from "./confluenceapi";
import MarkdownIt from "markdown-it";

export class SummarView extends View {
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

  getIcon(): string {
    return "scroll-text"; // 사용할 아이콘 이름 (Lucide 아이콘)
  }

  async onOpen(): Promise<void> {
    SummarDebug.log(1, "Summar View opened");
    this.renderView();
  }

  async onClose(): Promise<void> {
    SummarDebug.log(1, "Summar View closed");
  }

  private async renderView(): Promise<void> {
    const container: HTMLElement = this.containerEl;
    container.empty();

    // Input Container
    const inputContainer: HTMLDivElement = container.createEl("div", {
      cls: "input-container",
    });
    inputContainer.style.display = "flex";
    inputContainer.style.alignItems = "center";
    inputContainer.style.gap = "5px"; // 간격 조정
    inputContainer.style.marginBottom = "1px";
  
    const inputField: HTMLInputElement = inputContainer.createEl("input", {
      type: "text",
      placeholder: "Enter Web page URL",
      cls: "summarview-input",
    });
    inputField.style.flexGrow = "1";
    inputField.style.padding = "8px";
    inputField.style.border = "1px solid var(--background-modifier-border)";
    inputField.style.borderRadius = "5px";
    inputField.style.boxSizing = "border-box";
    inputField.style.margin = "5px";
    inputField.value = this.plugin.settings.testUrl || "";
  
    // Store input field for later use
    this.plugin.inputField = inputField;
  
    const fetchButton: HTMLButtonElement = inputContainer.createEl("button", {
      text: "GO",
      cls: "summarview-button",
    });
    // fetchButton.setAttribute("data-tooltip", "Fetch and summarize the web page");
    fetchButton.setAttribute("aria-label", "Fetch and summarize the web page");
    fetchButton.style.padding = "8px 12px";
    fetchButton.style.border = "1px solid var(--background-modifier-border)";
    fetchButton.style.borderRadius = "5px";
    fetchButton.style.cursor = "pointer";
    fetchButton.style.flexShrink = "0";
    fetchButton.style.margin = "5px";
    // Button Container
    const buttonContainer: HTMLDivElement = container.createEl("div", {
      cls: "button-container",
    });
    buttonContainer.style.display = "flex";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.gap = "5px"; // 간격 조정
    buttonContainer.style.marginBottom = "1px";
    buttonContainer.style.margin = "5px";
  
    // uploadNoteToWikiButton 추가
    const uploadNoteToWikiButton = buttonContainer.createEl("button", {
      cls: "lucide-icon-button",
    });
    uploadNoteToWikiButton.setAttribute("aria-label", "Upload Note to Confluence");
    setIcon(uploadNoteToWikiButton, "file-up");

    // uploadNoteToWikiButton 클릭 이벤트 리스너
    uploadNoteToWikiButton.addEventListener("click", async() => {
      const viewType = await this.getCurrentMainPaneTabType();
      if (viewType === "markdown") {
        if (this.plugin.settings.confluenceParentPageUrl.length == 0 || 
          this.plugin.settings.confluenceParentPageSpaceKey.length == 0 || 
          this.plugin.settings.confluenceParentPageId.length == 0 ) {
            const fragment = document.createDocumentFragment();
            const message1 = document.createElement("span");
            message1.textContent = "To publish your notes to Confluence, " +
              "please specify the Parent Page where the content will be saved. \n";
            fragment.appendChild(message1);

            // 링크 생성 및 스타일링
            const link = document.createElement("a");
            link.textContent = "Set the Confluence Parent Page URL in the settings to configure the Space Key and Page ID";
            link.href = "#";
            link.style.cursor = "pointer";
            link.style.color = "var(--text-accent)"; // 링크 색상 설정 (옵션)
            link.addEventListener("click", (event) => {
              event.preventDefault(); // 기본 동작 방지
              showSettingsTab(this.plugin, 'common-tab');
            });
            fragment.appendChild(link);
            SummarDebug.Notice(0, fragment, 0);
            
            // SummarDebug.Notice(0, "Please set Confluence Parent Page URL, Space Key, and ID in the settings.",0);
            return;
        }
        // SummarDebug.Notice(1, "uploadNoteToWiki");
        const file = this.plugin.app.workspace.getActiveFile();
        if (file) {
          let title = file.basename;
          const content = await this.plugin.app.vault.read(file);
          SummarDebug.log(1, `title: ${title}`);
          SummarDebug.log(3, `content: ${content}`);
          if (content.includes("## Confluence 문서 제목")) {
            const match = content.match(/EN:(.*?)(?:\r?\n|$)/);
            if (match && match[1]) {
              if (title.includes("summary")) {
                title = title.replace("summary", "");
              }  
              const entitle = match[1].trim();
              title = `${title} - ${entitle}`;
            }
          }
          const md = new MarkdownIt();
          const html = md.render(content);
          const confluenceApi = new ConfluenceAPI(this.plugin);
          const { updated, statusCode, message, reason } = await confluenceApi.createPage(title, html);
          if (statusCode === 200) {
            // HTML 형식의 성공 메시지 생성
            const messageFragment = document.createDocumentFragment();
              
            const successText = document.createElement("div");
            if (updated) {
              successText.textContent = "Page has been updated successfully.";
            } else {
              successText.textContent = "Page has been created successfully.";
            }
            messageFragment.appendChild(successText);

            const lineBreak = document.createElement("br");
            messageFragment.appendChild(lineBreak);

            const link = document.createElement("a");
            link.href = message;
            link.textContent = message;
            link.style.color = "var(--link-color)"; // Obsidian의 링크 색상 사용
            link.style.textDecoration = "underline";
            messageFragment.appendChild(link);

            SummarDebug.Notice(0, messageFragment, 0);
          } else {
            const frag = document.createDocumentFragment();
            const title = document.createElement("div");
            title.textContent = "⚠️" + reason;
            title.style.fontWeight = "bold";
            title.style.marginBottom = "4px";

            const messageNoti = document.createElement("div");
            messageNoti.textContent = message as string;
            
            frag.appendChild(title);
            frag.appendChild(messageNoti);

            SummarDebug.Notice(0, frag, 0);
          }
        } else {
          SummarDebug.Notice(0, "No active editor was found.");
        }
      }
      else {
        const frag = document.createDocumentFragment();

        const title = document.createElement("div");
        title.textContent = "⚠️ Wiki Upload Failed";
        title.style.fontWeight = "bold";
        title.style.marginBottom = "4px";
        
        const message = document.createElement("div");
        message.textContent = "No active editor was found.";
        
        frag.appendChild(title);
        frag.appendChild(message);
        
        SummarDebug.Notice(0, frag);
      } 
    });

    if (!(Platform.isMacOS && Platform.isDesktopApp)) {
      // 버튼을 안보이게 하고 비활성화
      uploadNoteToWikiButton.style.display = "none"; // 안보이게 하기
      uploadNoteToWikiButton.disabled = true;        // 비활성화
      uploadNoteToWikiButton.style.width = "100%";
    }

    const newNoteButton = buttonContainer.createEl("button", {
      cls: "lucide-icon-button",
    });
    newNoteButton.setAttribute("aria-label", "Create new note with results");
    setIcon(newNoteButton, "file-output");

    // newNoteButton 클릭 이벤트 리스너
    newNoteButton.addEventListener("click", async() => {

      let newNoteName = this.plugin.newNoteName;
      
      // if (this.plugin.newNoteName.includes(".md")) {
      //   newNoteName = newNoteName.replace(".md", " summary.md");
      // } else {
      //   newNoteName = newNoteName + ".md";
      // }
      if (!newNoteName || newNoteName === "") {
        const summarView = new SummarViewContainer(this.plugin);
        summarView.enableNewNote(true, newNoteName);
        newNoteName = this.plugin.newNoteName;
      }

      const filePath = normalizePath(newNoteName);
      const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);

      if (existingFile) {
        const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
        
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MarkdownView && view.file && view.file.path === filePath) {
            this.plugin.app.workspace.setActiveLeaf(leaf);
            return;
          }
        }
        await this.plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);
      } else {
        SummarDebug.log(1, `file is not exist: ${filePath}`);
        const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
        const folderExists = await this.plugin.app.vault.adapter.exists(folderPath);
        if (!folderExists) {
          await this.plugin.app.vault.adapter.mkdir(folderPath);
        }
        SummarDebug.log(1, `resultContainer.value===\n${this.plugin.resultContainer.value}`);
        // SummarDebug.log(1, this.plugin.resultContainer.value);
        await this.plugin.app.vault.create(filePath, this.plugin.resultContainer.value);
        await this.plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);
      }
    });

    this.plugin.newNoteButton = newNoteButton;

    if (this.plugin.newNoteButton) {
      this.plugin.newNoteButton.disabled = true;
      this.plugin.newNoteButton.classList.toggle("disabled", true);
    }
    
    // 구분선(|) 추가
    const separator = buttonContainer.createEl("span", {
      text: "|",
      cls: "button-separator"
    });
  
    const pdfButton: HTMLButtonElement = buttonContainer.createEl("button", {
      text: "PDF",
      cls: "summarview-button",
    });
    pdfButton.setAttribute("aria-label", "Convert PDF to Markdown");
    pdfButton.style.width = "30%";
    pdfButton.style.marginBottom = "1px"; // 간격 조정
    pdfButton.style.padding = "8px 12px";
    pdfButton.style.border = "1px solid var(--background-modifier-border)";
    pdfButton.style.borderRadius = "5px";
    pdfButton.style.cursor = "pointer";
    pdfButton.style.marginBottom = "1px";
    pdfButton.style.marginTop = "1px";
  
    const recordButton: HTMLButtonElement = buttonContainer.createEl("button", {
      text: "[●] record",
      cls: "summarview-button",
    });
    recordButton.setAttribute("aria-label", "Record audio and summarize");
    recordButton.style.width = "70%";
    recordButton.style.marginBottom = "1px"; // 간격 조정
    recordButton.style.padding = "8px 12px";
    recordButton.style.border = "1px solid var(--background-modifier-border)";
    recordButton.style.borderRadius = "5px";
    recordButton.style.cursor = "pointer";

    // Result Container
    const resultContainer: HTMLTextAreaElement = container.createEl("textarea", {
      cls: "summarview-result",
    });
    resultContainer.style.width = "calc(100% - 10px)";
    resultContainer.style.height = "calc(100% - 80px)"; // 높이 재조정
    resultContainer.style.border = "1px solid var(--background-modifier-border)";
    resultContainer.style.padding = "10px";
    resultContainer.style.margin = "5px"; // 위로 붙임
    resultContainer.style.whiteSpace = "pre-wrap";
    resultContainer.style.overflowY = "auto";
    resultContainer.style.resize = "none";
    resultContainer.readOnly = true;
    resultContainer.style.color = "var(--text-normal)"; // Obsidian의 기본 텍스트 색상 변수 사용
  
    this.plugin.resultContainer = resultContainer;
    this.plugin.recordButton = recordButton;

    if (!(Platform.isMacOS && Platform.isDesktopApp)) {
      // 버튼을 안보이게 하고 비활성화
      pdfButton.style.display = "none"; // 안보이게 하기
      pdfButton.disabled = true;        // 비활성화
      recordButton.style.width = "100%";
    }


    fetchButton.onclick = async () => {
      const url = inputField.value.trim();
      if (!url) {
        SummarDebug.Notice(0, "Please enter a valid URL.");
        return;
      }
      this.plugin.confluenceHandler.fetchAndSummarize(url);
    };

    pdfButton.onclick = async () => {
      this.plugin.pdfHandler.convertPdfToMarkdown();
    };

    recordButton.onclick = async () => {
      await this.plugin.toggleRecording();
    }



  }

  getCurrentMainPaneTabType(): string {
    const existingLeaf = this.app.workspace.getMostRecentLeaf();
    if (!existingLeaf) return ""; 
    return existingLeaf.view.getViewType();
  }

}
