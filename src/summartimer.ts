import { SummarViewContainer, SummarViewContainer2 } from "./globals";

export class SummarTimer {
  timerInterval: number | undefined; // 타이머 ID
  dotCount = 0; // 점(.)의 개수
  resultContainer: { value: string }; // 결과 텍스트 영역

  constructor(resultContainer: { value: string }) {
    this.resultContainer = resultContainer;
  }
  // 타이머 시작 함수
  start(): void {
    this.dotCount = 0; // 초기화
    this.timerInterval = window.setInterval(() => {
      // 텍스트에 점(.) 추가
      SummarViewContainer.appendText(this.resultContainer, ".");
      this.dotCount++;
    }, 500); // 500ms마다 실행
  }

  // 타이머 정지 함수
  stop(): void {
    if (this.timerInterval !== undefined) {
      clearInterval(this.timerInterval); // 타이머 종료
    }
  }
}


export class SummarTimer2 extends SummarViewContainer2 {
  timerInterval: number | undefined; // 타이머 ID
  dotCount = 0; // 점(.)의 개수
  // resultContainer: { value: string }; // 결과 텍스트 영역

  constructor(resultContainer: HTMLTextAreaElement) {
    // this.resultContainer = resultContainer;
    super(resultContainer);
  }
  // 타이머 시작 함수
  start(): void {
    this.dotCount = 0; // 초기화
    this.timerInterval = window.setInterval(() => {
      // 텍스트에 점(.) 추가
      super.appendResultText(".");
      this.dotCount++;
    }, 500); // 500ms마다 실행
  }

  // 타이머 정지 함수
  stop(): void {
    if (this.timerInterval !== undefined) {
      clearInterval(this.timerInterval); // 타이머 종료
    }
  }
}