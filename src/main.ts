import { App, Plugin, Setting, Platform, Menu, TFile, TFolder, Modal, normalizePath, MarkdownView, Stat } from "obsidian";
import { PluginSettings, ModelCategory, ModelInfo, ModelData, PromptData, LangPromptData, DefaultPrompts } from "./types";  
import { SummarDebug, extractDomain, parseHotkey } from "./globals";
import { PluginSettingsV2 } from "./pluginsettingsv2";
import { PluginUpdater } from "./pluginupdater";
import { SummarView } from "./summarview"
import { SummarSettingsTab } from "./summarsettingtab";
import { ConfluenceHandler } from "./confluencehandler";
import { PdfHandler } from "./pdfhandler";
import { AudioHandler } from "./audiohandler";
import { AudioRecordingManager } from "./recordingmanager";
import { CustomCommandHandler } from "./customcommandhandler";
import { CalendarHandler } from "./calendarhandler";
import { DailyNotesHandler } from "./dailynoteshandler";
import { StatusBar } from "./statusbar";
import { SummarStatsModal } from "./summarstatsmodal";
import { IndexedDBManager } from "./summarailog";
import semver from "semver";
import { TrackedAPIClient } from "./summarailog";

export default class SummarPlugin extends Plugin {
  settings: PluginSettings = {
    settingsSchemaVersion: "",
    openaiApiKey: "",
    openaiApiEndpoint: "",

    googleApiKey: "",
    confluenceApiToken: "",

    confluenceParentPageUrl: "",
    confluenceParentPageSpaceKey: "",
    confluenceParentPageId: "",
    useConfluenceAPI: true,
    confluenceDomain: "",

    systemPrompt: "",
    
    webModel: "",
    webPrompt: "",
    
    pdfModel: "",
    pdfPrompt: "",
    

    autoRecordOnZoomMeeting: false,
    selectedDeviceId: "",
    recordingDir: "",
    saveTranscriptAndRefineToNewNote: true,
    recordingUnit: 15,
    recordingLanguage: "ko-KR",

    sttModel: "",
    sttPrompt: "",

    transcriptSummaryModel: "",    
    transcriptSummaryPrompt: "",
    refineSummary: true,
    refineSummaryPrompt: "",
    

    testUrl: "",
    debugLevel: 0,
    
    cmd_max: 10,
    cmd_count: 0,
    
    calendar_count: 0,
    calendar_fetchdays: 1,
    calendar_polling_interval: 600000,
    autoLaunchZoomOnSchedule: false,
    autoLaunchZoomOnlyAccepted: true,
    addLinkToDailyNotes: true,
    /// deprecated variables // before 1.0.0
    recordingResultNewNote: true,
    transcriptSTT: "",
    transcribingPrompt: "",
    transcriptModel: "",
    recordingPrompt: "",
    refiningPrompt: "",
  };

  // V2 설정 시스템 (통합된 클래스)
  settingsv2: PluginSettingsV2;

  resultContainer: HTMLTextAreaElement;
  // uploadNoteToWikiButton: HTMLButtonElement;
  newNoteButton: HTMLButtonElement;
  newNoteLabel: HTMLSpanElement;
  inputField: HTMLInputElement;
  recordButton: HTMLButtonElement;

  summarSettingTab: SummarSettingsTab;
  confluenceHandler: ConfluenceHandler;
  pdfHandler: PdfHandler;
  recordingManager: AudioRecordingManager;
  audioHandler: AudioHandler;
  commandHandler: CustomCommandHandler;
  calendarHandler: CalendarHandler;
  dailyNotesHandler: DailyNotesHandler;

  recordingStatus: StatusBar;
  reservedStatus: StatusBar;

  customCommandIds: string[] = [];
  customCommandMenu: any;

  newNoteName: string = "";
  
  OBSIDIAN_PLUGIN_DIR: string = "";
  PLUGIN_ID: string = ""; // 플러그인 아이디
  PLUGIN_DIR: string = ""; // 플러그인 디렉토리
  PLUGIN_MANIFEST: string = ""; // 플러그인 디렉토리의 manifest.json
  PLUGIN_SETTINGS: string = "";  // 플러그인 디렉토리의 data.json
  PLUGIN_MODELS: string = "";  // 플러그인 디렉토리의 models.json
  PLUGIN_PROMPTS: string = "";  // 플러그인 디렉토리의 prompts.json
  PLUGIN_MODELPRICING: any = {}; // 플러그인 디렉토리의 model-pricing.json
  PLUGIN_SETTINGS_SCHEMA_VERSION = "1.0.1"; // 플러그인 설정 스키마 버전
  modelsJson: any = {}; // models.json
  
