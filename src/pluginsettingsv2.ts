import { App, normalizePath } from "obsidian";
import { SummarDebug } from "./globals";

// 커스텀 명령어 인터페이스
export interface CustomCommand {
  text: string;
  prompt: string;
  model: string;
  hotkey: string;
  appendToNote: boolean;
  copyToClipboard: boolean;
}

// 새로운 플러그인 설정 구조 v2.0 (매니저 통합)
export class PluginSettingsV2 {
  private app: App;
  private pluginId: string;
  private settingsPath: string;

  // 설정 데이터 구조
  schemaVersion: string = "2.0.0";
  common: {
    openaiApiKey: string;
    openaiApiEndpoint: string;
    googleApiKey: string;
    useConfluenceAPI: boolean;
    confluenceApiToken: string;
    confluenceDomain: string;
    confluenceParentPageUrl: string;
    confluenceParentPageSpaceKey: string;
    confluenceParentPageId: string;
  } = {
    openaiApiKey: "",
    openaiApiEndpoint: "",
    googleApiKey: "",
    useConfluenceAPI: true,
    confluenceApiToken: "",
    confluenceDomain: "",
    confluenceParentPageUrl: "",
    confluenceParentPageSpaceKey: "",
    confluenceParentPageId: ""
  };
  
  web: {
    webModel: string;
    webPrompt: string;
  } = {
    webModel: "",
    webPrompt: ""
  };
  
  pdf: {
    pdfModel: string;
    pdfPrompt: string;
  } = {
    pdfModel: "",
    pdfPrompt: ""
  };
  
  recording: {
    autoRecordOnZoomMeeting: boolean;
    selectedDeviceId: { [deviceKey: string]: string };
    recordingDir: string;
    saveTranscriptAndRefineToNewNote: boolean;
    addLinkToDailyNotes: boolean;
    recordingUnit: number;
    recordingLanguage: string;
    sttModel: string;
    sttPrompt: { [modelKey: string]: string };
    transcriptSummaryModel: string;
    transcriptSummaryPrompt: string;
    refineSummary: boolean;
    refineSummaryPrompt: string;
  } = {
    autoRecordOnZoomMeeting: false,
    selectedDeviceId: {},
    recordingDir: "",
    saveTranscriptAndRefineToNewNote: true,
    addLinkToDailyNotes: true,
    recordingUnit: 15,
    recordingLanguage: "ko-KR",
    sttModel: "",
    sttPrompt: {
      "gpt-4o-transcribe": "",
      "gpt-4o-mini-transcribe": ""
    },
    transcriptSummaryModel: "",
    transcriptSummaryPrompt: "",
    refineSummary: true,
    refineSummaryPrompt: ""
  };
  
  custom: {
    max: number;
    command: CustomCommand[];
  } = {
    max: 10,
    command: []
  };
  
  schedule: {
    calendar_fetchdays: number;
    calendar_polling_interval: number;
    autoLaunchZoomOnSchedule: boolean;
    autoLaunchZoomOnlyAccepted: boolean;
    calendarName: string[];
  } = {
    calendar_fetchdays: 1,
    calendar_polling_interval: 600000,
    autoLaunchZoomOnSchedule: false,
    autoLaunchZoomOnlyAccepted: true,
    calendarName: []
  };
  
  system: {
    debugLevel: number;
    testUrl: string;
  } = {
    debugLevel: 0,
    testUrl: ""
  };

  constructor(app: App, pluginId: string) {
    this.app = app;
    this.pluginId = pluginId;
    this.settingsPath = normalizePath(`/.obsidian/plugins/${pluginId}/data-v2.json`);
  }

