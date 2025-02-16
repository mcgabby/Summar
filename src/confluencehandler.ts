import SummarPlugin from "./main";
import { OpenAIResponse } from "./types";
import { SummarViewContainer, SummarDebug, fetchOpenai, fetchLikeRequestUrl, containsDomain } from "./globals";
import { SummarTimer } from "./summartimer";
import { ConfluenceAPI } from "./confluenceapi";

export class ConfluenceHandler extends SummarViewContainer {
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
	async fetchAndSummarize(url: string) {
		const { confluenceApiToken, confluenceDomain, useConfluenceAPI, openaiApiKey, userPrompt } = this.plugin.settings;
		if (!openaiApiKey) {
			SummarDebug.Notice(0, "Please configure OpenAI API key in the plugin settings.", 0);
			this.updateResultText("Please configure OpenAI API key in the plugin settings.");
			return;
		}

		if (!confluenceApiToken) {
			SummarDebug.Notice(0, "If you want to use the Confluence API, please configure the API token in the plugin settings.", 0);
		}

		this.updateResultText("Fetching and summarizing...");

		try {
			this.timer.start();

			// extractConfluenceInfo 함수 호출
			const { confluenceApiToken } = this.plugin.settings;

			const conflueceapi = new ConfluenceAPI(this.plugin);
			let pageId = "";
			let page_content: string = "";

			if (confluenceApiToken && confluenceDomain && containsDomain(url, this.plugin.settings.confluenceDomain)) {
				const result = await conflueceapi.getPageId(url);

				SummarDebug.log(1, "Extracted Confluence Info:");
				SummarDebug.log(1, `Page ID: ${result.pageId}`);
				SummarDebug.log(1, `Space Key: ${result.spaceKey}`);
				SummarDebug.log(1, `Title: ${result.title}`);
				pageId = result.pageId as string;
			}
			if (pageId) {
				try {
					if (useConfluenceAPI && confluenceApiToken) {
						const { title, content } = await conflueceapi.getPageContent(pageId);
						page_content = await content;
						SummarDebug.log(2, `Fetched Confluence page content:\n ${content}`);
					} else {
						const response = await fetchLikeRequestUrl(url, {
							headers: {
								Authorization: `Bearer ${confluenceApiToken}`,
							},
						});
						page_content = await response.text();
					}
				} catch (error) {
					SummarDebug.error(1, "Failed to fetch page content:", error);
				}
			} else {
				const response = await fetchLikeRequestUrl(url);

				page_content = await response.text();
			}
			this.updateResultText("Fedtched page content");

			SummarDebug.log(2, "Fetched page content:", page_content);

			const body_content = JSON.stringify({
				model: "o1-mini",
				messages: [
					// { role: "system", content: systemPrompt },
					{ role: "user", content: `${userPrompt}\n\n${page_content}` },
				],
				// max_tokens: 16384,
			});

			this.updateResultText( "Summarizing...");

			const aiResponse = await fetchOpenai(openaiApiKey, body_content);
			this.timer.stop();

			if (!aiResponse.ok) {
				const errorText = await aiResponse.text();
				SummarDebug.error(1, "OpenAI API Error:", errorText);
				this.updateResultText(`Error: ${aiResponse.status} - ${errorText}`);

				return;
			}

			const aiData = (await aiResponse.json()) as OpenAIResponse;

			if (aiData.choices && aiData.choices.length > 0) {
				const summary = aiData.choices[0].message.content || "No summary generated.";
				this.updateResultText(summary);
			} else {
				this.updateResultText("No valid response from OpenAI API.");
			}

		} catch (error) {
			this.timer.stop();
			SummarDebug.error(1, "Error:", error);
			this.updateResultText("An error occurred while processing the request.");
		}
	}

}