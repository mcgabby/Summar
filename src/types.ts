export interface PluginSettings {
  openaiApiKey: string;
  confluenceApiToken: string;
  useConfluenceAPI:boolean;
  confluenceDomain: string;
  systemPrompt: string;
  userPrompt: string;
  pdfPrompt: string;

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
}

export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}