  /**
   * 기본 설정값으로 초기화합니다
   */
  private resetToDefaults(): void {
    this.schemaVersion = "2.0.0";
    
    // Common 섹션 초기화
    Object.assign(this.common, {
      openaiApiKey: "",
      openaiApiEndpoint: "",
      googleApiKey: "",
      useConfluenceAPI: true,
      confluenceApiToken: "",
      confluenceDomain: "",
      confluenceParentPageUrl: "",
      confluenceParentPageSpaceKey: "",
      confluenceParentPageId: ""
    });

    // Web 섹션 초기화
    Object.assign(this.web, {
      webModel: "",
      webPrompt: ""
    });

    // PDF 섹션 초기화
    Object.assign(this.pdf, {
      pdfModel: "",
      pdfPrompt: ""
    });

    // Recording 섹션 초기화
    Object.assign(this.recording, {
      autoRecordOnZoomMeeting: false,
      selectedDeviceId: {},
      recordingDir: "",
      saveTranscriptAndRefineToNewNote: true,
      addLinkToDailyNotes: true,
      recordingUnit: 15,
      recordingLanguage: "ko-KR",
      sttModel: "",
      sttPrompt: {},
      transcriptSummaryModel: "",
      transcriptSummaryPrompt: "",
      refineSummary: true,
      refineSummaryPrompt: ""
    });

    // Custom 섹션 초기화
    Object.assign(this.custom, {
      max: 10,
      command: []
    });

    // Schedule 섹션 초기화
    Object.assign(this.schedule, {
      calendar_fetchdays: 1,
      calendar_polling_interval: 600000,
      autoLaunchZoomOnSchedule: false,
      autoLaunchZoomOnlyAccepted: true,
      calendarName: []
    });

    // System 섹션 초기화
    Object.assign(this.system, {
      debugLevel: 0,
      testUrl: ""
    });
  }

  /**
   * 설정 파일을 로드합니다
   */
  async loadSettings(): Promise<PluginSettingsV2> {
    try {
      if (await this.app.vault.adapter.exists(this.settingsPath)) {
        SummarDebug.log(1, `Loading settings from: ${this.settingsPath}`);
        
        const rawData = await this.app.vault.adapter.read(this.settingsPath);
        const loadedSettings = JSON.parse(rawData) as Partial<PluginSettingsV2>;
        
        // 로드된 설정을 현재 객체에 병합
        this.mergeWithLoaded(loadedSettings);
        
        SummarDebug.log(1, `Settings loaded successfully. Schema version: ${this.schemaVersion}`);
        return this;
      } else {
        SummarDebug.log(1, `Settings file not found: ${this.settingsPath}. Using default settings.`);
        this.resetToDefaults();
        return this;
      }
    } catch (error) {
      SummarDebug.error(1, "Error loading settings:", error);
      this.resetToDefaults();
      return this;
    }
  }

  /**
   * 로드된 설정을 현재 객체에 병합합니다
   */
  private mergeWithLoaded(loaded: Partial<PluginSettingsV2>): void {
    if (loaded.schemaVersion) this.schemaVersion = loaded.schemaVersion;
    
    if (loaded.common) {
      Object.assign(this.common, loaded.common);
    }
    
    if (loaded.web) {
      Object.assign(this.web, loaded.web);
    }
    
    if (loaded.pdf) {
      Object.assign(this.pdf, loaded.pdf);
    }
    
    if (loaded.recording) {
      Object.assign(this.recording, loaded.recording);
    }
    
    if (loaded.custom) {
      if (loaded.custom.max !== undefined) {
        this.custom.max = loaded.custom.max;
      }
      if (loaded.custom.command && Array.isArray(loaded.custom.command)) {
        // 로드된 커스텀 명령어 배열을 그대로 사용 (필터링하여 유효한 것만)
        this.custom.command = loaded.custom.command.filter(cmd => 
          cmd && typeof cmd === 'object' && cmd.text !== undefined
        ).map(cmd => ({
          text: cmd.text || "",
          prompt: cmd.prompt || "",
          model: cmd.model || "",
          hotkey: cmd.hotkey || "",
          appendToNote: cmd.appendToNote || false,
          copyToClipboard: cmd.copyToClipboard || false
        }));
      }
    }
    
    if (loaded.schedule) {
      Object.assign(this.schedule, loaded.schedule);
      if (loaded.schedule.calendarName && Array.isArray(loaded.schedule.calendarName)) {
        // 로드된 캘린더 이름 배열을 그대로 사용 (빈 문자열 제거)
        this.schedule.calendarName = loaded.schedule.calendarName.filter(name => 
          name && typeof name === 'string' && name.trim() !== ""
        );
      }
    }
    
    if (loaded.system) {
      Object.assign(this.system, loaded.system);
    }
  }

