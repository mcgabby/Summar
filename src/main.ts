import { App, Plugin, Setting, Platform, Menu, TFile, TFolder, Modal, normalizePath, MarkdownView, Stat } from "obsidian";
import { PluginSettings, ModelCategory, ModelInfo, ModelData, PromptData, LangPromptData } from "./types";
import { SummarDebug, extractDomain, parseHotkey } from "./globals";
import { PluginUpdater } from "./pluginupdater";
import { SummarView } from "./summarview"
import { SummarSettingsTab } from "./summarsettingtab";
import { ConfluenceHandler } from "./confluencehandler";
import { PdfHandler } from "./pdfhandler";
import { AudioHandler } from "./audiohandler";
import { AudioRecordingManager } from "./recordingmanager";
import { CustomCommandHandler } from "./customcommandhandler";
import { CalendarHandler } from "./calendarhandler";
import { StatusBar } from "./statusbar";


export default class SummarPlugin extends Plugin {
  settings: PluginSettings = {
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
    webPrompt: "",
    pdfPrompt: "",
    webModel: "",
    pdfModel: "",
    
    transcriptSTT: "",
    transcribingPrompt: "",
    transcriptModel: "",
    
    selectedDeviceId: "",
    recordingDir: "",
    recordingUnit: 15,
    recordingLanguage: "ko-KR",
    recordingPrompt: "",
    recordingResultNewNote: true,
    refineSummary: true,
    refiningPrompt: "",
    
    testUrl: "",
    debugLevel: 0,
    
    cmd_max: 10,
    cmd_count: 0,
    
    calendar_count: 0,
    calendar_fetchdays: 1,
    calendar_polling_interval: 600000,
    calendar_zoom_only: false,
    autoRecording: false,
    autoRecordOnZoomMeeting: false
  };

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
  
  modelsByCategory: Record<ModelCategory, ModelInfo> = {
        webpage: {},
        pdf: {},
        speech_to_text: {},
        transcription: {},
        custom: {}
  };

  defaultModelsByCategory: Record<ModelCategory, string> = {
    webpage: 'gpt-4o',
    pdf: 'gpt-4o',
    speech_to_text: 'whisper-1',
    transcription: 'gpt-4o',
    custom: 'gpt-4o'
  };

  defaultPrompts: LangPromptData = {};

