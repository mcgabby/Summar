// import { SummarViewContainer } from "./globals";
import SummarPlugin from "./main";

export class RecordingTimer {
  timerInterval: number | undefined; // 타이머 ID
  plugin: SummarPlugin;
  elapsedTime: number;

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
  }
  // 타이머 시작 함수
  start(): void {
    this.elapsedTime = 0;

    this.timerInterval = window.setInterval(() => {
      this.elapsedTime += 1000;
      const seconds = Math.floor(this.elapsedTime / 1000) % 60;
      const minutes = Math.floor(this.elapsedTime / 1000 / 60) % 60;
      const hours = Math.floor(this.elapsedTime / 1000 / 60 / 60);
  
      const pad = (n: number) => (n < 10 ? "0" + n : n);
  
      this.plugin.recordButton.textContent =`[■] ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }, 1000); // 500ms마다 실행
  }

  // 타이머 정지 함수
  stop(): void {
    if (this.timerInterval !== undefined) {
      this.plugin.recordButton.textContent =`[●] record`;
      clearInterval(this.timerInterval); // 타이머 종료
    }
  }
}
