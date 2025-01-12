


export interface PluginSettings {
  openaiApiKey: string;
  confluenceApiToken: string;
  useConfluenceAPI:boolean;
  confluenceBaseUrl: string;
  systemPrompt: string;
  userPrompt: string;
  url: string;
  pdfPrompt: string;
}

export interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}