  /**
   * 설정을 파일에 저장합니다
   */
  async saveSettings(): Promise<void> {
    try {
      const pluginDir = normalizePath(`/.obsidian/plugins/${this.pluginId}`);
      await this.app.vault.adapter.mkdir(pluginDir);
      
      // 순환 참조를 피하기 위해 설정 데이터만 추출
      const settingsData = {
        schemaVersion: this.schemaVersion,
        common: this.common,
        web: this.web,
        pdf: this.pdf,
        recording: this.recording,
        custom: this.custom,
        schedule: this.schedule,
        system: this.system
      };
      
      const jsonData = JSON.stringify(settingsData, null, 2);
      await this.app.vault.adapter.write(this.settingsPath, jsonData);
      
      SummarDebug.log(1, `Settings saved to: ${this.settingsPath}`);
    } catch (error) {
      SummarDebug.error(1, "Error saving settings:", error);
      throw error;
    }
  }

  /**
   * 현재 설정을 반환합니다 (자기 자신 반환)
   */
  getSettings(): PluginSettingsV2 {
    return this;
  }

  /**
   * 설정을 업데이트합니다
   */
  updateSettings(newSettings: Partial<PluginSettingsV2>): void {
    this.mergeWithLoaded(newSettings);
  }

  /**
   * 특정 섹션의 설정을 업데이트합니다
   */
  updateSection<T extends keyof Omit<PluginSettingsV2, 'app' | 'pluginId' | 'settingsPath'>>(
    section: T, 
    sectionData: Partial<PluginSettingsV2[T]>
  ): void {
    if (typeof this[section] === 'object' && this[section] !== null) {
      Object.assign(this[section], sectionData);
    }
  }

  /**
   * 커스텀 명령어를 추가합니다
   */
  addCustomCommand(command: CustomCommand): boolean {
    const activeCommands = this.getActiveCustomCommands();
    if (activeCommands.length >= this.custom.max) {
      SummarDebug.log(1, `Cannot add command: maximum limit (${this.custom.max}) reached`);
      return false;
    }

    // 배열에 새 명령어 추가
    this.custom.command.push({ ...command });
    SummarDebug.log(1, `Custom command added at index ${this.custom.command.length - 1}`);
    return true;
  }

  /**
   * 커스텀 명령어를 제거합니다
   */
  removeCustomCommand(index: number): boolean {
    if (index >= 0 && index < this.custom.command.length) {
      this.custom.command.splice(index, 1);
      SummarDebug.log(1, `Custom command removed at index ${index}`);
      return true;
    }
    return false;
  }

  /**
   * 활성화된 커스텀 명령어 목록을 반환합니다
   */
  getActiveCustomCommands(): CustomCommand[] {
    return this.custom.command.filter(cmd => cmd.text && cmd.text.trim() !== "");
  }

  /**
   * 활성화된 캘린더 수를 반환합니다
   */
  getActiveCalendarCount(): number {
    return this.schedule.calendarName.filter(name => name && name.trim() !== "").length;
  }

  /**
   * 캘린더를 추가합니다
   */
  addCalendar(calendarName: string): boolean {
    const activeCount = this.getActiveCalendarCount();
    if (activeCount >= 5) {
      SummarDebug.log(1, "Cannot add calendar: maximum limit (5) reached");
      return false;
    }

    // 배열에 새 캘린더 추가
    this.schedule.calendarName.push(calendarName);
    SummarDebug.log(1, `Calendar added at index ${this.schedule.calendarName.length - 1}: ${calendarName}`);
    return true;
  }

  /**
   * 캘린더를 제거합니다
   */
  removeCalendar(index: number): boolean {
    if (index >= 0 && index < this.schedule.calendarName.length) {
      const removedName = this.schedule.calendarName[index];
      this.schedule.calendarName.splice(index, 1);
      SummarDebug.log(1, `Calendar removed at index ${index}: ${removedName}`);
      return true;
    }
    return false;
  }

