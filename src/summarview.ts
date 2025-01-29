import { View, WorkspaceLeaf, Platform } from "obsidian";

import SummarPlugin  from "./main";
import { SummarDebug } from "./globals";

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
    });
    inputField.style.flexGrow = "1";
    inputField.style.padding = "8px";
    inputField.style.border = "1px solid #ccc";
    inputField.style.borderRadius = "5px";
    inputField.style.boxSizing = "border-box";
    inputField.style.marginBottom = "1px";
    inputField.value = this.plugin.settings.testUrl || "";
  
    // Store input field for later use
    this.plugin.inputField = inputField;
  
    const fetchButton: HTMLButtonElement = inputContainer.createEl("button", {
      text: "GO",
    });
    fetchButton.style.padding = "8px 12px";
    fetchButton.style.border = "1px solid #ccc";
    fetchButton.style.borderRadius = "5px";
    fetchButton.style.cursor = "pointer";
    fetchButton.style.flexShrink = "0";
    fetchButton.style.marginBottom = "1px";
  
    // Button Container
    const buttonContainer: HTMLDivElement = container.createEl("div", {
      cls: "button-container",
    });
    buttonContainer.style.display = "flex";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.gap = "5px"; // 간격 조정
    buttonContainer.style.marginBottom = "1px";
    buttonContainer.style.marginTop = "1px";
  
    const pdfButton: HTMLButtonElement = buttonContainer.createEl("button", {
      text: "PDF",
    });
    pdfButton.style.width = "30%";
    pdfButton.style.marginBottom = "1px"; // 간격 조정
    pdfButton.style.padding = "8px 12px";
    pdfButton.style.border = "1px solid #ccc";
    pdfButton.style.borderRadius = "5px";
    pdfButton.style.cursor = "pointer";
    pdfButton.style.marginBottom = "1px";
    pdfButton.style.marginTop = "1px";
  
    const recordButton: HTMLButtonElement = buttonContainer.createEl("button", {
      text: "[●] record",
    });
    recordButton.style.width = "70%";
    recordButton.style.marginBottom = "1px"; // 간격 조정
    recordButton.style.padding = "8px 12px";
    recordButton.style.border = "1px solid #ccc";
    recordButton.style.borderRadius = "5px";
    recordButton.style.cursor = "pointer";
  
    // Result Container
    const resultContainer: HTMLTextAreaElement = container.createEl("textarea", {
      cls: "result-content",
    });
    resultContainer.style.width = "100%";
    resultContainer.style.height = "calc(100% - 80px)"; // 높이 재조정
    resultContainer.style.border = "1px solid #ccc";
    resultContainer.style.padding = "10px";
    resultContainer.style.marginTop = "1px"; // 위로 붙임
    resultContainer.style.whiteSpace = "pre-wrap";
    resultContainer.style.overflowY = "auto";
    resultContainer.style.resize = "none";
    resultContainer.readOnly = true;
  
    this.plugin.resultContainer = resultContainer;
    this.plugin.recordButton = recordButton;

    if (!Platform.isMacOS) {
      // 버튼을 안보이게 하고 비활성화
      pdfButton.style.display = "none"; // 안보이게 하기
      pdfButton.disabled = true;        // 비활성화
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
}
