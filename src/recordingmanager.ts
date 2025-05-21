import { normalizePath, Platform, Notice } from "obsidian";
import SummarPlugin from "./main";
import { OpenAIResponse } from "./types";
import { SummarDebug, SummarViewContainer, fetchOpenai, getDeviceId, getDeviceIdFromLabel } from "./globals";
import { NativeAudioRecorder } from "./audiorecorder";
import { RecordingTimer } from "./recordingtimer";
import { SummarTimer } from "./summartimer";
import { JsonBuilder } from "./jsonbuilder";
import { exec } from "child_process";

export class AudioRecordingManager extends SummarViewContainer {
	private timer: SummarTimer;

	private recorder: NativeAudioRecorder;
	private recordingInterval: number | null = null; // Use `number` for browser environment
	private startTime: Date | null = null;
	private timeStamp: string;
	private elapsedTime: number;

	private recordingPath: string ="";
	private recordingCounter: number = 0;
	private recordingTimer: RecordingTimer;

	private deviceId: string;
	private isRecording: boolean = false;

	private zoomWatcherInterval: NodeJS.Timeout | null = null;
	private wasZoomRunning = false;

	constructor(plugin: SummarPlugin) {
		super(plugin);
		this.recorder = new NativeAudioRecorder();
		this.recordingTimer = new RecordingTimer(plugin);
		this.timer = new SummarTimer(plugin);

		// 비동기 초기화 (가독성이 떨어짐)
		getDeviceId(plugin).then(deviceId => {
		this.deviceId = deviceId as string;
		});
	}

	async summarize(transcripted: string, newFilePath: string): Promise<string> {
		this.updateResultText("Summarizing from transcripted text");
		this.enableNewNote(false);
		// SummarDebug.log(2, "Fetched page content:", page_content);
		SummarDebug.log(1, `newFilePath: ${newFilePath}`);

		const recordingPrompt = this.plugin.settings.recordingPrompt;
		const openaiApiKey = this.plugin.settings.openaiApiKey;

		let summary = "";

		try {
			const body_content = JSON.stringify({
				model: this.plugin.settings.transcriptModel,
				messages: [
					// { role: "system", content: systemPrompt },
					{ role: "user", content: `${recordingPrompt}\n\n${transcripted}` },
				],
				// max_tokens: 16384,
			});
			this.updateResultText("Summarizing...");
			this.enableNewNote(false);
			this.timer.start();
			const aiResponse = await fetchOpenai(this.plugin, openaiApiKey, body_content);

			if (aiResponse.status !== 200) {
				const errorText = aiResponse.text;
				SummarDebug.error(1, "OpenAI API Error:", errorText);
				this.updateResultText(`Error: ${aiResponse.status} - ${errorText}`);
				this.enableNewNote(false);

				this.timer.stop();
				return summary;
			}

			const aiData = aiResponse.json;
			if (aiData.choices && aiData.choices.length > 0) {
				summary = aiData.choices[0].message.content || "No summary generated.";

				let summaryNote = "";
				if (newFilePath.includes(".md")) {
					summaryNote = newFilePath.replace(".md", " summary.md");
				} else {
					summaryNote = newFilePath + " summary.md";
				}					
				this.updateResultText(summary);
				this.enableNewNote(true, summaryNote);
				
				SummarDebug.log(1,`newFilePath = ${newFilePath}`);

				if (this.plugin.settings.recordingResultNewNote) {
					await this.plugin.app.vault.create(summaryNote, summary);
					await this.plugin.app.workspace.openLinkText(
						normalizePath(summaryNote),
						"",
						true
					);
				}

				if (this.plugin.settings.refineSummary)
				{
					this.timer.stop();
					this.refine(transcripted, summary, newFilePath);
				}
			} else {
				this.updateResultText("No valid response from OpenAI API.");
				this.enableNewNote(false);
			}
			this.timer.stop();
			return summary;
		} catch (error) {
			this.timer.stop();
			SummarDebug.error(1, "Error:", error);
			let msg = "An error occurred while processing the request.";
			if (error) {
				msg += ` | ${error?.status || ''} ${error?.message || error?.toString?.() || error}`;
			}
			this.updateResultText(msg);
			this.enableNewNote(false);
			return summary;
		}
	}