  /**
   * V1 설정에서 V2 설정으로 마이그레이션합니다
   */
  async migrateFromV1(v1Settings: any, defaultPrompts?: any): Promise<void> {
    SummarDebug.log(1, "Starting migration from V1 to V2 settings");

    try {
      // Common 섹션 마이그레이션
      if (v1Settings.openaiApiKey !== undefined) this.common.openaiApiKey = v1Settings.openaiApiKey;
      if (v1Settings.openaiApiEndpoint !== undefined) this.common.openaiApiEndpoint = v1Settings.openaiApiEndpoint;
      if (v1Settings.googleApiKey !== undefined) this.common.googleApiKey = v1Settings.googleApiKey;
      if (v1Settings.useConfluenceAPI !== undefined) this.common.useConfluenceAPI = v1Settings.useConfluenceAPI;
      if (v1Settings.confluenceApiToken !== undefined) this.common.confluenceApiToken = v1Settings.confluenceApiToken;
      if (v1Settings.confluenceDomain !== undefined) this.common.confluenceDomain = v1Settings.confluenceDomain;
      if (v1Settings.confluenceParentPageUrl !== undefined) this.common.confluenceParentPageUrl = v1Settings.confluenceParentPageUrl;
      if (v1Settings.confluenceParentPageSpaceKey !== undefined) this.common.confluenceParentPageSpaceKey = v1Settings.confluenceParentPageSpaceKey;
      if (v1Settings.confluenceParentPageId !== undefined) this.common.confluenceParentPageId = v1Settings.confluenceParentPageId;

      // Web 섹션 마이그레이션
      if (v1Settings.webModel !== undefined) this.web.webModel = v1Settings.webModel;
      if (v1Settings.webPrompt !== undefined) this.web.webPrompt = v1Settings.webPrompt;

      // PDF 섹션 마이그레이션
      if (v1Settings.pdfModel !== undefined) this.pdf.pdfModel = v1Settings.pdfModel;
      if (v1Settings.pdfPrompt !== undefined) this.pdf.pdfPrompt = v1Settings.pdfPrompt;

      // Recording 섹션 마이그레이션
      if (v1Settings.autoRecordOnZoomMeeting !== undefined) this.recording.autoRecordOnZoomMeeting = v1Settings.autoRecordOnZoomMeeting;
      if (v1Settings.recordingDir !== undefined) this.recording.recordingDir = v1Settings.recordingDir;
      if (v1Settings.saveTranscriptAndRefineToNewNote !== undefined) this.recording.saveTranscriptAndRefineToNewNote = v1Settings.saveTranscriptAndRefineToNewNote;
      if (v1Settings.addLinkToDailyNotes !== undefined) this.recording.addLinkToDailyNotes = v1Settings.addLinkToDailyNotes;
      if (v1Settings.recordingUnit !== undefined) this.recording.recordingUnit = v1Settings.recordingUnit;
      if (v1Settings.recordingLanguage !== undefined) this.recording.recordingLanguage = v1Settings.recordingLanguage;
      if (v1Settings.sttModel !== undefined) this.recording.sttModel = v1Settings.sttModel;
      
      // sttPrompt를 객체 형태로 마이그레이션
      this.recording.sttPrompt = {
        "gpt-4o-transcribe": v1Settings.sttPrompt || "",
        "gpt-4o-mini-transcribe": "",
        "gemini-2.0-flash": defaultPrompts?.sttPrompt?.["gemini-2.0-flash"] || "",
        "gemini-2.5-flash": defaultPrompts?.sttPrompt?.["gemini-2.5-flash"] || ""
      };
      
      if (v1Settings.transcriptSummaryModel !== undefined) this.recording.transcriptSummaryModel = v1Settings.transcriptSummaryModel;
      if (v1Settings.transcriptSummaryPrompt !== undefined) this.recording.transcriptSummaryPrompt = v1Settings.transcriptSummaryPrompt;
      if (v1Settings.refineSummary !== undefined) this.recording.refineSummary = v1Settings.refineSummary;
      if (v1Settings.refineSummaryPrompt !== undefined) this.recording.refineSummaryPrompt = v1Settings.refineSummaryPrompt;

      // selectedDeviceId_* 키들을 recording.selectedDeviceId 객체로 마이그레이션
      this.recording.selectedDeviceId = {};
      for (const key in v1Settings) {
        if (key.startsWith('selectedDeviceId_')) {
          const deviceKey = key; // 전체 키를 그대로 사용
          const deviceValue = v1Settings[key];
          if (deviceValue && typeof deviceValue === 'string') {
            this.recording.selectedDeviceId[deviceKey] = deviceValue;
            SummarDebug.log(1, `Migrated device: ${deviceKey} -> ${deviceValue}`);
          }
        }
      }

      // Custom 섹션 마이그레이션
      if (v1Settings.cmd_max !== undefined) this.custom.max = v1Settings.cmd_max;
      
      // 동적 키 형태의 커스텀 명령어들을 배열로 변환
      this.custom.command = []; // 빈 배열로 초기화
      const cmdCount = v1Settings.cmd_count || 0;
      for (let i = 1; i <= cmdCount; i++) {
        const cmdText = v1Settings[`cmd_text_${i}`] || "";
        const cmdPrompt = v1Settings[`cmd_prompt_${i}`] || "";
        const cmdModel = v1Settings[`cmd_model_${i}`] || "";
        const cmdHotkey = v1Settings[`cmd_hotkey_${i}`] || "";
        
        // 텍스트가 있는 명령어만 추가
        if (cmdText.trim() !== "") {
          this.custom.command.push({
            text: cmdText,
            prompt: cmdPrompt,
            model: cmdModel,
            hotkey: cmdHotkey,
            appendToNote: v1Settings[`cmd_append_to_note_${i}`] || false,
            copyToClipboard: v1Settings[`cmd_copy_to_clipboard_${i}`] || false
          });
        }
      }

      // Schedule 섹션 마이그레이션
      if (v1Settings.calendar_fetchdays !== undefined) this.schedule.calendar_fetchdays = v1Settings.calendar_fetchdays;
      if (v1Settings.calendar_polling_interval !== undefined) this.schedule.calendar_polling_interval = v1Settings.calendar_polling_interval;
      if (v1Settings.autoLaunchZoomOnSchedule !== undefined) this.schedule.autoLaunchZoomOnSchedule = v1Settings.autoLaunchZoomOnSchedule;
      if (v1Settings.autoLaunchZoomOnlyAccepted !== undefined) this.schedule.autoLaunchZoomOnlyAccepted = v1Settings.autoLaunchZoomOnlyAccepted;

      // 동적 키 형태의 캘린더들을 배열로 변환
      this.schedule.calendarName = []; // 빈 배열로 초기화
      const calendarCount = v1Settings.calendar_count || 0;
      for (let i = 1; i <= calendarCount; i++) {
        const calendarValue = v1Settings[`calendar_${i}`];
        // 값이 있는 캘린더만 추가
        if (calendarValue && calendarValue.trim() !== "") {
          this.schedule.calendarName.push(calendarValue);
        }
      }

      // System 섹션 마이그레이션
      if (v1Settings.debugLevel !== undefined) this.system.debugLevel = v1Settings.debugLevel;
      if (v1Settings.testUrl !== undefined) this.system.testUrl = v1Settings.testUrl;

      // 스키마 버전 업데이트
      this.schemaVersion = "2.0.0";

      SummarDebug.log(1, "Migration from V1 to V2 completed successfully");
    } catch (error) {
      SummarDebug.error(1, "Error during migration from V1 to V2:", error);
      throw error;
    }
  }

