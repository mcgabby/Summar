import { View, WorkspaceLeaf, Platform } from "obsidian";
import { SummarDebug } from "./globals";
import SummarPlugin  from "./main";

export class SummarRecordingPanel extends View {
  static VIEW_TYPE = "summar-recording-panel";

  plugin: SummarPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: SummarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SummarRecordingPanel.VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Summar: Recording Interface";
  }

  getIcon(): string {
    return "scroll-text"; // 사용할 아이콘 이름 (Lucide 아이콘)
  }

  async onOpen(): Promise<void> {
    SummarDebug.log(1, "Summar Recording panel opened");
    this.renderView();
  }

  async onClose(): Promise<void> {
    SummarDebug.log(1, "Summar Recording panel closed");
  }

  private async renderView(): Promise<void> {
    const container = this.containerEl;
    container.empty();

    // const inputContainer = container.createEl("div", {
    //   cls: "input-container",
    // });
    // inputContainer.style.display = "flex";
    // inputContainer.style.alignItems = "center";
    // inputContainer.style.gap = "10px";
    // inputContainer.style.marginBottom = "10px";

    // const inputField = inputContainer.createEl("input", {
    //   type: "text",
    //   placeholder: "Enter Web page URL",
    // });
    // inputField.style.flexGrow = "1";
    // inputField.style.padding = "8px";
    // inputField.style.border = "1px solid #ccc";
    // inputField.style.borderRadius = "5px";
    // inputField.style.boxSizing = "border-box";
    // inputField.value = this.plugin.settings.testUrl || "";

    // this.plugin.inputField = inputField;

    // const fetchButton = inputContainer.createEl("button", { text: "GO" });
    // fetchButton.style.padding = "8px 12px";
    // fetchButton.style.border = "1px solid #ccc";
    // fetchButton.style.borderRadius = "5px";
    // fetchButton.style.cursor = "pointer";
    // fetchButton.style.flexShrink = "0";

    // const pdfButton = container.createEl("button", { text: "PDF -> Markdown" });
    // pdfButton.style.width = "100%";
    // pdfButton.style.marginBottom = "10px";
    // pdfButton.style.padding = "8px 12px";
    // pdfButton.style.border = "1px solid #ccc";
    // pdfButton.style.borderRadius = "5px";
    // pdfButton.style.cursor = "pointer";

    // const resultContainer = container.createEl("textarea", {
    //   cls: "result-content",
    // });

    // resultContainer.style.width = "100%";
    // resultContainer.style.height = "calc(100% - 90px)";
    // resultContainer.style.border = "1px solid #ccc";
    // resultContainer.style.padding = "10px";
    // // resultContainer.style.backgroundColor = "#fffff9";
    // resultContainer.style.whiteSpace = "pre-wrap";
    // resultContainer.style.overflowY = "auto";
    // resultContainer.style.resize = "none";
    // resultContainer.readOnly = true;

    // this.plugin.resultContainer = resultContainer;

    // if (!Platform.isMacOS) {
    //   // 버튼을 안보이게 하고 비활성화
    //   pdfButton.style.display = "none"; // 안보이게 하기
    //   pdfButton.disabled = true;        // 비활성화
    // }

    // pdfButton.onclick = async () => {
    //   this.plugin.convertPdfToMarkdown();
    // };

    // fetchButton.onclick = async () => {
    //   const url = inputField.value.trim();
    //   if (!url) {
    //     SummarDebug.Notice(0, "Please enter a valid URL.");
    //     return;
    //   }

    //   this.plugin.fetchAndSummarize(url);
    // };



  }
}
