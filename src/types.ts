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
  // pdfModel: string;
  transcriptEndpoint: string;
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
}

export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}
