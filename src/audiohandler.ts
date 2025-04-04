import { TFile, TFolder, normalizePath } from "obsidian";
import SummarPlugin from "./main";
import { SummarDebug, SummarViewContainer } from "./globals";
import { SummarTimer } from "./summartimer";

export class AudioHandler extends SummarViewContainer {
	private timer: SummarTimer;

	constructor(plugin: SummarPlugin) {
		super(plugin);
		this.timer = new SummarTimer(plugin);
	}

	async sendAudioData(files: FileList | File[], givenFolderPath: string = ""): Promise<{ fullText: string, newFilePath: string }> {
		this.updateResultText("convert audio to text using [" + this.plugin.settings.transcriptEndpoint + "]");
		this.enableNewNote(false);

		let audioList = "";
		let fullText = "";

		// API Key 확인
		if (!this.plugin.settings.openaiApiKey) {
			SummarDebug.Notice(0,
				"API key is missing. Please add your API key in the settings."
			);
			return { fullText: "", newFilePath: "" };
		}

		// Convert FileList to an array
		const fileArray = Array.from(files);

		// Sort files by their relative path (webkitRelativePath if available, otherwise file name)
		const sortedFiles = fileArray.sort((a, b) => {
			const pathA = (a as any).webkitRelativePath || a.name;
			const pathB = (b as any).webkitRelativePath || b.name;
			return pathA.localeCompare(pathB);
		});

		// Calculate the common folder path
		let folderPath = "";
		let noteFilePath = "";
		if (!givenFolderPath || givenFolderPath.length===0) {
			if (sortedFiles.length === 1) {
				folderPath  = sortedFiles[0].name.substring(0,sortedFiles[0].name.lastIndexOf('.')) || sortedFiles[0].name;
				noteFilePath = normalizePath(`${this.plugin.settings.recordingDir}`);
				SummarDebug.log(1, `sendAudioData - only one file`)
			} else {
				folderPath = this.getCommonFolderPath(sortedFiles);
				SummarDebug.log(1, `sendAudioData - Detected folder path: ${folderPath}`); // Debug log
				noteFilePath = normalizePath(`${this.plugin.settings.recordingDir}/${folderPath}`);
			}
		} else {
			noteFilePath = givenFolderPath;
			const match = givenFolderPath.match(/[^\/]+$/);
			folderPath = match ? match[0] : noteFilePath;
			SummarDebug.log(1, `sendAudioData - Given folder path: ${folderPath}`); // Debug log
		}

		SummarDebug.log(1, `sendAudioData - noteFilePath: ${noteFilePath}`);

		// 출력: 정렬된 파일 갯수와 이름
		SummarDebug.log(1, `Number of sorted files: ${sortedFiles.length}`);

		for (const [index, file] of sortedFiles.entries()) {
			const filePath = (file as any).webkitRelativePath || file.name;
			SummarDebug.log(1, `File ${index + 1}: ${filePath}`);
			if (file.type.startsWith("audio/") || 
				file.name.toLowerCase().endsWith(".mp3") ||
				file.name.toLowerCase().endsWith(".wav") ||
				file.name.toLowerCase().endsWith(".ogg") ||
				file.name.toLowerCase().endsWith(".m4a") ||
			    file.name.toLowerCase().endsWith(".webm")) {
				const audioFilePath = normalizePath(`${noteFilePath}/${file.name}`);
				SummarDebug.log(1, `audioFilePath: ${audioFilePath}`);

				// 파일 존재 여부 확인
				const fileExists = await this.plugin.app.vault.adapter.exists(audioFilePath);
				if (!fileExists) {
					// 파일 저장
					await this.plugin.app.vault.adapter.mkdir(noteFilePath);

					const fileContent = await file.arrayBuffer(); // File 객체의 내용을 ArrayBuffer로 변환
					const binaryContent = new Uint8Array(fileContent);

					try {
						await this.plugin.app.vault.adapter.writeBinary(audioFilePath, binaryContent);
						SummarDebug.log(1, `File saved at: ${audioFilePath}`);
					} catch (error) {
						SummarDebug.error(1, `Error saving file: ${audioFilePath}`, error);
					}
				} else {
					SummarDebug.log(1, `File already exists: ${audioFilePath}`);
				}

				audioList += `![[${audioFilePath}]]\n`;
				SummarDebug.log(1, `audioList: ${audioList}`);
			}
		}

		this.timer.start();

		// Process files in parallel
		const transcriptionPromises = sortedFiles
			.filter((file) => file.type.startsWith("audio/") || 
				file.name.toLowerCase().endsWith(".mp3") ||
				file.name.toLowerCase().endsWith(".wav") ||
				file.name.toLowerCase().endsWith(".ogg") ||
				file.name.toLowerCase().endsWith(".m4a") ||
				file.name.toLowerCase().endsWith(".webm"))
			.map(async (file) => {
				const fileName = file.name;
				const blob = file.slice(0, file.size, file.type);

				const audioFilePath = normalizePath(`${noteFilePath}/${file.name}`);
				SummarDebug.log(1, `audioFilePath: ${audioFilePath}`);

				const formData = new FormData();
				formData.append("file", blob, fileName);
				formData.append("model", this.plugin.settings.transcriptEndpoint || "whisper-1");
				if (this.plugin.settings.recordingLanguage && this.plugin.settings.recordingLanguage.length > 0) {
					formData.append("language", this.plugin.settings.recordingLanguage);
				}

				if (this.plugin.settings.transcriptEndpoint === "whisper-1") {
					formData.append("response_format", "verbose_json");
				} else {
					formData.append("response_format", "json");
					if (this.plugin.settings.transcribingPrompt && this.plugin.settings.transcribingPrompt.length > 0) {
						formData.append("prompt", this.plugin.settings.transcribingPrompt);
					}
				}


				try {
					// Whisper API 호출 (fetch 사용)
					const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${this.plugin.settings.openaiApiKey}`,
						},
						body: formData,
					});
		
					const data = await response.json();
					
					// response.text().then((text) => {
					// 	SummarDebug.log(3, `Response sendAudioData: ${text}`);
					// });

					// 응답 확인
					if (!data.segments || data.segments.length === 0) {
						SummarDebug.log(1, `No transcription segments received for file: ${fileName}`);
						if (data.text && data.text.length > 0) {
							return data.text;
						} else {
							SummarDebug.log(1, `No transcription text received for file: ${fileName}`);
							return "";
						}
					}

					const match = fileName.match(/_(\d+)s\.(webm|wav|mp3|ogg|m4a)$/); // `_숫자s.webm` 패턴 찾기
					const seconds = match ? parseInt(match[1], 10) : 0; // 숫자로 변환
					// SRT 포맷 변환
					const srtContent = data.segments
						.map((segment: any, index: number) => {
							const start = this.formatTime(segment.start + seconds);
							const end = this.formatTime(segment.end + seconds);
							const text = segment.text.trim();

							// return `${index + 1}\n${start} --> ${end}\n${text}\n`;
							return `${start} --> ${end}\n${text}\n`;
						})
						.join("");

					return srtContent;

				} catch (error) {
					SummarDebug.error(1, `Error processing file ${fileName}:`, error);
					this.timer.stop();
					return "";
				}
			});

		// Wait for all transcriptions to complete
		const transcriptions = await Promise.all(transcriptionPromises);

		// Combine all transcriptions
		fullText = transcriptions.join("\n");

		const baseFilePath = normalizePath(`${noteFilePath}/${folderPath}`);

		// Function to find the next available filename with postfix
		const getAvailableFilePath = (basePath: string): string => {
			let index = 1;
			let currentPath = `${basePath}.md`;
			while (this.plugin.app.vault.getAbstractFileByPath(currentPath)) {
				currentPath = `${basePath} (${index}).md`;
				index++;
			}
			return currentPath;
		};
		// Check if the file already exists
		const existingFile = this.plugin.app.vault.getAbstractFileByPath(`${baseFilePath}.md`);
		let newFilePath = ""
		if (existingFile && existingFile instanceof TFile) {
			// If the file exists, find a new unique filename
			newFilePath = getAvailableFilePath(baseFilePath);
			SummarDebug.log(1, `File already exists. Created new file: ${newFilePath}`);
		} else {
			// If the file does not exist, create it
			newFilePath = `${baseFilePath}.md`;
			SummarDebug.log(1, `File created: ${newFilePath}`);
		}
		await this.plugin.app.vault.create(newFilePath, `${audioList}\n${fullText}`);
		await this.plugin.app.workspace.openLinkText(
			normalizePath(newFilePath),
			"",
			true
		);
		this.timer.stop();
		return {fullText,newFilePath};
	}

	// Helper function to calculate the common folder path
	private getCommonFolderPath(files: File[]): string {
		// Extract full paths (webkitRelativePath includes folder structure)
		const paths = files.map((file) => (file as any).webkitRelativePath || file.name);

		if (paths.length === 0) {
			return ""; // No files provided
		}

		// Split paths into components and find the common prefix
		const splitPaths = paths.map((path) => path.split("/"));
		const commonParts: string[] = [];

		for (let i = 0; i < splitPaths[0].length; i++) {
			const part = splitPaths[0][i];
			if (splitPaths.every((segments) => segments[i] === part)) {
				commonParts.push(part);
			} else {
				break;
			}
		}

		return commonParts.join("/");
	}

	// Check if the file is an audio or webm file
	isAudioOrWebmFile(file: TFile): boolean {
		const audioExtensions = ["mp3", "wav", "flac", "m4a", "ogg", "webm"];
		const extension = file.extension?.toLowerCase();
		return audioExtensions.includes(extension);
	}

	// Check if the folder contains any audio or webm files
	folderContainsAudioOrWebm(folder: TFolder): boolean {
		const files = this.plugin.app.vault.getFiles();
		return files.some(
			(file) =>
				file.parent !== null && // Ensure file.parent is not null
				file.parent.path === folder.path &&
				this.isAudioOrWebmFile(file)
		);
	}

	formatTime(seconds: number): string {
		const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
		const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
		const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
		const milliseconds = Math.floor((seconds % 1) * 1000).toString().padStart(3, "0");

		return `${hours}:${minutes}:${secs}.${milliseconds}`;
	}
}
