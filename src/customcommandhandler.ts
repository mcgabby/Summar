import SummarPlugin from "./main";
import { OpenAIResponse } from "./types";
import { SummarViewContainer, SummarDebug, fetchOpenai } from "./globals";
import { SummarTimer } from "./summartimer";
import { MarkdownView } from "obsidian";

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
	async executePrompt(selectedText: string, cmdId: string) {
		// cmdId에서 인덱스 추출 (예: custom-command-3 → 3)
		const match = cmdId.match(/custom-command-(\d+)/);
		const cmdIndex = match ? parseInt(match[1], 10) : undefined;
		if (!cmdIndex) {
			SummarDebug.error(1, `Invalid cmdId: ${cmdId}`);
			return;
		}

		const settings = this.plugin.settings;
		const cmdModel = settings[`cmd_model_${cmdIndex}`] || 'gpt-4o';
		const cmdPrompt = settings[`cmd_prompt_${cmdIndex}`] || '';
		const appendToNote = !!settings[`cmd_append_to_note_${cmdIndex}`];
		const copyToClipboard = !!settings[`cmd_copy_to_clipboard_${cmdIndex}`];
		const { openaiApiKey } = settings;

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

				// 결과를 노트에 append (설정에 따라)
				if (appendToNote) {
					const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
					const editor = view && (view as MarkdownView).editor;
					if (editor) {
						let insertLine = editor.getCursor().line + 1;
						let insertCh = 0;
						// 멀티라인 선택 시 마지막 선택 줄의 다음 줄에 삽입
						const sel = editor.listSelections && editor.listSelections()[0];
						if (sel && sel.anchor && sel.head) {
							const from = sel.anchor.line < sel.head.line ? sel.anchor : sel.head;
							const to = sel.anchor.line > sel.head.line ? sel.anchor : sel.head;
							insertLine = Math.max(from.line, to.line) + 1;
							insertCh = 0;
						}
						// 결과 삽입
						editor.replaceRange(responseText + "\n", { line: insertLine, ch: insertCh });
						// selection 해제 및 커서 이동 (결과의 첫 위치)
						editor.setSelection({ line: insertLine, ch: 0 }, { line: insertLine, ch: 0 });
					}
				}

				// 결과를 클립보드에 복사 (설정에 따라)
				if (copyToClipboard) {
					try {
						await navigator.clipboard.writeText(responseText);
						SummarDebug.Notice(1, "Results copied to clipboard.");
					} catch (err) {
						SummarDebug.error(1, "Failed to copy to clipboard:", err);
					}
				}
			} else {
				this.updateResultText("No valid response from OpenAI API.");
				this.enableNewNote(false);
			}

		} catch (error) {
			this.timer.stop();
			SummarDebug.error(1, "Error:", error);
			let msg = "An error occurred while processing the request.";
			if (error) {
				msg += ` | ${error?.status || ''} ${error?.message || error?.toString?.() || error}`;
			}
			this.updateResultText(msg);
			this.enableNewNote(false);
		}
	}

}