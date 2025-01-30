import { App, Plugin, Setting, Platform, Menu, TFile, TFolder, Modal, normalizePath } from "obsidian";
import { PluginSettings } from "./types";
import { DEFAULT_SETTINGS, SummarDebug, extractDomain } from "./globals";
import { PluginUpdater } from "./pluginupdater";
import { SummarView } from "./summarview"
import { SummarSettingsTab } from "./summarsettingtab";
import { ConfluenceHandler } from "./confluencehandler";
import { PdfHandler } from "./pdfhandler";
import { AudioHandler } from "./audiohandler";
import { AudioRecordingManager } from "./recordingmanager";
import { StatusBar } from "./statusbar";


export default class SummarPlugin extends Plugin {
  settings: PluginSettings;
  resultContainer: HTMLTextAreaElement;
  inputField: HTMLInputElement;
  recordButton: HTMLButtonElement;

  confluenceHandler: ConfluenceHandler;
  pdfHandler: PdfHandler;
  recordingManager: AudioRecordingManager;
  audioHandler: AudioHandler;

  statusBar: StatusBar;

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

    this.confluenceHandler = new ConfluenceHandler(this);
    this.pdfHandler = new PdfHandler(this);
    this.audioHandler = new AudioHandler(this);
    this.recordingManager = new AudioRecordingManager(this);
    this.statusBar = new StatusBar(this);


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

    // Register an event to modify the context menu in the file explorer
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        // Add menu item for files
        if (file instanceof TFile) {
          // Add menu item for audio and webm files
          if (file instanceof TFile && this.audioHandler.isAudioOrWebmFile(file)) {
            menu.addItem((item) => {
              item
                .setTitle("Summarize meeting from audio file")
                .setIcon("file")
                .onClick(async () => {
                  try {
                    // this.handleFileAction(file);
                    const files = await this.convertTFileToFileArray([file]);
                    SummarDebug.log(1, `File selected: ${file.path}`);
                    if (files && files.length > 0) {
                      this.activateView();
                      const text = await this.audioHandler.sendAudioData(files);
                      SummarDebug.log(3, `transcripted text: ${text}`);
                      this.recordingManager.summarize(text);
                    }
                  } catch (error) {
                    SummarDebug.error(1, "Error handling file:", error);
                  }
                });
            });
          }
        }

