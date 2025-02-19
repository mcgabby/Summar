import { Notice } from "obsidian";
import { SummarDebug } from "./globals";

export interface AudioRecorder {
	startRecording(deviceId: string): Promise<void>;
	pauseRecording(): Promise<void>;
	stopRecording(): Promise<Blob>;
}

function getSupportedMimeType(): string | undefined {
	const mimeTypes = ["audio/webm", "audio/ogg", "audio/mp3", "audio/mp4"];

	for (const mimeType of mimeTypes) {
		if (MediaRecorder.isTypeSupported(mimeType)) {
			return mimeType;
		}
	}

	return undefined;
}

export class NativeAudioRecorder implements AudioRecorder {
	private chunks: BlobPart[] = [];
	private recorder: MediaRecorder | null = null;
	private mimeType: string | undefined;

	getRecordingState(): "inactive" | "recording" | "paused" | undefined {
		return this.recorder?.state;
	}

	getMimeType(): string | undefined {
		return this.mimeType;
	}

	async startRecording(deviceId: string): Promise<void> {
		if (!this.recorder) {
			try {

				const stream = await navigator.mediaDevices.getUserMedia({
					audio: { deviceId },
				});

				this.mimeType = getSupportedMimeType();

				if (!this.mimeType) {
					throw new Error("No supported mimeType found");
				}

				const options = { mimeType: this.mimeType };
				const recorder = new MediaRecorder(stream, options);

				recorder.addEventListener("dataavailable", (e: BlobEvent) => {
					SummarDebug.log(3, "dataavailable", e.data.size);
					this.chunks.push(e.data);
				});

				this.recorder = recorder;
			} catch (err) {
				new Notice("Error initializing recorder: " + err);
				SummarDebug.error(1, "Error initializing recorder:", err);
				return;
			}
		}

		this.recorder.start(100);
	}

	// MediaRecorder가 완전히 비활성화될 때까지 대기
	async waitForInactive(): Promise<void> {
		return new Promise((resolve) => {
			if (this.recorder && this.recorder.state !== "inactive") {
				// stop 이벤트가 발생할 때까지 대기
				this.recorder.addEventListener("stop", () => {
					// state가 inactive인지 확인
					if (this.recorder?.state === "inactive") {
						resolve();
					}
				}, { once: true });
			} else {
				resolve();
			}
		});
	}
	
	async pauseRecording(): Promise<void> {
		if (!this.recorder) {
			return;
		}

		if (this.recorder.state === "recording") {
			this.recorder.pause();
		} else if (this.recorder.state === "paused") {
			this.recorder.resume();
		}
	}

	async stopRecording(): Promise<Blob> {
		return new Promise((resolve) => {
			if (!this.recorder || this.recorder.state === "inactive") {
				const blob = new Blob(this.chunks, { type: this.mimeType });
				this.chunks.length = 0;

				SummarDebug.log(1, "Stop recording (no active recorder):", blob);

				resolve(blob);
			} else {
				this.recorder.addEventListener(
					"stop",
					() => {
						const blob = new Blob(this.chunks, {
							type: this.mimeType,
						});
						this.chunks.length = 0;

						SummarDebug.log(1, "Stop recording (active recorder):", blob);

						// will stop all the tracks associated with the stream, effectively releasing any resources (like the mic) used by them
						if (this.recorder) {
							this.recorder.stream
								.getTracks()
								.forEach((track) => track.stop());
							this.recorder = null;
						}

						resolve(blob);
					},
					{ once: true }
				);

				this.recorder.stop();
			}
		});
	}
}
