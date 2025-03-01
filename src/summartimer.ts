import { SummarViewContainer } from "./globals";
import SummarPlugin from "./main";

export class SummarTimer extends SummarViewContainer {
  timerInterval: number | undefined; // 타이머 ID
  dotCount = 0; // 점(.)의 개수
  started = false; // 시작 여부

  constructor(plugin: SummarPlugin) {
    super(plugin);
  }
  // 타이머 시작 함수
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true; // 시작 여부 변경
    this.dotCount = 0; // 초기화
    this.timerInterval = window.setInterval(() => {
      // 텍스트에 점(.) 추가
      this.appendResultText(".");
      this.enableNewNote(false);
      this.dotCount++;
    }, 500); // 500ms마다 실행
  }

  // 타이머 정지 함수
  stop(): void {
    if (this.timerInterval !== undefined) {
      clearInterval(this.timerInterval); // 타이머 종료
      this.started = false; // 시작 여부 변경
    }
  }
}