  modelsByCategory: Record<ModelCategory, ModelInfo> = {
        webModel: {},
        pdfModel: {},
        sttModel: {},
        transcriptSummaryModel: {},
        customModel: {}
  };

  defaultModelsByCategory: Record<ModelCategory, string> = {
    webModel: 'gpt-4.1-mini',
    pdfModel: 'gpt-4.1-mini',
    sttModel: 'whisper-1',
    transcriptSummaryModel: 'gpt-4.1-mini',
    customModel: 'gpt-4.1-mini'
  };

  defaultPrompts: DefaultPrompts = {
    webPrompt: "",
    pdfPrompt: "",
    sttPrompt: "",
    transcriptSummaryPrompt: "",
    refineSummaryPrompt: ""
  };

  dbManager: IndexedDBManager;
  modelPricing: any = {};
  
  private _needsSave: boolean = false; // 마이그레이션 후 저장 필요 여부

  // 로딩 표시기 표시
  private showLoadingNotice(message: string): any {
    const notice = document.createElement('div');
    notice.className = 'notice summar-loading-notice';
    notice.textContent = message;
    
    notice.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      padding: 12px 16px;
      font-size: 14px;
      color: var(--text-normal);
      z-index: 1000;
      box-shadow: var(--shadow-s);
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 300px;
    `;

    // 스피너 추가
    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 16px;
      height: 16px;
      border: 2px solid var(--background-modifier-border);
      border-top: 2px solid var(--text-accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;

    // 스피너 애니메이션 CSS 추가
    if (!document.getElementById('summar-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'summar-spinner-style';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    const messageEl = document.createElement('span');
    messageEl.textContent = message;
    
    notice.appendChild(spinner);
    notice.appendChild(messageEl);
    document.body.appendChild(notice);

    return {
      element: notice,
      setMessage: (newMessage: string) => {
        messageEl.textContent = newMessage;
      }
    };
  }

  // 로딩 표시기 숨기기
  private hideLoadingNotice(notice: any): void {
    if (notice && notice.element && notice.element.parentNode) {
      notice.element.parentNode.removeChild(notice.element);
    }
  }

  async onload() {
    // 플러그인 로딩 시작 즉시 로딩 표시기 표시 (가능한 가장 빠른 시점)
    const loadingNotice = this.showLoadingNotice("Initializing Summar plugin...");
    
    try {
      this.OBSIDIAN_PLUGIN_DIR = normalizePath("/.obsidian/plugins");
      this.PLUGIN_ID = this.manifest.id;
      this.PLUGIN_DIR = normalizePath(this.OBSIDIAN_PLUGIN_DIR + "/" + this.PLUGIN_ID);
      this.PLUGIN_MANIFEST = normalizePath(this.PLUGIN_DIR + "/manifest.json");

      this.PLUGIN_MODELS = normalizePath(this.PLUGIN_DIR + "/models.json");    
      // await this.loadModelsFromFile();

      this.PLUGIN_PROMPTS = normalizePath(this.PLUGIN_DIR + "/prompts.json");
      // await this.loadPromptsFromFile();

      this.PLUGIN_MODELPRICING = normalizePath(this.PLUGIN_DIR + "/model-pricing.json");
      // await this.loadModelPricingFromFile();

      this.PLUGIN_SETTINGS = normalizePath(this.PLUGIN_DIR + "/data.json");
      
      // Settings V2 Manager 초기화
      this.settingsv2 = new PluginSettingsV2(this.app, this.PLUGIN_ID);
      
      // 설정 로딩 상태 업데이트
      loadingNotice.setMessage("Loading plugin settings...");
      await new Promise(resolve => setTimeout(resolve, 0)); // UI thread 양보
      
      SummarDebug.initialize(3);
      await this.loadSettingsFromFile();
      SummarDebug.initialize(this.settingsv2.system.debugLevel);

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
      }, 1000 * 6); // 6s    

      SummarDebug.log(1, "Summar Plugin loaded");

      // UI 컴포넌트 초기화
      loadingNotice.setMessage("Setting up UI components...");
      await new Promise(resolve => setTimeout(resolve, 0)); // UI thread 양보

      this.summarSettingTab = new SummarSettingsTab(this);
      this.addSettingTab(this.summarSettingTab);
      // this.addSettingTab(new SummarSettingsTab(this));
      this.addRibbonIcon("scroll-text", "Open Summar View", this.activateView.bind(this));
      this.registerView(SummarView.VIEW_TYPE, (leaf) => new SummarView(leaf, this));

      // 핸들러 초기화
      loadingNotice.setMessage("Initializing handlers...");
      await new Promise(resolve => setTimeout(resolve, 0)); // UI thread 양보

      this.confluenceHandler = new ConfluenceHandler(this);
      this.pdfHandler = new PdfHandler(this);
      this.audioHandler = new AudioHandler(this);
      this.recordingManager = new AudioRecordingManager(this);
      this.commandHandler = new CustomCommandHandler(this);
      this.recordingStatus = new StatusBar(this);
      this.reservedStatus = new StatusBar(this,true);
      this.calendarHandler = new CalendarHandler(this);
      this.dailyNotesHandler = new DailyNotesHandler(this);

      // 데이터베이스 초기화
      loadingNotice.setMessage("Initializing database...");
      await new Promise(resolve => setTimeout(resolve, 0)); // UI thread 양보

      this.dbManager = new IndexedDBManager();
      await this.dbManager.init(this);

      const trackapi = new TrackedAPIClient(this);
      const updated = await trackapi.fixDB();

      // 완료 메시지 표시 후 로딩 표시기 숨기기
      loadingNotice.setMessage("Summar plugin loaded successfully!");
      
      // 마이그레이션이 필요했다면 설정 저장
      if (this._needsSave) {
        await this.saveSettingsToFile();
        this._needsSave = false;
        SummarDebug.log(1, "Settings saved after migration");
      }
      
      setTimeout(() => {
        this.hideLoadingNotice(loadingNotice);
      }, 1000);

    } catch (error) {
      SummarDebug.error(1, "Error during plugin initialization:", error);
      loadingNotice.setMessage("Failed to load Summar plugin");
      setTimeout(() => {
        this.hideLoadingNotice(loadingNotice);
      }, 3000);
      throw error;
    }

    const trackapi = new TrackedAPIClient(this);
    const updated = await trackapi.fixDB();


    if (Platform.isDesktopApp) {
      if (Platform.isWin) {
        SummarDebug.log(1, "Running on Windows Desktop");
      } else if (Platform.isMacOS) {
        SummarDebug.log(1, "Running on macOS Desktop");
      } else if (Platform.isLinux) {
        SummarDebug.log(1, "Running on Linux Desktop");
      }
    } else if (Platform.isMobileApp) {
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

          const parentFolderPath = normalizePath(file.path.substring(0, file.path.lastIndexOf("/")));
          const parentFolder = this.app.vault.getAbstractFileByPath(parentFolderPath);          
          if (this.audioHandler.isAudioOrWebmFile(file)) {
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
                      const { transcriptedText, newFilePath } = await this.audioHandler.sendAudioData(files, (parentFolder instanceof TFolder ? parentFolder.path : "") as string  );
                      SummarDebug.log(3, `transcripted text: ${transcriptedText}`);
                      const summarized = await this.recordingManager.summarize(transcriptedText, newFilePath);
                    }
                  } catch (error) {
                    SummarDebug.error(1, "Error handling file:", error);
                  }
                });
            });
          } else if (file.name.toLowerCase().includes(" transcript.md")) {
            menu.addItem((item) => {
              item
                .setTitle("Summarize meeting from transcript file")
                .setIcon("file")
                .onClick(async () => {
                  try {
                    // this.handleFileAction(file);
                    const files = await this.convertTFileToFileArray([file]);
                    SummarDebug.log(1, `File selected: ${file.path}`);
                    if (files && files.length > 0) {
                      this.activateView();
                      const transcriptedText = await this.app.vault.read(file);
                      const summarized = await this.recordingManager.summarize(transcriptedText, file.path );
                    }
                  } catch (error) {
                    SummarDebug.error(1, "Error handling file:", error);
                  }
                });
            });
          } else if (file.name.toLowerCase().includes(".pdf")) {
            menu.addItem((item) => {
              item
                .setTitle("Convert PDF to Markdown")
                .setIcon("file")
                .onClick(async () => {
                  try {
                    this.pdfHandler.convertToMarkdownFromPdf( await this.tfileToBrowserFile(file) );
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
                      file.name.toLowerCase().endsWith(".mp3") || // Include .mp3 files
                      file.name.toLowerCase().endsWith(".wav") || // Include .wav files
                      file.name.toLowerCase().endsWith(".ogg") || // Include .ogg files
                      file.name.toLowerCase().endsWith(".m4a") || // Include .m4a files
                      file.name.toLowerCase().endsWith(".webm") // Include .webm files
                    );
                  });

                  if (audioFiles.length === 0) {
                    SummarDebug.Notice(1, "No audio files found in the selected directory.");
                    return;
                  }

                  // Send all selected files to sendAudioData
                  this.activateView();
                  const { transcriptedText, newFilePath } = await this.audioHandler.sendAudioData(files, file.path);
                  SummarDebug.log(3, `transcripted text: ${transcriptedText}`);
                  const summarized = await this.recordingManager.summarize(transcriptedText, newFilePath);
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
            const { transcriptedText, newFilePath } = await this.audioHandler.sendAudioData(files);
            SummarDebug.log(3, `transcripted text: ${transcriptedText}`);
            const summarized = this.recordingManager.summarize(transcriptedText, newFilePath);
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
                file.name.toLowerCase().endsWith(".mp3") || // Include .mp3 files
                file.name.toLowerCase().endsWith(".wav") || // Include .wav files
                file.name.toLowerCase().endsWith(".webm") // Include .webm files
              );
            });

            if (audioFiles.length === 0) {
              SummarDebug.Notice(1, "No audio files found in the selected directory.");
              return;
            }

            // Send all selected files to sendAudioData
            const { transcriptedText, newFilePath } = await this.audioHandler.sendAudioData(files);
            SummarDebug.log(3, `transcripted text: ${transcriptedText}`);
            const summarized = this.recordingManager.summarize(transcriptedText, newFilePath);
          }
        };

        // Programmatically open the file dialog
        fileInput.click();
      },
    });

// if (this.settings.debugLevel > 0) {    
    // Summar stats 대시보드 커맨드 추가
    this.addCommand({
      id: "show-summar-stats",
      name: "Show Summar stats",
      callback: async () => {
        const modal = new SummarStatsModal(this);
        modal.open();
      },
    });
// }

    this.registerCustomCommandAndMenus();

    // 플러그인 로딩 시 Zoom 자동녹음 watcher 시작
    if (this.settingsv2.recording.autoRecordOnZoomMeeting) {
      this.recordingManager.startZoomAutoRecordWatcher();
    }
  }

  registerCustomCommandAndMenus() {
    this.unregisterCustomCommandAndMenus();

    const activeCommands = this.settingsv2.custom.command;
    for (let i = 0; i < activeCommands.length; i++) {
      const cmd = activeCommands[i];
      if (!cmd.text || cmd.text.trim() === "") continue;
      
      const cmdId = `custom-command-${i + 1}`;
      const cmdText = cmd.text;
      const cmdModel = cmd.model || 'gpt-4o';
      const cmdPrompt = cmd.prompt;
      const cmdHotkey = cmd.hotkey;

      const hotKey = parseHotkey(cmdHotkey);
      if (hotKey) {
        if (cmdId && cmdId.length > 0) {
          this.addCommand({
            id: cmdId,
            name: cmdText,
            checkCallback: (checking: boolean) => {
              const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
              if (editor) {
                if (!checking) {
                  let selectedText = editor.getSelection();
                  if (!selectedText) {
                    const cursor = editor.getCursor();
                    const lineText = editor.getLine(cursor.line);
                    editor.setSelection({ line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineText.length });
                    selectedText = editor.getSelection();
                  }
                  this.commandHandler.executePrompt(selectedText, cmdId);
                }
                return true;
              }
              return false;
            },
            hotkeys: [hotKey]
            // hotkeys: [{ modifiers: [], key: cmdHotkey }]
          });
          this.customCommandIds.push(cmdId);
        }
      } else {
        if (cmdId && cmdId.length > 0) {
          this.addCommand({
            id: cmdId,
            name: cmdText,
            checkCallback: (checking: boolean) => {
              const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
              if (editor) {
                if (!checking) {
                  let selectedText = editor.getSelection();
                  if (!selectedText) {
                    const cursor = editor.getCursor();
                    const lineText = editor.getLine(cursor.line);
                    editor.setSelection({ line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineText.length });
                    selectedText = editor.getSelection();
                  }
                  this.commandHandler.executePrompt(selectedText, cmdId);
                }
                return true;
              }
              return false;
            }
            // hotkeys: [{ modifiers: [], key: cmdHotkey }]
          });
          this.customCommandIds.push(cmdId);
        }      
      }
      
    }

    this.customCommandMenu = this.app.workspace.on('editor-menu', (menu, editor) => {
      const activeCommands = this.settingsv2.custom.command;
      for (let i = 0; i < activeCommands.length; i++) {
        const cmd = activeCommands[i];
        if (!cmd.text || cmd.text.trim() === "") continue;
        
        const cmdId = `custom-command-${i + 1}`;
        const cmdText = cmd.text;
        const cmdModel = cmd.model || 'gpt-4o';
        const cmdPrompt = cmd.prompt;

        if (cmdText && cmdText.length > 0) {
          menu.addItem((item) => {
            item.setTitle(cmdText)
              .onClick(() => {
                let selectedText = editor.getSelection();
                if (!selectedText) {
                  const cursor = editor.getCursor();
                  const lineText = editor.getLine(cursor.line);
                  editor.setSelection({ line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineText.length });
                  selectedText = editor.getSelection();
                }
                this.commandHandler.executePrompt(selectedText, cmdId);
              });
          });
        }
      }
    });
  }

  unregisterCustomCommandAndMenus() {
    this.customCommandIds.forEach(id => this.removeCommand(id));
    this.customCommandIds = [];

    if (this.customCommandMenu) {
      this.app.workspace.offref(this.customCommandMenu);
      this.customCommandMenu = null;
    }
  }

  async toggleRecording(): Promise<void> {
    if (this.recordingManager.getRecorderState() !== "recording") {
      await this.recordingManager.startRecording(this.settingsv2.recording.recordingUnit);
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
        const { transcriptedText, newFilePath } = await this.audioHandler.sendAudioData(files, recordingPath);
        SummarDebug.Notice(1, `Uploaded ${audioFiles.length} audio files successfully.`);
        SummarDebug.log(3, `transcripted text: ${transcriptedText}`);
        const summarized = await this.recordingManager.summarize(transcriptedText, newFilePath);
      } catch (error) {
        SummarDebug.error(0, "Error reading directory:", error);
        SummarDebug.Notice(1, "Failed to access the specified directory.");
      }
    }

  }

  public updateZoomAutoRecordWatcher() {
    if (this.settingsv2.recording.autoRecordOnZoomMeeting) {
      this.recordingManager.startZoomAutoRecordWatcher();
    } else {
      this.recordingManager.stopZoomAutoRecordWatcher();
    }
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(SummarView.VIEW_TYPE);
    this.recordingStatus.remove();
    this.reservedStatus.remove();

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



  async loadSettingsFromFile(): Promise<void> {
    // 필수 파일들을 먼저 로딩 (의존성 순서 보장)
    try {
      await this.loadModelsFromFile();
      await this.loadPromptsFromFile();
      await this.loadModelPricingFromFile();
    } catch (error) {
      SummarDebug.error(1, "Error loading essential files:", error);
      // 필수 파일 로딩 실패 시에도 기본 설정으로 계속 진행
    }

    let defaultSettings = this.settings;

    // V1 설정 파일 존재 여부 확인 및 V2로 마이그레이션
    if (await this.app.vault.adapter.exists(this.PLUGIN_SETTINGS)) {
      SummarDebug.log(1, "V1 Settings file exists, starting migration process:", this.PLUGIN_SETTINGS);
      
      try {
        const rawData = await this.app.vault.adapter.read(this.PLUGIN_SETTINGS);
        SummarDebug.log(2, `Raw settings data length: ${rawData.length} characters`);
        
        const settings = Object.assign({}, defaultSettings, JSON.parse(rawData)) as PluginSettings;
        SummarDebug.log(2, `Loaded settingsSchemaVersion: "${settings.settingsSchemaVersion}"`);
        
        const domain = extractDomain(settings.confluenceDomain);
        if (domain) {
          settings.confluenceDomain = domain;
        } else {
          settings.confluenceDomain = "";
        }
        
        // 스키마 버전 비교 - 더 안전한 방식으로 개선
        const currentSchemaVersion = this.PLUGIN_SETTINGS_SCHEMA_VERSION;
        const savedSchemaVersion = settings.settingsSchemaVersion || '';
        
        SummarDebug.log(1, `Schema version comparison: current="${currentSchemaVersion}", saved="${savedSchemaVersion}"`);
        
        let needsMigration = false;
        
        // 1. 빈 문자열인 경우 (1.0.0 이전 버전)
        if (savedSchemaVersion === '') {
          SummarDebug.log(1, "Empty schema version detected - migration needed");
          needsMigration = true;
        }
        // 2. semver 비교 전 유효성 검사
        else {
          try {
            // semver.valid()로 유효한 버전인지 먼저 확인
            if (!semver.valid(savedSchemaVersion)) {
              SummarDebug.log(1, `Invalid saved schema version: "${savedSchemaVersion}" - treating as migration needed`);
              needsMigration = true;
            } else if (!semver.valid(currentSchemaVersion)) {
              SummarDebug.error(1, `Invalid current schema version: "${currentSchemaVersion}" - skipping migration`);
              needsMigration = false;
            } else {
              // 둘 다 유효한 버전인 경우에만 비교
              needsMigration = semver.gt(currentSchemaVersion, savedSchemaVersion);
              SummarDebug.log(1, `Schema version comparison result: needsMigration=${needsMigration}`);
            }
          } catch (semverError) {
            SummarDebug.error(1, `Semver comparison error: ${semverError}. Saved: "${savedSchemaVersion}", Current: "${currentSchemaVersion}"`);
            // semver 에러 발생 시 안전하게 문자열 비교로 fallback
            needsMigration = savedSchemaVersion !== currentSchemaVersion;
          }
        }
        
        if (needsMigration) {
          SummarDebug.log(1, `Performing V1 settings migration from "${savedSchemaVersion}" to "${currentSchemaVersion}"`);
          
          if (savedSchemaVersion === '') {
            // 1.0.0 이전 버전의 설정 파일을 읽는 경우, 필요한 변환 작업을 수행합니다.
            settings.saveTranscriptAndRefineToNewNote = settings.recordingResultNewNote;
            settings.sttModel = settings.transcriptSTT;
            settings.sttPrompt = settings.transcribingPrompt;
            settings.transcriptSummaryModel = settings.transcriptModel;
            settings.transcriptSummaryPrompt = settings.recordingPrompt;
            settings.refineSummaryPrompt = settings.refiningPrompt;
          }
          
          // 이전 버전의 설정들을 정리
          settings.recordingResultNewNote = false; // 이전 버전의 설정을 제거합니다.
          settings.transcriptSTT = ""; // 이전 버전의 설정을 제거합니다.
          settings.transcribingPrompt = ""; // 이전 버전의 설정을 제거합니다.
          settings.transcriptModel = ""; // 이전 버전의 설정을 제거합니다.
          settings.recordingPrompt = ""; // 이전 버전의 설정을 제거합니다.
          settings.refiningPrompt = ""; // 이전 버전의 설정을 제거합니다.
          settings.systemPrompt = ""; // 이전 버전의 설정을 제거합니다.
          settings.userPrompt = ""; // 이전 버전의 설정을 제거합니다. 
          settings.confluenceBaseUrl = ""; // 이전 버전의 설정을 제거합니다.
          settings.autoRecording = false; // 이전 버전의 설정을 제거합니다.
          settings.resultNewNote = false; // 이전 버전의 설정을 제거합니다.
          settings.transcriptEndpoint = ""; // 이전 버전의 설정을 제거합니다.
          settings.calendar_zoom_only = false; // 이전 버전의 설정을 제거합니다.
  
          settings.settingsSchemaVersion = currentSchemaVersion;
          
          SummarDebug.log(1, `V1 settings migration completed. New schema version: ${settings.settingsSchemaVersion}`);
          // 마이그레이션 완료 후 저장은 onload가 완료된 후에 수행하도록 플래그 설정
          this._needsSave = true;
        } else {
          SummarDebug.log(1, "No V1 settings migration needed - versions match");
        }
        
        // V1 설정 마이그레이션 완료 후 V2로 마이그레이션
        SummarDebug.log(1, "Starting migration from V1 to V2");
        await this.settingsv2.migrateFromV1(settings);
        
        // 마이그레이션된 V2 설정 저장
        await this.settingsv2.saveSettings();
        // settingsv2는 이미 Manager의 내부 설정 객체 참조
        
        // V2 마이그레이션 성공 후 V1 설정 파일을 백업 파일로 이름 변경
        try {
          const oldSettingsPath = normalizePath(this.PLUGIN_DIR + "/data-v1.json");
          await this.app.vault.adapter.rename(this.PLUGIN_SETTINGS, oldSettingsPath);
          SummarDebug.log(1, `V1 settings file renamed from data.json to data-v1.json`);
        } catch (renameError) {
          SummarDebug.error(1, "Failed to rename V1 settings file to data-v1.json:", renameError);
          // 파일 이름 변경 실패는 치명적이지 않으므로 계속 진행
        }
        
        SummarDebug.log(1, "Migration from V1 to V2 completed and saved");
        
        // return settings;
        return;
      } catch (error) {
        SummarDebug.error(1, "Error reading V1 settings file or during migration:", error);
        // 에러 발생 시 V2 설정 기본값 로드
        await this.settingsv2.loadSettings(); // 기본값으로 초기화
        // return defaultSettings;
        return;
      }
    } else {
      // V1 설정 파일이 없으면 V2 설정 로드 시도
      SummarDebug.log(1, "V1 Settings file does not exist, loading V2 settings");
      await this.settingsv2.loadSettings(); // V2 설정 로드
      
      // 설정 동기화 상태 검증
      this.settingsv2.validateSync();
    }
    
    // return defaultSettings;
  }

  async saveSettingsToFile(): Promise<void> {
    await this.settingsv2.saveSettings();
  }

  async loadModelsFromFile(): Promise<void> {
    if (await this.app.vault.adapter.exists(this.PLUGIN_MODELS)) {
      SummarDebug.log(1, "Models file exists:", this.PLUGIN_MODELS);
    } else {
      SummarDebug.log(1, "Models file does not exist:", this.PLUGIN_MODELS);
      return; // 파일이 없으면 기본값 사용
    }

    try {
      SummarDebug.log(1, "Reading models from models.json");
      const modelDataJson = await this.app.vault.adapter.read(this.PLUGIN_MODELS);
      const modelData = JSON.parse(modelDataJson) as ModelData;
      this.modelsJson = modelData; // 파싱된 객체를 저장
      SummarDebug.log(3, `loadModelsFromFile()\n${JSON.stringify(this.modelsJson)}`);

      if (modelData.model_list) {
        const categories: ModelCategory[] = ['webModel', 'pdfModel', 'sttModel', 'transcriptSummaryModel', 'customModel'];

        for (const category of categories) {
          if (modelData.model_list[category]) {
            const modelsList = modelData.model_list[category].models;
            if (modelsList && typeof modelsList === 'object') {
              this.modelsByCategory[category] = modelsList as ModelInfo;
            }              
            if (modelData.model_list[category].default) {
              this.defaultModelsByCategory[category] = modelData.model_list[category].default;
            }
            SummarDebug.log(1, `${category} loaded:`, Object.keys(this.modelsByCategory[category]).length, `(default: ${this.defaultModelsByCategory[category]})`);
          }
        }

        // 기본 모델은 settings가 비어있을 때만 설정 (사용자 설정 덮어쓰기 방지)
        if (!this.settings.webModel) {
          this.settings.webModel = this.getDefaultModel('webModel');
        }
        if (!this.settings.pdfModel) {
          this.settings.pdfModel = this.getDefaultModel('pdfModel');
        }
        if (!this.settings.sttModel) {
          this.settings.sttModel = this.getDefaultModel('sttModel');
        }
        if (!this.settings.transcriptSummaryModel) {
          this.settings.transcriptSummaryModel = this.getDefaultModel('transcriptSummaryModel');
        }
        if (!this.settings.customModel) {
          this.settings.customModel = this.getDefaultModel('customModel');
        }

        // V2 설정에도 기본 모델 설정 (비어있을 때만)
        if (!this.settingsv2.web.webModel) {
          this.settingsv2.web.webModel = this.getDefaultModel('webModel');
        }
        if (!this.settingsv2.pdf.pdfModel) {
          this.settingsv2.pdf.pdfModel = this.getDefaultModel('pdfModel');
        }
        if (!this.settingsv2.recording.sttModel) {
          this.settingsv2.recording.sttModel = this.getDefaultModel('sttModel');
        }
        if (!this.settingsv2.recording.transcriptSummaryModel) {
          this.settingsv2.recording.transcriptSummaryModel = this.getDefaultModel('transcriptSummaryModel');
        }
      }
    } catch (error) {
      SummarDebug.error(1, "Error reading models file:", error);
      // 에러 시에도 기본값은 사용 가능하도록 유지
    }
  }

  getDefaultModel(category: ModelCategory): string {
    return this.defaultModelsByCategory[category];
  }

  getModelsByCategory(category: ModelCategory): ModelInfo {
    return this.modelsByCategory[category] || {};
  }

  getModelValueByKey(category: ModelCategory, key: string): string | undefined {
      const models = this.modelsByCategory[category] || {};
      return models[key];
  }  
  
  getModelKeysByCategory(category: ModelCategory): string[] {
    return Object.keys(this.modelsByCategory[category] || {});
  }

  getAllModelKeyValues(category: ModelCategory): Record<string, string> {
    const models = this.modelsByCategory[category] || {};
    return { ...models }; 
  }

  async loadPromptsFromFile(): Promise<void> {
    if (await this.app.vault.adapter.exists(this.PLUGIN_PROMPTS)) {
      SummarDebug.log(1, "Prompts file exists:", this.PLUGIN_PROMPTS);
    } else {
      SummarDebug.log(1, "Prompts file does not exist:", this.PLUGIN_PROMPTS);
      return; // 파일이 없으면 기본값 사용
    }

    try {
      SummarDebug.log(1, "Reading prompts from prompts.json");
      const promptDataJson = await this.app.vault.adapter.read(this.PLUGIN_PROMPTS);
      const promptData = JSON.parse(promptDataJson) as PromptData;
      
      if (promptData.default_prompts && promptData.default_prompts.ko) {
        // defaultPrompts에 저장 (참조용)
        this.defaultPrompts.webPrompt = promptData.default_prompts.ko.webPrompt.join("\n");
        this.defaultPrompts.pdfPrompt = promptData.default_prompts.ko.pdfPrompt.join("\n");
        this.defaultPrompts.sttPrompt = promptData.default_prompts.ko.sttPrompt.join("\n");
        this.defaultPrompts.transcriptSummaryPrompt = promptData.default_prompts.ko.transcriptSummaryPrompt.join("\n");
        this.defaultPrompts.refineSummaryPrompt = promptData.default_prompts.ko.refineSummaryPrompt.join("\n");

        // settings는 비어있을 때만 설정 (사용자 설정 덮어쓰기 방지)
        if (!this.settings.webPrompt) {
          this.settings.webPrompt = this.defaultPrompts.webPrompt;
        }
        if (!this.settings.pdfPrompt) {
          this.settings.pdfPrompt = this.defaultPrompts.pdfPrompt;
        }
        if (!this.settings.sttPrompt) {
          this.settings.sttPrompt = this.defaultPrompts.sttPrompt;
        }
        if (!this.settings.transcriptSummaryPrompt) {
          this.settings.transcriptSummaryPrompt = this.defaultPrompts.transcriptSummaryPrompt;
        }
        if (!this.settings.refineSummaryPrompt) {
          this.settings.refineSummaryPrompt = this.defaultPrompts.refineSummaryPrompt;
        }

        // V2 설정에도 기본 프롬프트 설정 (비어있을 때만)
        if (!this.settingsv2.web.webPrompt) {
          this.settingsv2.web.webPrompt = this.defaultPrompts.webPrompt;
        }
        if (!this.settingsv2.pdf.pdfPrompt) {
          this.settingsv2.pdf.pdfPrompt = this.defaultPrompts.pdfPrompt;
        }
        if (!this.settingsv2.recording.sttPrompt) {
          this.settingsv2.recording.sttPrompt = this.defaultPrompts.sttPrompt;
        }
        if (!this.settingsv2.recording.transcriptSummaryPrompt) {
          this.settingsv2.recording.transcriptSummaryPrompt = this.defaultPrompts.transcriptSummaryPrompt;
        }
        if (!this.settingsv2.recording.refineSummaryPrompt) {
          this.settingsv2.recording.refineSummaryPrompt = this.defaultPrompts.refineSummaryPrompt;
        }
        
        SummarDebug.log(1, "Prompts loaded successfully");
      } else {
        SummarDebug.error(1, "default_prompts or ko language not found in prompts.json");
      }
    } catch (error) {
      SummarDebug.error(1, "Error reading prompts file:", error);
    }
  }

  async loadModelPricingFromFile(): Promise<void> {
    if (await this.app.vault.adapter.exists(this.PLUGIN_MODELPRICING)) {
      SummarDebug.log(1, "Model pricing file exists:", this.PLUGIN_MODELPRICING);
    } else {
      SummarDebug.log(1, "Model pricing file does not exist:", this.PLUGIN_MODELPRICING);
      return; // 파일이 없으면 빈 객체 사용
    }

    try {
      SummarDebug.log(1, "Reading model pricing from model-pricing.json");
      const modelPricingJson = await this.app.vault.adapter.read(this.PLUGIN_MODELPRICING);
      this.modelPricing = JSON.parse(modelPricingJson);
      SummarDebug.log(1, "Model pricing loaded successfully");
    } catch (error) {
      SummarDebug.error(1, "Error reading model pricing file:", error);
      this.modelPricing = {};
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
  async tfileToBrowserFile(tfile: TFile): Promise<File> {
    // Read the file as ArrayBuffer from the vault
    const arrayBuffer = await this.app.vault.adapter.readBinary(tfile.path);
    // Guess the MIME type (optional, you can use a library or default to 'application/octet-stream')
    const mimeType = "application/pdf"; // or use a function to detect based on extension
    // Create a browser File object
    return new File([arrayBuffer], tfile.name, { type: mimeType });
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

        // Enter 키를 누르면 OK 버튼 핸들러 실행 (OK 버튼을 default로 설정)
        input.addEventListener("keydown", (evt: KeyboardEvent) => {
          if (evt.key === "Enter") {
            evt.preventDefault();
            okButtonHandler();
          }
        });
      });

    // 확인 및 취소 버튼
    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText("OK")
          .setCta()
          .onClick(() => {
            okButtonHandler();
          });
        // OK 버튼의 배경색을 빨간색으로 설정
        // btn.buttonEl.style.backgroundColor = "red";
      })
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