        // Add menu item for directories containing audio or webm files
        if (file instanceof TFolder && this.audioHandler.folderContainsAudioOrWebm(file)) {
          menu.addItem((item) => {
            item
              .setTitle("Summarize meeting from multiple audio files")
              .setIcon("folder")
              .onClick(async () => {
                // this.handleFolderAction(file);
                const files = await this.convertTFolderToFileArray(file);
                SummarDebug.log(1, `Folder selected: ${file.path}`);
                if (files && files.length > 0) {
                  // Filter only audio files
                  const audioFiles = Array.from(files).filter((file) => {
                    // Check MIME type or file extension
                    return (
                      file.type.startsWith("audio/") ||
                      file.name.toLowerCase().endsWith(".webm") // Include .webm files
                    );
                  });

                  if (audioFiles.length === 0) {
                    SummarDebug.Notice(1, "No audio files found in the selected directory.");
                    return;
                  }

                  // Send all selected files to sendAudioData
                  this.activateView();
                  const text = await this.audioHandler.sendAudioData(files, file.path);
                  SummarDebug.log(3, `transcripted text: ${text}`);
                  this.recordingManager.summarize(text);
                }
              });
          });
        }
      })
    );


    // 커맨드 추가
    this.addCommand({
      id: "fetch-and-summarize-link",
      name: "Summarize web page",
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
        this.pdfHandler.convertPdfToMarkdown();
      },
    });

    this.addCommand({
      id: "start-top-recording-to-transcript",
      name: "Start/Stop recording",
      callback: async () => {
        this.activateView();
        await this.toggleRecording();
      },
      hotkeys: [
        {
          // modifiers: Platform.isMacOS ? ["Mod", "Shift"] : ["Ctrl", "Shift"],
          modifiers: Platform.isMacOS ? ["Mod"] : ["Ctrl"],
          key: "R", // R 키
        },
      ],
    });

    this.addCommand({
      id: "upload-audio-to-transcript",
      name: "Summarize meeting from audio file",
      callback: () => {
        this.activateView();
        // Create an input element for file selection
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "audio/*"; // Accept only audio files

        // Handle file or directory selection
        fileInput.onchange = async (event) => {
          const files = (event.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            // Send all selected files to sendAudioData
            const text = await this.audioHandler.sendAudioData(files);
            SummarDebug.log(3, `transcripted text: ${text}`);
            this.recordingManager.summarize(text);
          }
        };

        // Programmatically open the file dialog
        fileInput.click();
      },
    });

    this.addCommand({
      id: "upload-audiolist-to-transcript",
      name: "Summarize meeting from multiple audio files",
      callback: () => {
        this.activateView();
        // Create an input element for file selection
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "audio/*,.webm"; // Accept audio files and .webm files
        fileInput.webkitdirectory = true; // Allow directory selection

        // Handle file or directory selection
        fileInput.onchange = async (event) => {
          const files = (event.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            // Filter only audio files
            const audioFiles = Array.from(files).filter((file) => {
              // Check MIME type or file extension
              return (
                file.type.startsWith("audio/") ||
                file.name.toLowerCase().endsWith(".webm") // Include .webm files
              );
            });

            if (audioFiles.length === 0) {
              SummarDebug.Notice(1, "No audio files found in the selected directory.");
              return;
            }

            // Send all selected files to sendAudioData
            const text = await this.audioHandler.sendAudioData(files);
            SummarDebug.log(3, `transcripted text: ${text}`);
            this.recordingManager.summarize(text);
          }
        };

        // Programmatically open the file dialog
        fileInput.click();
      },
    });
  }

  async toggleRecording(): Promise<void> {
    if (this.recordingManager.getRecorderState() !== "recording") {
      await this.recordingManager.startRecording(this.settings.recordingUnit);
    } else {
      const recordingPath = await this.recordingManager.stopRecording();
      SummarDebug.log(1, `main.ts - recordingPath: ${recordingPath}`);

      try {
        // Vault adapter를 사용해 디렉토리 내용을 읽음
        const fileEntries = await this.app.vault.adapter.list(recordingPath);
        const audioFiles = fileEntries.files.filter((file) =>
          file.toLowerCase().match(/\.(webm|mp3|wav|ogg|m4a)$/)
        );
        // 파일명을 추출하고 로그 출력
        fileEntries.files.forEach((filePath) => {
          const fileName = filePath.split('/').pop(); // 파일 경로에서 마지막 부분(파일명) 추출
          SummarDebug.log(1, `File found: ${fileName}`);
        });
        // 파일명을 추출하고 로그 출력
        audioFiles.forEach((filePath) => {
          const fileName = filePath.split('/').pop(); // 파일 경로에서 파일명만 추출
          SummarDebug.log(1, `Audio file found: ${fileName}`);
        });
        if (audioFiles.length === 0) {
          // 오디오 파일이 없을 경우 사용자에게 알림
          SummarDebug.Notice(1, "No audio files found in the specified directory.");
          return;
        }

        // 파일 경로를 File 객체로 변환
        const files = await Promise.all(
          audioFiles.map(async (filePath) => {
            const content = await this.app.vault.adapter.readBinary(filePath);
            const blob = new Blob([content]);
            SummarDebug.log(1, `stop - filePath: ${filePath}`);
            return new File([blob], filePath.split("/").pop() || "unknown", { type: blob.type });
          })
        );
        // sendAudioData에 오디오 파일 경로 전달
        const text = await this.audioHandler.sendAudioData(files, recordingPath);
        SummarDebug.Notice(1, `Uploaded ${audioFiles.length} audio files successfully.`);
        SummarDebug.log(3, `transcripted text: ${text}`);
        this.recordingManager.summarize(text);
      } catch (error) {
        SummarDebug.error(0, "Error reading directory:", error);
        SummarDebug.Notice(1, "Failed to access the specified directory.");
      }
    }

  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(SummarView.VIEW_TYPE);
    this.statusBar.remove();

    SummarDebug.log(1, "Summar Plugin unloaded");
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
      await this.app.vault.adapter.mkdir(this.PLUGIN_DIR);
      await this.app.vault.adapter.write(this.PLUGIN_SETTINGS, JSON.stringify(settings, null, 2));
      SummarDebug.log(1, "Settings saved to data.json");
    } catch (error) {
      SummarDebug.error(1, "Error saving settings file:", error);
    }
  }

  // 커맨드에서 사용할 링크 설정
  setLinkForCommand(link: string) {
    SummarDebug.Notice(0, `Link set for command: ${link}`);

    this.inputField.value = link;
    this.confluenceHandler.fetchAndSummarize(link);
  }

  openUrlInputDialog(callback: (url: string | null) => void) {
    new UrlInputModal(this.app, callback).open();
  }

  // Convert TFile to File[]
  private async convertTFileToFileArray(tFiles: TFile[]): Promise<File[]> {
    const files: File[] = [];
    for (const tFile of tFiles) {
      const fileContent = await this.app.vault.readBinary(tFile);
      const file = new File([fileContent], tFile.name);
      files.push(file);
    }
    return files;
  }

  // Convert TFolder to File[] (all files in the folder)
  private async convertTFolderToFileArray(folder: TFolder): Promise<File[]> {
    const files: File[] = [];
    const folderFiles = this.app.vault.getFiles().filter(
      (file) => file.path.startsWith(folder.path)
    );

    for (const tFile of folderFiles) {
      const fileContent = await this.app.vault.readBinary(tFile);
      const file = new File([fileContent], tFile.name);
      files.push(file);
    }
    return files;
  }
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




