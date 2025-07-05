import { normalizePath, Platform } from "obsidian";
import SummarPlugin from "./main";
import { SummarDebug, SummarViewContainer, getDeviceId, getDeviceIdFromLabel, getAvailableFilePath } from "./globals";
import { SummarAI } from "./summarai";
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

		const transcriptSummaryPrompt = this.plugin.settings.transcriptSummaryPrompt;

		let summary = "";

		try {
			const summarai = new SummarAI(this.plugin, this.plugin.settings.transcriptSummaryModel, 'stt-summary');
			if (!summarai.hasKey(true)) return '';

			this.updateResultText( `Generating summary using [${this.plugin.settings.transcriptSummaryModel}]...` );

			this.enableNewNote(false);
			this.timer.start();

			const message = `${transcriptSummaryPrompt}\n\n${transcripted}`;
			await summarai.chat([message]);
			const status = summarai.response.status;
			const summary = summarai.response.text;

			if (status !== 200) {
				SummarDebug.error(1, "OpenAI API Error:", summary);
				this.updateResultText(`Error: ${status} - ${summary}`);
				this.enableNewNote(false);

				this.timer.stop();
				return summary;
			}

			if (summary && summary.length > 0) {

				let summaryCandidate = "";
				if (newFilePath.toLowerCase().includes(" transcript.md")) {
					summaryCandidate = newFilePath.replace(" transcript.md", " summary");
				} else {
					summaryCandidate = newFilePath + " summary";
				}

				const summaryNote = getAvailableFilePath(summaryCandidate, ".md", this.plugin);

				this.updateResultText(summary);
				this.enableNewNote(true, summaryNote);
				
				SummarDebug.log(1,`newFilePath = ${newFilePath}`);

				if (this.plugin.settings.saveTranscriptAndRefineToNewNote) {
					await this.plugin.app.vault.create(summaryNote, summary);
					
					// refined가 활성화되어 있지 않으면 summary 파일을 열기
					// refined가 활성화되어 있으면 나중에 refined 파일이 열릴 예정이므로 summary는 열지 않음
					if (!this.plugin.settings.refineSummary) {
						await this.plugin.app.workspace.openLinkText(
							normalizePath(summaryNote),
							"",
							true
						);
					}
					
					// Daily Notes에 요약 완료 링크 추가 (전사 파일 경로에서 날짜 추출)
					const recordingDate = this.extractRecordingDateFromFilePath(summaryNote);
					await this.plugin.dailyNotesHandler.addMeetingLinkToDailyNote(summaryNote, 'summary', recordingDate);
				}

				if (this.plugin.settings.refineSummary)
				{
					this.timer.stop();
					await this.refine(transcripted, summary, summaryNote);
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

		const refineSummaryPrompt = this.plugin.settings.refineSummaryPrompt;

		try {
			const summarai = new SummarAI(this.plugin, this.plugin.settings.transcriptSummaryModel, 'stt-refine');
			if (!summarai.hasKey(true)) return '';
			const messages: string[] = [];
			messages.push(refineSummaryPrompt);
			messages.push(`=====회의록 요약본 시작=====\n\n${summarized}\n\n=====회의록 요약본 끝=====\n\n=====원본 transcript 시작=====\n\n${transcripted}\n\n====원본 transcript 끝====`);

			SummarDebug.log(1, `messages1\n${messages[0]}`);
			SummarDebug.log(1, `messages2\n${messages[1]}`);
			
			this.updateResultText(`Refining summary using [${this.plugin.settings.transcriptSummaryModel}]...`);
			this.enableNewNote(false);
			this.timer.start();

			await summarai.chat(messages);
			const status = summarai.response.status;
			refined = summarai.response.text;

			if (status !== 200) {
				SummarDebug.error(1, "OpenAI API Error:", refined);
				this.updateResultText(`Error: ${status} - ${refined}`);
				this.enableNewNote(false);

				this.timer.stop();
				return refined;
			}

			if (refined && refined.length > 0) {

				let refinementCandidate = "";
				if (newFilePath.toLowerCase().includes(" summary")) {
					refinementCandidate = newFilePath.replace(" summary", " refinement");
				} else {
					refinementCandidate = newFilePath + " refinement";
				}
				if (refinementCandidate.toLowerCase().endsWith(".md")) {
					refinementCandidate = refinementCandidate.slice(0, -3); // Remove ".md" extension
				}
				const refinementNote = getAvailableFilePath(refinementCandidate, ".md", this.plugin);

				this.updateResultText(refined);
				this.enableNewNote(true, refinementNote);

				if (this.plugin.settings.saveTranscriptAndRefineToNewNote) {
					await this.plugin.app.vault.create(refinementNote, refined);
					await this.plugin.app.workspace.openLinkText(
						normalizePath(refinementNote),
						"",
						true
					);
					
					// Daily Notes에 개선 완료 링크 추가 (refinement 파일 경로에서 날짜 추출)
					const recordingDate = this.extractRecordingDateFromFilePath(refinementNote);
					await this.plugin.dailyNotesHandler.addMeetingLinkToDailyNote(refinementNote, 'refinement', recordingDate);
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

		// 현재 시간에 해당하는 캘린더 이벤트 찾기
		let meetingInfo = "";
		let folderSuffix = "";
		if (this.plugin.calendarHandler) {
			const currentEvent = this.plugin.calendarHandler.findEventAtTime(this.startTime);
			if (currentEvent) {
				meetingInfo = this.plugin.calendarHandler.formatEventInfo(currentEvent);
				// 미팅 제목을 폴더명에 포함 (파일시스템에 안전한 문자만 사용)
				const safeMeetingTitle = currentEvent.title.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '_');
				folderSuffix = `_${safeMeetingTitle}`;
				SummarDebug.log(1, `Found calendar event: ${currentEvent.title}`);
			} else {
				SummarDebug.log(1, "No calendar event found for current time");
			}
		}

		SummarDebug.log(1, `recordingDir: ${this.plugin.settings.recordingDir}`);
		this.recordingPath = normalizePath(this.plugin.settings.recordingDir + "/" + this.timeStamp + folderSuffix);
		await this.plugin.app.vault.adapter.mkdir(this.recordingPath);
		SummarDebug.log(1,`recordingPath: ${this.recordingPath}`);

		// 미팅 정보가 있으면 (폴더명) meeting-info.md 파일로 저장
		if (meetingInfo) {
			const folderName = this.recordingPath.split('/').pop() || this.timeStamp;
			const meetingInfoPath = normalizePath(this.recordingPath + `/${folderName} meeting-info.md`);
			await this.plugin.app.vault.adapter.write(meetingInfoPath, meetingInfo);
			SummarDebug.log(1, `Meeting info saved to: ${meetingInfoPath}`);
		}

			this.recordingInterval = window.setInterval(async () => {
				if (!this.isRecording || !this.startTime) {
					// this.recordingTimer.stop();
					// this.isRecording = false;
					return;
				}


				// Stop the current recording and save the file
				const blob = await this.stopRecordingInternal();
				const extension = this.recorder.getMimeType()?.split("/")[1];

				this.elapsedTime = Math.floor((new Date().getTime() - this.startTime.getTime()));
				const fileName = normalizePath(this.recordingPath + `/summar_audio_${this.timeStamp}_${this.elapsedTime}ms.${extension}`);
				this.startTime = new Date();

				await this.saveFile(blob, fileName);

				// 녹음이 중지되었으므로 일정 시간 대기 후 재시작
				// setTimeout(async () => {

				    // MediaRecorder가 완전히 비활성화될 때까지 기다림
					await this.recorder.waitForInactive();
					
					if (this.isRecording) {
						// if (this.startTime) {
						// 	this.elapsedTime = Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);
						// } else {
						// 	this.elapsedTime = 0;
						// }
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

				this.elapsedTime = Math.floor((new Date().getTime() - this.startTime.getTime()));
				const fileName = normalizePath(this.recordingPath + `/summar_audio_${this.timeStamp}_${this.elapsedTime}ms.${extension}`);
				this.startTime = new Date();

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
		// webm 파일이면 duration 메타데이터를 삽입
		if ((Platform.isMacOS && Platform.isDesktopApp) &&
			fileName.toLowerCase().endsWith('.webm')) {
			try {
				const fixWebmDuration = (await import("webm-duration-fix/lib/index.js")).default;
				const fixedBlob = await fixWebmDuration(blob);
				blob = fixedBlob;
				SummarDebug.log(1, `webm-duration-fix applied to: ${fileName}`);
			} catch (e) {
				SummarDebug.error(1, `webm-duration-fix failed for: ${fileName}`, e);
			}
		}

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

	/**
	 * 파일 경로에서 녹음 날짜를 추출합니다.
	 */
	private extractRecordingDateFromFilePath(filePath: string): Date | undefined {
		try {
			// 다양한 날짜 패턴 검색
			const patterns = [
				/(\d{4})-(\d{2})-(\d{2})/,  // YYYY-MM-DD
				/(\d{4})(\d{2})(\d{2})/,    // YYYYMMDD
				/(\d{4})\.(\d{2})\.(\d{2})/, // YYYY.MM.DD
				/(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
				/(\d{2})(\d{2})(\d{2})/,    // YYMMDD
			];

			for (const pattern of patterns) {
				const match = filePath.match(pattern);
				if (match) {
					let year = parseInt(match[1], 10);
					let month = parseInt(match[2], 10) - 1; // JavaScript Date는 월이 0부터 시작
					let day = parseInt(match[3], 10);
					
					// YYMMDD 패턴인 경우 (2자리 년도)
					if (pattern.source === /(\d{2})(\d{2})(\d{2})/.source) {
						// 2자리 년도를 4자리로 변환 (20년대는 2020년대, 그 외는 19년대로 가정)
						year = year >= 0 && year <= 30 ? 2000 + year : 1900 + year;
					}
					
					const date = new Date(year, month, day);
					if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
						SummarDebug.log(2, `Extracted recording date from file path: ${date.toISOString().split('T')[0]}`);
						return date;
					}
				}
			}

			SummarDebug.log(2, `No valid date found in file path: ${filePath}`);
			return undefined;
		} catch (error) {
			SummarDebug.log(2, `Error extracting date from file path: ${filePath}`, error);
			return undefined;
		}
	}
}