	async refine(transcripted: string, summarized: string, newFilePath: string): Promise<string> {
		let refined = "";
		this.updateResultText("Improving the summary…");
		this.enableNewNote(false);

		const refiningPrompt = this.plugin.settings.refiningPrompt;
		const openaiApiKey = this.plugin.settings.openaiApiKey;

		try {
			const jsonBuilder = new JsonBuilder();
			jsonBuilder.addData("model", this.plugin.settings.transcriptModel);
			jsonBuilder.addToArray("messages", {
				role: "user",
				content: refiningPrompt,
			});
			jsonBuilder.addToArray("messages", {
				role: "user",
				content: `=====회의록 요약본 시작=====\n\n${summarized}\n\n=====회의록 요약본 끝=====\n\n=====원본 transcript 시작=====\n\n${transcripted}\n\n====원본 transcript 끝====`,
			});

			const body_content = jsonBuilder.toString();

			this.updateResultText("Refining...");
			this.enableNewNote(false);
			this.timer.start();

			const aiResponse = await fetchOpenai(this.plugin, openaiApiKey, body_content);

			if (aiResponse.status !== 200) {
				const errorText = aiResponse.text;
				SummarDebug.error(1, "OpenAI API Error:", errorText);
				this.updateResultText(`Error: ${aiResponse.status} - ${errorText}`);
				this.enableNewNote(false);

				this.timer.stop();
				return refined;
			}

			const aiData = aiResponse.json;
			if (aiData.choices && aiData.choices.length > 0) {
				refined = aiData.choices[0].message.content || "Request failed.";

				let refinementNote = "";
				if (newFilePath.includes(".md")) {
					refinementNote = newFilePath.replace(".md", " refinement.md");
				} else {
					refinementNote = newFilePath + " refinement.md";
				}					
				this.updateResultText(refined);
				this.enableNewNote(true, refinementNote);

				if (this.plugin.settings.recordingResultNewNote) {
					await this.plugin.app.vault.create(refinementNote, refined);
					await this.plugin.app.workspace.openLinkText(
						normalizePath(refinementNote),
						"",
						true
					);
				}
			} else {
				this.updateResultText("No valid response from OpenAI API.");
				this.enableNewNote(false);
			}
			this.timer.stop();
			return refined;
		} catch (error) {
			this.timer.stop()
			this.enableNewNote(false);			
		}

		return refined;
	}

