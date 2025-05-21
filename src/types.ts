export interface PluginSettings {
  openaiApiKey: string;
  googleApiKey: string;

  confluenceApiToken: string;
  confluenceParentPageUrl: string;
  confluenceParentPageSpaceKey: string;
  confluenceParentPageId: string;
  useConfluenceAPI: boolean;

  confluenceDomain: string;
  systemPrompt: string;
  webPrompt: string;
  pdfPrompt: string;
  /////
  webModel: string;
  pdfModel: string;
  transcriptSTT: string;
  transcribingPrompt: string;
  transcriptModel: string;
  // customModel: string;
  /////
  selectedDeviceId: string;
  recordingDir: string;
  recordingUnit: number;
  recordingLanguage: string;
  recordingPrompt: string;
  recordingResultNewNote: boolean;
  refineSummary: boolean;
  refiningPrompt: string;
  /////
  testUrl: string;
  debugLevel: number;
  /////
  cmd_max: number;
  cmd_count: number;
  [key: string]: string | number | boolean;  
  
  calendar_count: number;
  calendar_fetchdays: number;
  calendar_polling_interval: number;
  calendar_zoom_only: boolean;
  
  autoRecording: boolean;
  autoRecordOnZoomMeeting: boolean;

  openaiApiEndpoint: string; // OpenAI API 엔드포인트 URL (기본값: https://api.openai.com)
}

export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export interface ModelInfo {
    [key: string]: string;
}

// interface CategoryModelInfo {
//     default: string;
//     models: ModelInfo;
// }

export interface ModelList {
    webpage: ModelInfo;
    pdf: ModelInfo;
    speech_to_text: ModelInfo;
    transcription: ModelInfo;
    custom: ModelInfo;
}

export interface ModelData {
    model_list: ModelList;
}

export type ModelCategory = 'webpage' | 'pdf' | 'speech_to_text' | 'transcription' | 'custom';

export interface PromptList {
    web: string[];
    pdf: string[];
    speech_to_text: string[];
    transcription: string[];
    refininement: string[];
}

export interface LangPromptData {
    [lang: string]: PromptList;
}

export interface PromptData {
    default_prompts: LangPromptData;
}

export type PromptCategory = 'web' | 'pdf' | 'speech_to_text' | 'transcription' | 'refininement';
