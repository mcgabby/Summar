// import { Plugin } from "obsidian";

import { SummarDebug } from "./globals";
import SummarPlugin from "./main";

export class StatusBar {
	plugin: SummarPlugin;
	statusBarItem: HTMLElement | null = null;

	constructor(plugin: SummarPlugin) {
		this.plugin = plugin;
		this.statusBarItem = this.plugin.addStatusBarItem();
		this.statusBarItem.style.cursor = "pointer"; // 커서를 포인터로 변경
		this.statusBarItem.addEventListener("click", () => {
			// 클릭 이벤트 추가
			this.showScheduleSettings();
		});		
	}

	update(message: string, color: string) {
		if (this.statusBarItem) {
			this.statusBarItem.textContent = message;
			this.statusBarItem.style.color = color;
		}
	}

	remove() {
		if (this.statusBarItem) {
			this.statusBarItem.remove();
		}
	}
	async showScheduleSettings() {
     // 설정 창 열기
	 (this.plugin.app as any).commands.executeCommandById("app:open-settings");

	 // Shadow DOM까지 모두 탐색하는 재귀 함수
	 const deepQuerySelectorAll = (root: ParentNode, selector: string): HTMLElement[] => {
		 const elements = Array.from(root.querySelectorAll(selector)) as HTMLElement[];
		 const shadowHosts = Array.from(root.querySelectorAll('*')).filter(el => (el as HTMLElement).shadowRoot) as HTMLElement[];
 
		 shadowHosts.forEach(shadowHost => {
			 if (shadowHost.shadowRoot) {
				 elements.push(...deepQuerySelectorAll(shadowHost.shadowRoot, selector));
			 }
		 });
 
		 return elements;
	 };
 
	 // .mod-settings 내부에서 깊이 탐색
	 const waitForSettings = () => {
		 const settingsContainer = document.querySelector('.mod-settings');
		 if (settingsContainer) {
			 console.log("설정창 감지 완료");
 
			 // .mod-settings 내부 DOM 변화 감지
			 const observer = new MutationObserver((mutations, obs) => {
				 console.log("설정창 내부 DOM 변화 감지");
 
				 // Shadow DOM까지 깊이 탐색하여 .vertical-tab-nav-item 찾기
				 const navLinks = deepQuerySelectorAll(settingsContainer, '.vertical-tab-nav-item');
				 if (navLinks.length > 0) {
					 console.log("탭 목록 발견");
 
					 navLinks.forEach((link) => {
						 const linkEl = link as HTMLElement;
						 console.log("탭 이름:", linkEl.innerText);
 
						 // SummarSettingsTab 클릭
						 if (linkEl.innerText.includes("Summar")) {
							 // 클릭 이벤트를 강제로 발생 (MouseEvent 사용)
							 const clickEvent = new MouseEvent('click', {
								 bubbles: true,
								 cancelable: true,
								 view: window
							 });
							 linkEl.dispatchEvent(clickEvent);
 
							 console.log("SummarSettingsTab 클릭");
 
							 // schedule-tab을 활성화
							 const waitForScheduleTab = () => {
								 const scheduleTabButton = deepQuerySelectorAll(settingsContainer, '#schedule-tab .clickable-icon')[0];
								 if (scheduleTabButton) {
									 // 클릭 이벤트를 강제로 발생 (MouseEvent 사용)
									 const clickEvent = new MouseEvent('click', {
										 bubbles: true,
										 cancelable: true,
										 view: window
									 });
									 scheduleTabButton.dispatchEvent(clickEvent);
 
									 console.log("schedule-tab 클릭 완료");
									 // 작업 완료 후 MutationObserver 중지
									 obs.disconnect();
								 } else {
									 // schedule-tab이 나타날 때까지 계속 확인
									 requestAnimationFrame(waitForScheduleTab);
								 }
							 };
 
							 // schedule-tab 확인 시작 (한 번만 실행)
							 requestAnimationFrame(waitForScheduleTab);
 
							 // 클릭 후 더 이상 반복하지 않도록 observer 중지
							 obs.disconnect();
						 }
					 });
				 }
			 });
 
			 // .mod-settings 내부 DOM 변화를 감시
			 observer.observe(settingsContainer, { childList: true, subtree: true });
		 } else {
			 // .mod-settings가 나타날 때까지 계속 확인
			 requestAnimationFrame(waitForSettings);
		 }
	 };
 
	 // .mod-settings 확인 시작
	 requestAnimationFrame(waitForSettings);
	}
	
}