	async startRecording(intervalInMinutes: number): Promise<void> {
		if (this.isRecording) {
			SummarDebug.Notice(0, "Recording is already in progress.");
			return;
		}
		this.isRecording = true;
		this.recordingTimer.start();
		try {
			const recorderState = this.getRecorderState();

			if (recorderState == "recording" || recorderState == "paused") {
				this.recordingTimer.stop();
				throw new Error("Recorder is recording or paused. Cannot start recording.");
			}

			// const deviceId = await getDeviceId(this.plugin);
			const selectedDeviceLabel = this.plugin.settings[this.deviceId] as string;
			if (!selectedDeviceLabel) {
				this.recordingTimer.stop();
				SummarDebug.Notice(0, "No audio device selected.", 0);
				this.isRecording = false;
				return;
			}
			const selectedDeviceId = await getDeviceIdFromLabel(selectedDeviceLabel) as string;
			await this.recorder.startRecording(selectedDeviceId);

			this.startTime = new Date();
			this.timeStamp = this.getTimestamp();
			this.elapsedTime = 0;
			this.recordingCounter = 0;

			SummarDebug.log(1, `recordingDir: ${this.plugin.settings.recordingDir}`);
			this.recordingPath = normalizePath(this.plugin.settings.recordingDir + "/" + this.timeStamp);
			await this.plugin.app.vault.adapter.mkdir(this.recordingPath);
			SummarDebug.log(1,`recordingPath: ${this.recordingPath}`);

			this.recordingInterval = window.setInterval(async () => {
				if (!this.isRecording || !this.startTime) {
					// this.recordingTimer.stop();
					// this.isRecording = false;
					return;
				}


				// Stop the current recording and save the file
				const blob = await this.stopRecordingInternal();
				const extension = this.recorder.getMimeType()?.split("/")[1];
				const fileName = normalizePath(this.recordingPath + `/summar_audio_${this.timeStamp}_${this.elapsedTime}s.${extension}`);

				await this.saveFile(blob, fileName);

				// 녹음이 중지되었으므로 일정 시간 대기 후 재시작
				// setTimeout(async () => {

				    // MediaRecorder가 완전히 비활성화될 때까지 기다림
					await this.recorder.waitForInactive();
					
					if (this.isRecording) {
						if (this.startTime) {
							this.elapsedTime = Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);
						} else {
							this.elapsedTime = 0;
						}
						this.timeStamp = this.getTimestamp();
						this.recordingCounter++;

						await this.recorder.startRecording(selectedDeviceId);
					}
				// }, 1000); // 1초 대기 후 재시작
			}, intervalInMinutes * 60 * 1000);

			// 	// Restart the recording
			// 	await this.recorder.startRecording(selectedDeviceId);
			// }, intervalInMinutes * 60 * 1000);

			SummarDebug.Notice(0, "Recording started.");
		} catch (err) {
			this.recordingTimer.stop();
			SummarDebug.Notice(0, "Error starting recording: " + (err as Error).message);
			SummarDebug.error(1, err);
		}
	}

	async stopRecording(): Promise<string> {
		return new Promise(async (resolve, reject) => {
			try {
				if (!this.isRecording) {
					SummarDebug.Notice(0, "No active recording to stop.");
					resolve("");
					return;
				}
				this.isRecording = false;
				this.recordingTimer.stop();

				const recorderState = this.getRecorderState();

				if (recorderState === undefined) {
					// this.recordingTimer.stop();
					throw new Error("Recorder state is undefined. Cannot stop recording.");
				} else if (recorderState !== "recording" && recorderState !== "paused") {
					// this.recordingTimer.stop();
					throw new Error("Recorder is not recording or paused. Cannot stop recording.");
				}

				if (this.recordingInterval) {
					window.clearInterval(this.recordingInterval); // Use `window.clearInterval` for compatibility
					this.recordingInterval = null;
				}

				if (!this.startTime) {
					// this.recordingTimer.stop();
					resolve("");
					return;
				}
				const blob = await this.stopRecordingInternal();
				const extension = this.recorder.getMimeType()?.split("/")[1];
				const fileName = normalizePath(this.recordingPath + `/summar_audio_${this.timeStamp}_${this.elapsedTime}s.${extension}`);
				await this.saveFile(blob, fileName);

				if (blob.size === 0) {
					SummarDebug.Notice(0, "Recording failed: No audio data captured.");
				}

				SummarDebug.Notice(0, "Recording stopped.");
				// this.recordingTimer.stop();
				resolve(this.recordingPath);
			} catch (err) {
				this.recordingTimer.stop();
				SummarDebug.Notice(0, "Error stopping recording: " + (err as Error).message);
				SummarDebug.error(1, err);
				reject(err);
			}
		});
	}

	private async stopRecordingInternal(): Promise<Blob> {
		return this.recorder.stopRecording();
	}

	private async saveFile(blob: Blob, fileName: string): Promise<void> {
		return new Promise((resolve, reject) => {
			try {			
				SummarDebug.log(1, `saveFile(filenName): ${fileName}`);
				blob.arrayBuffer()
					.then((buffer) => {
						const data = new Uint8Array(buffer);
						this.plugin.app.vault.createBinary(fileName, data)
							.then(() => {
								SummarDebug.Notice(0, `File saved: ${fileName}`);
								SummarDebug.log(1,`File saved: ${fileName}`);
								resolve();
								SummarDebug.log(1,`File saving resolved: ${fileName}`);
							})
							.catch((error) => {
								SummarDebug.error(1, `Failed to save file: ${fileName}`, error);
								reject(error); // 파일 생성 중 오류 발생 시 reject 호출
							});
					})
					.catch((error) => {
						SummarDebug.error(1, `Failed to convert Blob to ArrayBuffer for file: ${fileName}`, error);
						reject(error); // Blob -> ArrayBuffer 변환 중 오류 발생 시 reject 호출
					});
			} catch (error) {
				SummarDebug.error(1, `Unexpected error in saveFile for file: ${fileName}`, error);
				reject(error); // 예기치 못한 오류 발생 시 reject 호출	
			}
		});
	}

	private getTimestamp(): string {
		const now = new Date();
		const year = now.getFullYear().toString().slice(2);
		const month = ("0" + (now.getMonth() + 1)).slice(-2);
		const day = ("0" + now.getDate()).slice(-2);
		const hours = ("0" + now.getHours()).slice(-2);
		const minutes = ("0" + now.getMinutes()).slice(-2);
		const seconds = ("0" + now.getSeconds()).slice(-2); // 초 단위 추가
	
		return `${year}${month}${day}-${hours}${minutes}${seconds}`;		
	}

	public getRecorderState(): "inactive" | "recording" | "paused" | undefined {
		return this.recorder.getRecordingState?.();
	}

	startZoomAutoRecordWatcher() {
		if (!(Platform.isMacOS && Platform.isDesktopApp)) return;
		if (!this.plugin.settings.autoRecordOnZoomMeeting) return;
		if (this.zoomWatcherInterval) return;
		this.zoomWatcherInterval = setInterval(() => {
			// macOS: Zoom 미팅 중에만 존재하는 프로세스(CptHost) 감지
			exec('pgrep -x "CptHost"', (err, stdout) => {
				const isMeetingRunning = !!stdout.trim();
				if (isMeetingRunning && !this.wasZoomRunning) {
					// Zoom 미팅 시작됨
					this.plugin.recordingManager.startRecording(this.plugin.settings.recordingUnit);
				} else if (!isMeetingRunning && this.wasZoomRunning && this.plugin.recordingManager.getRecorderState() === "recording") {
					this.plugin.toggleRecording();
					// Zoom 미팅 종료됨
					// this.plugin.recordingManager.stopRecording().then((recordingPath) => {
					// 	if (recordingPath) {
					// 		// 자동 트랜스크립션
					// 		if (typeof (this.plugin as any).handleRecordingStopped === 'function') {
					// 			(this.plugin as any).handleRecordingStopped(recordingPath);
					// 		}
					// 	}
					// });
				}
				this.wasZoomRunning = isMeetingRunning;
			});
		}, 3000); // 3초마다 체크
	}

	stopZoomAutoRecordWatcher() {
		if (this.zoomWatcherInterval) {
			clearInterval(this.zoomWatcherInterval);
			this.zoomWatcherInterval = null;
		}
	}
}
