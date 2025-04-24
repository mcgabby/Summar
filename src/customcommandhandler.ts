import SummarPlugin from "./main";
import { OpenAIResponse } from "./types";
import { SummarViewContainer, SummarDebug, fetchOpenai } from "./globals";
import { SummarTimer } from "./summartimer";

export class CustomCommandHandler extends SummarViewContainer {
	private timer: SummarTimer;

	constructor(plugin: SummarPlugin) {
		super(plugin);
		this.timer = new SummarTimer(plugin);
	}


	/*
	 * fetchAndSummarize 함수는 URL을 가져와서 요약을 생성합니다.
	 * @param resultContainer 결과를 표시할 textarea 엘리먼트
	 * @param url 가져올 URL
	 * @param plugin 플러그인 인스턴스
	 */
	async executePrompt(selectedText: string, cmdModel: string, cmdPrompt: string) {
		const { openaiApiKey } = this.plugin.settings;
		if (!openaiApiKey) {
			SummarDebug.Notice(0, "Please configure OpenAI API key in the plugin settings.", 0);
			this.updateResultText("Please configure OpenAI API key in the plugin settings.");
			this.enableNewNote(false);
			return;
		}

		this.updateResultText("execute prompt with selected text...");
		this.enableNewNote(false);

		try {
			this.timer.start();

			const body_content = JSON.stringify({
				model: cmdModel,
				messages: [
					// { role: "system", content: systemPrompt },
					{ role: "user", content: `${cmdPrompt}\n\n${selectedText}` },
				],
				// max_tokens: 16384,
			});

			// this.updateResultText( "Summarizing...");

			const aiResponse = await fetchOpenai(this.plugin, openaiApiKey, body_content);
			this.timer.stop();


			if (aiResponse.status !== 200) {
				const errorText = aiResponse.json.message;
				SummarDebug.error(1, "OpenAI API Error:", errorText);
				this.updateResultText(`Error: ${aiResponse.status} - ${errorText}`);
				this.enableNewNote(false);

				return;
			}

			// const aiData = (await aiResponse.json()) as OpenAIResponse;
			const aiData = aiResponse.json;
			if (aiData.choices && aiData.choices.length > 0) {
				const responseText = aiData.choices[0].message.content || "No result generated.";
				this.updateResultText(responseText);
				this.enableNewNote(true);
			} else {
				this.updateResultText("No valid response from OpenAI API.");
				this.enableNewNote(false);
			}

		} catch (error) {
			this.timer.stop();
			SummarDebug.error(1, "Error:", error);
			this.updateResultText("An error occurred while processing the request.");
			this.enableNewNote(false);
		}
	}

}