  /**
   * 설정 검증을 수행합니다
   */
  validateSettings(): boolean {
    try {
      // 기본 구조 검증
      if (!this.schemaVersion) {
        SummarDebug.error(1, "Invalid settings: missing schemaVersion");
        return false;
      }

      // 커스텀 명령어 수 검증
      if (this.custom.max < 0 || this.custom.max > 50) {
        SummarDebug.error(1, "Invalid settings: custom.max out of range");
        return false;
      }

      // 배열 타입 검증
      if (!Array.isArray(this.custom.command)) {
        SummarDebug.error(1, "Invalid settings: custom.command is not an array");
        return false;
      }

      if (!Array.isArray(this.schedule.calendarName)) {
        SummarDebug.error(1, "Invalid settings: schedule.calendarName is not an array");
        return false;
      }

      return true;
    } catch (error) {
      SummarDebug.error(1, "Error validating settings:", error);
      return false;
    }
  }

  /**
   * 설정 동기화 상태를 검증합니다 (개발/디버그용)
   */
  validateSync(): boolean {
    try {
      // 통합된 클래스에서는 항상 동기화됨
      SummarDebug.log(1, "Settings sync validation: PASSED (integrated class)");
      return true;
    } catch (error) {
      SummarDebug.error(1, "Error validating settings sync:", error);
      return false;
    }
  }
}
