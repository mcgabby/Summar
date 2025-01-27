import SummarPlugin from "./main";
import { OpenAIResponse } from "./types";
import { SummarViewContainer, SummarDebug, fetchOpenai } from "./globals";
import { SummarTimer } from "./summartimer";
import { PdfToPng } from "./pdftopng";
import { JsonBuilder } from "./jsonbuilder";


export class PdfHandler {
	private resultContainer: { value: string };
	private plugin: SummarPlugin;

	constructor(resultContainer: { value: string }, plugin: SummarPlugin) {
		this.resultContainer = resultContainer;
		this.plugin = plugin;
	}

	/*
	 * convertPdfToMarkdown 함수는 PDF를 이미지로 변환한 후 마크다운으로 변환합니다.
	 * @param resultContainer 결과를 표시할 textarea 엘리먼트
	 * @param plugin 플러그인 인스턴스
	 */
	async convertPdfToMarkdown() {
		const { openaiApiKey } = this.plugin.settings;
		const resultContainer = this.resultContainer;

		if (!openaiApiKey) {
			SummarDebug.Notice(0, "Please configure OpenAI API key in the plugin settings.", 0);
			SummarViewContainer.updateText(resultContainer, "Please configure OpenAI API key in the plugin settings.");
			return;
		}

		const timer = new SummarTimer(resultContainer);
		const pdftopng = new PdfToPng(resultContainer, this.plugin);
		try {
			if (!(await pdftopng.isPopplerInstalled())) {
				SummarDebug.Notice(0, "Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
				SummarViewContainer.updateText(resultContainer, "Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
				throw new Error("Poppler is not installed. Please install Poppler using the following command in your shell: \n% brew install poppler.");
			}

			const fileInput = document.createElement("input");
			fileInput.type = "file";
			fileInput.accept = ".pdf";
			const openaiApiKey = this.plugin.settings.openaiApiKey;
			const pdfPrompt = this.plugin.settings.pdfPrompt;

			fileInput.onchange = async () => {
				if (fileInput.files && fileInput.files.length > 0) {
					const file = fileInput.files[0];
					SummarDebug.Notice(1, file.name);

					const base64Values = await pdftopng.convert(file, (SummarDebug.level() < 4));

					// JsonBuilder 인스턴스 생성
					const jsonBuilder = new JsonBuilder();

					// 기본 데이터 추가
					jsonBuilder.addData("model", "gpt-4o");

					// 시스템 메시지 추가
					jsonBuilder.addToArray("messages", {
						role: "system",
						content: [
							{
								type: "text",
								text: pdfPrompt,
							},
						],
					});

					base64Values.forEach((base64, index) => {
						SummarDebug.log(2, `${index + 1}번 파일의 Base64: ${base64}`);
						const page_prompt = `다음은 PDF의 페이지 ${index + 1}입니다.`;
						jsonBuilder.addToArray("messages", {
							role: "user",
							content: [
								{
									type: "text",
									text: page_prompt,
								},
								{
									type: "image_url",
									image_url: {
										url: `data:image/png;base64,${base64}`,
									},
								},
							],
						});
					});

					jsonBuilder.addToArray("messages", {
						role: "user",
						content: [
							{
								type: "text",
								text: "모든 페이지가 전송되었습니다. 이제 전체 PDF의 마크다운 결과를 출력하세요.",
							},
						],
					});

					const body_content = jsonBuilder.toString();
					SummarDebug.log(2, body_content);

					SummarViewContainer.updateText(resultContainer, "Converting PDF to markdown. This may take a while...");

					timer.start();
					const aiResponse = await fetchOpenai(openaiApiKey, body_content);
					timer.stop();

					if (!aiResponse.ok) {
						const errorText = await aiResponse.text();
						SummarDebug.error(1, "OpenAI API Error:", errorText);
						SummarViewContainer.updateText(resultContainer, `Error: ${aiResponse.status} - ${errorText}`);
						return;
					}

					const aiData = (await aiResponse.json()) as OpenAIResponse;

					if (aiData.choices && aiData.choices.length > 0) {
						const summary = aiData.choices[0].message.content || "No summary generated.";
						const markdownContent = this.extractMarkdownContent(summary);
						if (markdownContent) {
							SummarViewContainer.updateText(resultContainer, markdownContent);
						} else {
							SummarViewContainer.updateText(resultContainer, JSON.stringify(aiData, null, 2));
						}
					} else {
						SummarViewContainer.updateText(resultContainer, "No valid response from OpenAI API.");
					}

					SummarDebug.log(1, "PDF conversion to images complete.");
				}
			};
			fileInput.click();
		} catch (error) {
			timer.stop();

			SummarDebug.error(1, "Error during PDF to PNG conversion:", error);
			SummarViewContainer.updateText(resultContainer, `Error during PDF to PNG conversion: ${error}`);
			SummarDebug.Notice(0, "Failed to convert PDF to PNG. Check console for details.");
		}
	}

	// 정규식을 사용하여 마크다운 내용만 추출
	extractMarkdownContent(fullText: string): string | null {
	  // 정규식 패턴
	  const markdownRegex = /```markdown\n([\s\S]*?)\n```/;
	
	  // 정규식 매칭
	  const match = fullText.match(markdownRegex);
	
	  // 매칭된 내용 반환 또는 null
	  return match ? match[1] : fullText;
	}
	
}