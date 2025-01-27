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
}

export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}