  async onload() {
    this.OBSIDIAN_PLUGIN_DIR = normalizePath("/.obsidian/plugins");
    this.PLUGIN_ID = this.manifest.id;
    this.PLUGIN_DIR = normalizePath(this.OBSIDIAN_PLUGIN_DIR + "/" + this.PLUGIN_ID);
    this.PLUGIN_MANIFEST = normalizePath(this.PLUGIN_DIR + "/manifest.json");

    this.PLUGIN_MODELS = normalizePath(this.PLUGIN_DIR + "/models.json");    
    await this.loadModelsFromFile();

    this.PLUGIN_PROMPTS = normalizePath(this.PLUGIN_DIR + "/prompts.json");
    await this.loadPromptsFromFile();
    
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
    }, 1000 * 6); // 6s    

    SummarDebug.log(1, "Summar Plugin loaded");

    this.summarSettingTab = new SummarSettingsTab(this);
    this.addSettingTab(this.summarSettingTab);
    // this.addSettingTab(new SummarSettingsTab(this));
    this.addRibbonIcon("scroll-text", "Open Summar View", this.activateView.bind(this));
    this.registerView(SummarView.VIEW_TYPE, (leaf) => new SummarView(leaf, this));

    this.confluenceHandler = new ConfluenceHandler(this);
    this.pdfHandler = new PdfHandler(this);
    this.audioHandler = new AudioHandler(this);
    this.recordingManager = new AudioRecordingManager(this);
    this.commandHandler = new CustomCommandHandler(this);
    this.recordingStatus = new StatusBar(this);
    this.reservedStatus = new StatusBar(this,true);
    this.calendarHandler = new CalendarHandler(this);


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
                      const { transcriptedText, newFilePath } = await this.audioHandler.sendAudioData(files);
                      SummarDebug.log(3, `transcripted text: ${transcriptedText}`);
                      const summarized = await this.recordingManager.summarize(transcriptedText, newFilePath);
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

    this.registerCustomCommandAndMenus();

    // 플러그인 로딩 시 Zoom 자동녹음 watcher 시작
    if (this.settings.autoRecordOnZoomMeeting) {
      this.recordingManager.startZoomAutoRecordWatcher();
    }
  }

  registerCustomCommandAndMenus() {
    this.unregisterCustomCommandAndMenus();


    for (let i = 1; i <= this.settings.cmd_count; i++) {
      const cmdId = `custom-command-${i}`;
      const cmdText = this.settings[`cmd_text_${i}`] as string;
      const cmdModel = this.settings[`cmd_model_${i}`] as string || 'gpt-4o';
      const cmdPrompt = this.settings[`cmd_prompt_${i}`] as string;
      const cmdHotkey = this.settings[`cmd_hotkey_${i}`] as string;

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
      for (let i = 1; i <= this.settings.cmd_count; i++) {
        const cmdId = `custom-command-${i}`; // cmdId 정의 변경
        const cmdText = this.settings[`cmd_text_${i}`] as string;
        const cmdModel = this.settings[`cmd_model_${i}`] as string || 'gpt-4o';
        const cmdPrompt = this.settings[`cmd_prompt_${i}`] as string;

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
    if (this.settings.autoRecordOnZoomMeeting) {
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



  async loadSettingsFromFile(): Promise<PluginSettings> {
    let defaultSettings = this.settings;

    if (await this.app.vault.adapter.exists(this.PLUGIN_SETTINGS)) {
      SummarDebug.log(1, "Settings file exists:", this.PLUGIN_SETTINGS);
    } else {
      SummarDebug.log(1, "Settings file does not exist:", this.PLUGIN_SETTINGS);
    }
    if (await this.app.vault.adapter.exists(this.PLUGIN_SETTINGS)) {
      SummarDebug.log(1, "Reading settings from data.json");
      try {
        const rawData = await this.app.vault.adapter.read(this.PLUGIN_SETTINGS);
        const settings = Object.assign({}, defaultSettings, JSON.parse(rawData)) as PluginSettings;
        const domain = extractDomain(settings.confluenceDomain);
        if (domain) {
          settings.confluenceDomain = domain;
        } else {
          settings.confluenceDomain = "";
        }
        return settings;
      } catch (error) {
        SummarDebug.log(1, "Error reading settings file:", error);
        return defaultSettings;
      }
    }
    return defaultSettings;
  }

  async saveSettingsToFile(): Promise<void> {
    try {
      await this.app.vault.adapter.mkdir(this.PLUGIN_DIR);
      await this.app.vault.adapter.write(this.PLUGIN_SETTINGS, JSON.stringify(this.settings, null, 2));
      SummarDebug.log(1, "Settings saved to data.json");
    } catch (error) {
      SummarDebug.error(1, "Error saving settings file:", error);
    }
  }

  async loadModelsFromFile(): Promise<void> {
    if (await this.app.vault.adapter.exists(this.PLUGIN_MODELS)) {
      SummarDebug.log(1, "Settings file exists:", this.PLUGIN_MODELS);
    } else {
      SummarDebug.log(1, "Settings file does not exist:", this.PLUGIN_MODELS);
    }

    if (await this.app.vault.adapter.exists(this.PLUGIN_MODELS)) {
      SummarDebug.log(1, "Reading settings from data.json");
      try {
        const modelDataJson = await this.app.vault.adapter.read(this.PLUGIN_MODELS);
        const modelData = JSON.parse(modelDataJson) as ModelData;

        if (modelData.model_list) {
          const categories: ModelCategory[] = ['webpage', 'pdf', 'speech_to_text', 'transcription', 'custom'];

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

          this.settings.webModel = this.getDefaultModel('webpage');
          this.settings.pdfModel = this.getDefaultModel('pdf');
          this.settings.transcriptSTT = this.getDefaultModel('speech_to_text');
          this.settings.transcriptModel = this.getDefaultModel('transcription');
          this.settings.customModel = this.getDefaultModel('custom');
        }
        // return { models: defaultModels, defaults: defaultValues };
      } catch (error) {
        SummarDebug.log(1, "Error reading settings file:", error);
        // return { models: defaultModels, defaults: defaultValues };
      }
   }
  //  return { models: defaultModels, defaults: defaultValues };
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
      SummarDebug.log(1, "Settings file exists:", this.PLUGIN_PROMPTS);
    } else {
      SummarDebug.log(1, "Settings file does not exist:", this.PLUGIN_PROMPTS);
    }

    if (await this.app.vault.adapter.exists(this.PLUGIN_PROMPTS)) {
      SummarDebug.log(1, "Reading settings from data.json");
      try {
        const promptDataJson = await this.app.vault.adapter.read(this.PLUGIN_PROMPTS);
        const promptData = JSON.parse(promptDataJson) as PromptData;
        if (promptData.default_prompts) {
          // console.log("=======\ndefault_prompts loaded");
          this.defaultPrompts = promptData.default_prompts;
          this.settings.webPrompt = this.defaultPrompts.ko.web.join("\n");
          this.settings.pdfPrompt = this.defaultPrompts.ko.pdf.join("\n");
          this.settings.recordingPrompt = this.defaultPrompts.ko.transcription.join("\n");
          this.settings.refiningPrompt = this.defaultPrompts.ko.refininement.join("\n");
          // console.log(`setting.webPrompt: \n${this.settings.webPrompt}`);
          // console.log(`setting.pdfPrompt: \n${this.settings.pdfPrompt}`);
          // console.log(`setting.recordingPrompt: \n${this.settings.recordingPrompt}`);
          // console.log(`setting.refiningPrompt: \n${this.settings.refiningPrompt}`);
        }
        else {
          console.log("=======\ndefault_prompts not found");
        }

        SummarDebug.log(1, "Prompts loaded successfully");
      } catch (error) {
        SummarDebug.log(1, "Error reading settings file:", error);
      }
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




