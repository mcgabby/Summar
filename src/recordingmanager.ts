import { normalizePath, Notice } from "obsidian";
import SummarPlugin from "./main";
import { OpenAIResponse } from "./types";
import { SummarDebug, SummarViewContainer, fetchOpenai, getDeviceId, getDeviceIdFromLabel } from "./globals";
import { NativeAudioRecorder } from "./audiorecorder";
import { RecordingTimer } from "./recordingtimer";
import { SummarTimer } from "./summartimer";

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

	async summarize(transcripted: string) {
		this.updateResultText("Summarizing from transcripted text");
		// SummarDebug.log(2, "Fetched page content:", page_content);

		const userPrompt = this.plugin.settings.recordingPrompt;
		const openaiApiKey = this.plugin.settings.openaiApiKey;

		try {
			const body_content = JSON.stringify({
				model: "gpt-4o",
				messages: [
					// { role: "system", content: systemPrompt },
					{ role: "user", content: `${userPrompt}\n\n${transcripted}` },
				],
				max_tokens: 16384,
			});
			this.updateResultText("Summarizing...");
			this.timer.start();
			const aiResponse = await fetchOpenai(openaiApiKey, body_content);

			if (!aiResponse.ok) {
				const errorText = await aiResponse.text();
				SummarDebug.error(1, "OpenAI API Error:", errorText);
				this.updateResultText(`Error: ${aiResponse.status} - ${errorText}`);

				this.timer.stop();
				return;
			}

			const aiData = (await aiResponse.json()) as OpenAIResponse;

			if (aiData.choices && aiData.choices.length > 0) {
				const summary = aiData.choices[0].message.content || "No summary generated.";
				this.updateResultText(summary);
			} else {
				this.updateResultText("No valid response from OpenAI API.");
			}
			this.timer.stop();
		} catch (error) {
			this.timer.stop();
			SummarDebug.error(1, "Error:", error);
			this.updateResultText("An error occurred while processing the request.");
		}


	}

	async startRecording(intervalInMinutes: number): Promise<void> {
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
				if (!this.startTime) {
					this.recordingTimer.stop();
					return;
				}


				// Stop the current recording and save the file
				const blob = await this.stopRecordingInternal();
				const extension = this.recorder.getMimeType()?.split("/")[1];
				const fileName = normalizePath(this.recordingPath + `/summar_audio_${this.timeStamp}_${this.elapsedTime}s.${extension}`);

				await this.saveFile(blob, fileName);

				this.elapsedTime = Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);
				this.timeStamp = this.getTimestamp();
				this.recordingCounter++;

				// Restart the recording
				await this.recorder.startRecording(selectedDeviceId);
			}, intervalInMinutes * 60 * 1000);

			new Notice("Recording started.");
		} catch (err) {
			this.recordingTimer.stop();
			new Notice("Error starting recording: " + (err as Error).message);
			console.error(err);
		}
	}

	async stopRecording(): Promise<string> {
		return new Promise(async (resolve, reject) => {
			try {
				const recorderState = this.getRecorderState();

				if (recorderState === undefined) {
					this.recordingTimer.stop();
					throw new Error("Recorder state is undefined. Cannot stop recording.");
				} else if (recorderState !== "recording" && recorderState !== "paused") {
					this.recordingTimer.stop();
					throw new Error("Recorder is not recording or paused. Cannot stop recording.");
				}

				if (this.recordingInterval) {
					window.clearInterval(this.recordingInterval); // Use `window.clearInterval` for compatibility
					this.recordingInterval = null;
				}

				if (!this.startTime) {
					this.recordingTimer.stop();
					resolve("");
					return;
				}
				const blob = await this.stopRecordingInternal();
				const extension = this.recorder.getMimeType()?.split("/")[1];
				const fileName = normalizePath(this.recordingPath + `/summar_audio_${this.timeStamp}_${this.elapsedTime}s.${extension}`);
				await this.saveFile(blob, fileName);

				SummarDebug.Notice(0, "Recording stopped.");
				this.recordingTimer.stop();
				resolve(this.recordingPath);
			} catch (err) {
				this.recordingTimer.stop();
				SummarDebug.Notice(0, "Error stopping recording: " + (err as Error).message);
				console.error(err);
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
}
