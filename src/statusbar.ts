// import { Plugin } from "obsidian";

import { setIcon } from "obsidian";
import { SummarDebug } from "./globals";
import SummarPlugin from "./main";
import { SummarSettingsTab } from "./summarsettingtab";

export class StatusBar {
	plugin: SummarPlugin;
	statusBarItem: HTMLElement | null = null;

	constructor(plugin: SummarPlugin, showSettings?: boolean) {
		this.plugin = plugin;
		this.statusBarItem = this.plugin.addStatusBarItem();
		if (showSettings) {
			const iconEl = document.createElement("div");
			iconEl.classList.add("status-bar-icon-container");
			this.statusBarItem.appendChild(iconEl);

			this.statusBarItem.style.cursor = "pointer"; // 커서를 포인터로 변경
			this.statusBarItem.addEventListener("click", () => {
				// 클릭 이벤트 추가
				this.showScheduleSettings();
			});		
		}
	}

	update(message: string, color: string) {
		if (this.statusBarItem) {
			this.statusBarItem.textContent = message;
			this.statusBarItem.style.color = color;
		}
	}

	setStatusbarIcon(icon: string, color: string) {
		if (this.statusBarItem) {
			const iconEl = this.statusBarItem.querySelector(".status-bar-icon-container");
			if (iconEl) {
				iconEl.innerHTML = ""; // 기존 아이콘 제거
				setIcon(iconEl as HTMLElement, icon); // 새 아이콘 설정
				this.statusBarItem.style.color = color;
			}
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
	
		// Summar 설정창이 열릴 때까지 감시하는 함수
		const waitForSummarTab = () => {
			const settingsContainer = document.querySelector('.mod-settings');
			if (settingsContainer) {
				// SummarDebug.log(3, "설정창 감지 완료");
	
				// 현재 선택된 탭 확인
				const activeTab = settingsContainer.querySelector('.vertical-tab-nav-item.is-active') as HTMLElement;
				if (activeTab) {
					// SummarDebug.log(3, "현재 선택된 탭:", activeTab.innerText);
				}
	
				// Summar 탭 찾기
				const navLinks = deepQuerySelectorAll(settingsContainer, '.vertical-tab-nav-item');
				let summarTabClicked = false;
	
				navLinks.forEach((link) => {
					const linkEl = link as HTMLElement;
					// SummarDebug.log(3, "탭 이름:", linkEl.innerText);
	
					if (linkEl.innerText.includes("Summar")) {
						// SummarDebug.log(3, "Summar 설정창 활성화 시도");
	
						// Summar 탭 클릭
						const clickEvent = new MouseEvent('click', {
							bubbles: true,
							cancelable: true,
							view: window
						});
						linkEl.dispatchEvent(clickEvent);
	
						summarTabClicked = true;
					}
				});
	
				// Summar 설정창이 선택되지 않으면 계속 감시
				if (!summarTabClicked) {
					// SummarDebug.log(3, "Summar 설정창이 즉시 열리지 않음, 다시 감지...");
					requestAnimationFrame(waitForSummarTab);
				} else {
					// SummarDebug.log(3, "Summar 설정창 클릭됨, schedule-tab 감지 시작");
					this.plugin.summarSettingTab.activateTab('schedule-tab');
				}
			} else {
				// SummarDebug.log(3, "설정창이 아직 로드되지 않음, 다시 확인...");
				requestAnimationFrame(waitForSummarTab);
			}
		};
	
		// 설정창이 완전히 열릴 때까지 감시 시작
		requestAnimationFrame(waitForSummarTab);
	}
}
