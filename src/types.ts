


export interface PluginSettings {
  openaiApiKey: string;
  confluenceApiToken: string;
  useConfluenceAPI:boolean;
  confluenceBaseUrl: string;
  systemPrompt: string;
  userPrompt: string;
  pdfPrompt: string;

  url: string;
  debugLevel: number;
}

export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}
