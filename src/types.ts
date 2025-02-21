export interface PluginSettings {
  openaiApiKey: string;
  confluenceApiToken: string;
  useConfluenceAPI:boolean;
  confluenceDomain: string;
  systemPrompt: string;
  webPrompt: string;
  pdfPrompt: string;
  /////
  webModel: string;
  // pdfModel: string;
  transcriptModel: string;
  // customModel: string;
  /////
  selectedDeviceId: string;
  recordingDir: string;
  recordingUnit: number;
  recordingLanguage: string;
  recordingPrompt: string;
  /////
  testUrl: string;
  debugLevel: number;
  /////
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
