import { normalizePath, Platform } from "obsidian";
import SummarPlugin from "./main";
import { SummarDebug, SummarViewContainer, getDeviceId, getDeviceIdFromLabel, getAvailableFilePath, sanitizeFileName } from "./globals";
import { SummarAI } from "./summarai";
import { NativeAudioRecorder } from "./audiorecorder";
import { RecordingTimer } from "./recordingtimer";
import { JsonBuilder } from "./jsonbuilder";
import { exec } from "child_process";

export class AudioRecordingManager extends SummarViewContainer {

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

		// 비동기 초기화 (가독성이 떨어짐)
		getDeviceId(plugin).then(deviceId => {
		this.deviceId = deviceId as string;
		});
	}

	async summarize(transcripted: string, newFilePath: string): Promise<string> {
		this.initOutputRecord("summary", false);
		this.updateOutputText("Summarizing from transcripted text");
		SummarDebug.log(1, `newFilePath: ${newFilePath}`);

		const transcriptSummaryPrompt = this.plugin.settingsv2.recording.transcriptSummaryPrompt;

		let summary = "";

		try {
			const summarai = new SummarAI(this.plugin, this.plugin.settingsv2.recording.transcriptSummaryModel, 'stt-summary');
			// if (!summarai.hasKey(true, outputKey, label)) return '';
			if (!summarai.hasKey(true, this.outputRecord.key, this.outputRecord.label as string)) return '';			

			this.updateOutputText(`Generating summary using [${this.plugin.settingsv2.recording.transcriptSummaryModel}]...` );
			this.startTimer();

			const message = `${transcriptSummaryPrompt}\n\n${transcripted}`;
			this.pushOutputPrompt(message);

			await summarai.complete([{role: 'user', text: message}]);
			const status = summarai.response.status;
			const summary = summarai.response.text;

			if (status !== 200) {
				SummarDebug.error(1, "OpenAI API Error:", summary);
				this.updateOutputText(`Error: ${status} - ${summary}`);

				this.stopTimer();
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

				this.updateOutputText(summary, true);
				this.setNewNoteName(summaryNote);
				
				SummarDebug.log(1,`newFilePath = ${newFilePath}`);

				if (this.plugin.settingsv2.recording.saveTranscriptAndRefineToNewNote) {
					await this.plugin.app.vault.create(summaryNote, summary);
					
					// refined가 활성화되어 있지 않으면 summary 파일을 열기
					// refined가 활성화되어 있으면 나중에 refined 파일이 열릴 예정이므로 summary는 열지 않음
					if (!this.plugin.settingsv2.recording.refineSummary) {
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

				if (this.plugin.settingsv2.recording.refineSummary)
				{
					this.stopTimer();
					this.foldOutput(true);
					await this.refine(transcripted, summary, summaryNote);
				}
			} else {
				this.updateOutputText("No valid response from OpenAI API.");
			}
			this.stopTimer();
			return summary;
		} catch (error) {
			this.stopTimer();
			SummarDebug.error(1, "Error:", error);
			let msg = "An error occurred while processing the request.";
			if (error) {
				msg += ` | ${error?.status || ''} ${error?.message || error?.toString?.() || error}`;
			}
			this.updateOutputText(msg);
			return summary;
		}
	}

	async refine(transcripted: string, summarized: string, newFilePath: string): Promise<string> {
		this.initOutputRecord("refinement", false);

		let refined = "";
		this.updateOutputText("Improving the summary…");

		const refineSummaryPrompt = this.plugin.settingsv2.recording.refineSummaryPrompt;

		try {
			const summarai = new SummarAI(this.plugin, this.plugin.settingsv2.recording.transcriptSummaryModel, 'stt-refine');
			// if (!summarai.hasKey(true, outputKey, label)) return '';
			if (!summarai.hasKey(true, this.outputRecord.key, this.outputRecord.label as string)) return '';			
			const messages = [
				{role: 'user', text: refineSummaryPrompt},
				{role: 'user', text: `=====회의록 요약본 시작=====\n\n${summarized}\n\n=====회의록 요약본 끝=====\n\n=====원본 transcript 시작=====\n\n${transcripted}\n\n====원본 transcript 끝====`}
			];

			SummarDebug.log(1, `messages1\n${messages[0].text}`);
			SummarDebug.log(1, `messages2\n${messages[1].text}`);
			
			this.updateOutputText(`Refining summary using [${this.plugin.settingsv2.recording.transcriptSummaryModel}]...`);

			this.pushOutputPrompt(messages[0].text);
			this.pushOutputPrompt(messages[1].text);
			this.startTimer();

			await summarai.complete(messages);
			const status = summarai.response.status;
			refined = summarai.response.text;

			if (status !== 200) {
				SummarDebug.error(1, "OpenAI API Error:", refined);
				this.updateOutputText(`Error: ${status} - ${refined}`);

				this.stopTimer();
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

				this.updateOutputText(refined, true);
				this.setNewNoteName(refinementNote);

				if (this.plugin.settingsv2.recording.saveTranscriptAndRefineToNewNote) {
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
				this.updateOutputText("No valid response from OpenAI API.");
			}
			this.stopTimer();
			return refined;
		} catch (error) {
			this.stopTimer();
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
			const selectedDeviceLabel = this.plugin.settingsv2.recording.selectedDeviceId[this.deviceId] || "";
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
		let currentEvent = null;
		let safeMeetingTitle = "";
		if (this.plugin.calendarHandler) {
			currentEvent = this.plugin.calendarHandler.findEventAtTime(this.startTime);
			if (currentEvent) {
				meetingInfo = this.plugin.calendarHandler.formatEventInfo(currentEvent);
				// 미팅 제목을 폴더명에 포함 (파일시스템에 안전한 문자만 사용)
				safeMeetingTitle = sanitizeFileName(currentEvent.title);
				folderSuffix = `_${safeMeetingTitle}`;
				SummarDebug.log(1, `Found calendar event: ${currentEvent.title}`);
			} else {
				SummarDebug.log(1, "No calendar event found for current time");
			}
		}

		SummarDebug.log(1, `recordingDir: ${this.plugin.settingsv2.recording.recordingDir}`);

		// 날짜별 폴더 구조 생성 옵션이 활성화된 경우
		let basePath = this.plugin.settingsv2.recording.recordingDir;
		if (this.plugin.settingsv2.recording.organizeByDate) {
			const now = new Date();
			const year = now.getFullYear();
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const day = String(now.getDate()).padStart(2, '0');
			const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
			const dayName = dayNames[now.getDay()];

			// YYYY/YYYY-MM/YYYY-MM-DD (Day) 형식으로 폴더 구조 생성
			const datePath = `${year}/${year}-${month}/${year}-${month}-${day} (${dayName})`;
			basePath = normalizePath(basePath + "/" + datePath);
		}

		this.recordingPath = normalizePath(basePath + "/" + this.timeStamp + folderSuffix);
		await this.plugin.app.vault.adapter.mkdir(this.recordingPath);
		SummarDebug.log(1,`recordingPath: ${this.recordingPath}`);

		// 미팅 정보가 있으면 meeting-info.md 파일과 event-metadata.json 파일로 저장
		if (meetingInfo) {
			const folderName = this.recordingPath.split('/').pop() || this.timeStamp;
			const meetingInfoPath = normalizePath(this.recordingPath + `/${folderName} meeting-info.md`);
			await this.plugin.app.vault.adapter.write(meetingInfoPath, meetingInfo);
			SummarDebug.log(1, `Meeting info saved to: ${meetingInfoPath}`);

			// 캘린더 이벤트 메타데이터를 JSON으로 저장 (일관성 보장을 위해)
			if (currentEvent) {
				const eventMetadata = {
					title: currentEvent.title,
					start: currentEvent.start.toISOString(),
					end: currentEvent.end.toISOString(),
					description: currentEvent.description,
					location: currentEvent.location,
					zoom_link: currentEvent.zoom_link,
					attendees: currentEvent.attendees,
					participant_status: currentEvent.participant_status,
					safeMeetingTitle: safeMeetingTitle, // sanitized된 제목도 함께 저장
					recordingTimestamp: this.startTime?.toISOString() // 녹음 시작 시간도 저장
				};
				const metadataPath = normalizePath(this.recordingPath + `/event-metadata.json`);
				await this.plugin.app.vault.adapter.write(metadataPath, JSON.stringify(eventMetadata, null, 2));
				SummarDebug.log(1, `Event metadata saved to: ${metadataPath}`);
			}
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
		if (fileName.toLowerCase().endsWith('.webm')) {
			try {
				const ysFixWebmDuration = (await import("fix-webm-duration")).default;
				// duration을 밀리초 단위로 전달
				const fixedBlob = await ysFixWebmDuration(blob, this.elapsedTime, { logger: false });
				blob = fixedBlob;
				SummarDebug.log(1, `fix-webm-duration applied to: ${fileName} (duration: ${this.elapsedTime}ms)`);
			} catch (e) {
				SummarDebug.error(1, `fix-webm-duration failed for: ${fileName}`, e);
			}
		}

		return new Promise((resolve, reject) => {
			try {			
				SummarDebug.log(1, `saveFile(filenName): ${fileName}`);
				blob.arrayBuffer()
					.then((buffer) => {
						this.plugin.app.vault.createBinary(fileName, buffer)
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
		if (!this.plugin.settingsv2.recording.autoRecordOnVideoMeeting) return;
		if (this.zoomWatcherInterval) return;
		this.zoomWatcherInterval = setInterval(() => {
			// macOS: Zoom 미팅 중에만 존재하는 프로세스(CptHost) 감지
			exec('pgrep -x "CptHost"', (err, stdout) => {
				const isMeetingRunning = !!stdout.trim();
				if (isMeetingRunning && !this.wasZoomRunning) {
					// Zoom 미팅 시작됨
					this.plugin.recordingManager.startRecording(this.plugin.settingsv2.recording.recordingUnit);
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
			SummarDebug.log(1, "Zoom auto record watcher stopped");
		}
	}

	/**
	 * 플러그인 언로드 시 모든 recording 관련 리소스를 정리합니다.
	 */
	async cleanup() {
		try {
			// Zoom watcher 중지
			this.stopZoomAutoRecordWatcher();

			// 현재 녹음 중이라면 강제 중단
			const currentState = this.getRecorderState();
			if (currentState === "recording" || currentState === "paused") {
				SummarDebug.log(1, "Force stopping active recording during cleanup");
				try {
					await this.stopRecording();
				} catch (error) {
					SummarDebug.error(1, "Error stopping recording during cleanup:", error);
				}
			}

			// AudioRecorder cleanup
			if (this.recorder) {
				this.recorder.cleanup();
			}

			// Timer들 정리
			this.stopTimer();
			if (this.recordingTimer) {
				// RecordingTimer에 stop 메서드가 있는지 확인 필요
				SummarDebug.log(2, "RecordingTimer cleanup completed");
			}

			SummarDebug.log(1, "RecordingManager cleanup completed");
		} catch (error) {
			SummarDebug.error(1, "Error during RecordingManager cleanup:", error);
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
