import { TFile, TFolder, normalizePath, requestUrl, RequestUrlParam } from "obsidian";
import SummarPlugin from "./main";
import { SummarDebug, SummarRequestUrl, SummarViewContainer } from "./globals";
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

				const audioFilePath = normalizePath(`${noteFilePath}/${file.name}`);
				SummarDebug.log(1, `audioFilePath: ${audioFilePath}`);

				try {
/**
					const ext = fileName.split(".").pop()?.toLowerCase();
					const encoding = this.getEncodingFromExtension(ext);
    				const audioBase64 = await this.readFileAsBase64(audioFilePath);
					const transcript = await this.callGoogleTranscription(audioBase64, encoding as string);
					return transcript || "";
/**/
					const blob = file.slice(0, file.size, file.type);
					const { body: finalBody, contentType } = await this.buildMultipartFormData(blob, fileName, file.type);
					const data = await this.callWhisperTranscription(finalBody, contentType);
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
/**/
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

	mapLanguageToWhisperCode(lang: string): string {
		const map: Record<string, string> = {
		  // BCP-47 전체 코드 → Whisper 언어 코드
		  "ko-KR": "ko",
		  "ja-JP": "ja",
		  "en-US": "en",
		  "en-GB": "en",
		  "zh-CN": "zh",
		  "zh-TW": "zh",
		  "fr-FR": "fr",
		  "de-DE": "de",
		  "es-ES": "es",
		  "pt-PT": "pt",
		  "pt-BR": "pt",
		  "vi-VN": "vi", // 베트남어
		  "th-TH": "th", // 태국어
	  
		  // Whisper 코드 그대로인 경우도 허용
		  "ko": "ko",
		  "ja": "ja",
		  "en": "en",
		  "zh": "zh",
		  "fr": "fr",
		  "de": "de",
		  "es": "es",
		  "pt": "pt",
		  "vi": "vi",
		  "th": "th",
		};
	  
		const normalized = lang.trim().toLowerCase();
		return map[normalized] ?? "ko"; // 기본값은 영어
	}

	async buildMultipartFormData(blob: Blob, fileName: string, fileType: string): Promise<{ body: Blob, contentType: string }> {
		const encoder = new TextEncoder();
		const boundary = "----SummarFormBoundary" + Math.random().toString(16).slice(2);
		const CRLF = "\r\n";

		const bodyParts: (Uint8Array | Blob | string)[] = [];

		function addField(name: string, value: string) {
			bodyParts.push(
				encoder.encode(`--${boundary}${CRLF}`),
				encoder.encode(`Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}`),
				encoder.encode(`${value}${CRLF}`)
			);
		}

		function addFileField(name: string, filename: string, type: string, content: Uint8Array) {
			bodyParts.push(
				encoder.encode(`--${boundary}${CRLF}`),
				encoder.encode(`Content-Disposition: form-data; name="${name}"; filename="${filename}"${CRLF}`),
				encoder.encode(`Content-Type: ${type}${CRLF}${CRLF}`),
				content,
				encoder.encode(CRLF)
			);
		}

		const arrayBuffer = await blob.arrayBuffer();
		const binaryContent = new Uint8Array(arrayBuffer);

		addFileField("file", fileName, fileType, binaryContent);
		addField("model", this.plugin.settings.transcriptEndpoint || "whisper-1");

		if (this.plugin.settings.recordingLanguage) {
			addField("language", this.mapLanguageToWhisperCode(this.plugin.settings.recordingLanguage));
		}

		addField("response_format", this.plugin.settings.transcriptEndpoint === "whisper-1" ? "verbose_json" : "json");

		if (this.plugin.settings.transcriptEndpoint !== "whisper-1" && this.plugin.settings.transcribingPrompt) {
			addField("prompt", this.plugin.settings.transcribingPrompt);
		}

		bodyParts.push(encoder.encode(`--${boundary}--${CRLF}`));

		return {
			body: new Blob(bodyParts, { type: `multipart/form-data; boundary=${boundary}` }),
			contentType: `multipart/form-data; boundary=${boundary}`
		};
	}

	async callWhisperTranscription(requestbody: Blob, contentType: string): Promise<any> {
		const response = await requestUrl({
			url: "https://api.openai.com/v1/audio/transcriptions",
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.plugin.settings.openaiApiKey}`,
				"Content-Type": contentType,
			},
			body: await requestbody.arrayBuffer(),
		});

		return response.json;
	}

	////////////////////////////
	getEncodingFromExtension(ext?: string): string | null {
		switch (ext) {
		  case "webm": return "WEBM_OPUS";
		  case "mp3": return "MP3";
		  case "wav": return "LINEAR16";
		  case "ogg": return "OGG_OPUS";
		  case "m4a": return "MP4";
		  default: return null;
		}
	}

	async readFileAsBase64(filePath: string): Promise<string> {
		const arrayBuffer = await this.plugin.app.vault.adapter.readBinary(filePath);
		const uint8Array = new Uint8Array(arrayBuffer);
		let binary = '';
		uint8Array.forEach(byte => binary += String.fromCharCode(byte));
		return btoa(binary);
	}

	async callGoogleTranscription(audioBase64: string, encoding: string): Promise<string | null> {
		const apiKey = this.plugin.settings.googleApiKey;
		if (!apiKey || apiKey.length === 0) {
		  SummarDebug.Notice(1, "Google API key is missing. Please add your API key in the settings.");
		  return null;
		}
	
		const request: RequestUrlParam = {	
		  url: `https://speech.googleapis.com/v1/speech:recognize?key=${this.plugin.settings.googleApiKey}`,
		  method: "POST",
		  headers: {
			"Content-Type": "application/json",
		  },
		  body: JSON.stringify({
			config: {
			  encoding: encoding,
			//   sampleRateHertz: 16000,
			  languageCode: "ko-KR",
			},
			audio: {
			  content: audioBase64,
			},
		  }),
		};
	
		try {
		  const response = await SummarRequestUrl(this.plugin, request);
		  const results = response.json.results;
		  if (results && results.length > 0) {
			SummarDebug.log(1, `Google Speech-to-Text API response: ${JSON.stringify(results)}`);
			return results.map((r: any) => r.alternatives[0].transcript).join("\n");
		  } else {
			const errorMessage = response.json.error?.message || "Unknown error";
			if (errorMessage) {
				SummarDebug.Notice(1, `Google Speech-to-Text API error: ${errorMessage}`);
				throw new Error(`Google Speech-to-Text API error: ${errorMessage}`);
			} else {
				SummarDebug.Notice(1, "No transcription results found.");	
			}
			return "";
		  }
		} catch (error) {
		  SummarDebug.Notice(1, "Error calling Google Speech-to-Text API:", error);
		  return null;
		}
	}
}
