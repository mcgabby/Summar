// import { Plugin } from "obsidian";

import { setIcon } from "obsidian";
import { SummarDebug, showSettingsTab } from "./globals";
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

            // 🔥 마우스오버 효과 추가
            this.statusBarItem.style.cursor = "pointer"; // 커서를 포인터로 변경
            this.statusBarItem.style.transition = "all 0.2s ease"; // 부드러운 전환 효과
            this.statusBarItem.style.padding = "2px 8px"; // 패딩 추가로 터치 영역 확대
            this.statusBarItem.style.borderRadius = "5px"; // 둥근 모서리 효과

            this.statusBarItem.addEventListener("mouseenter", () => {
                this.statusBarItem!.style.backgroundColor = "rgba(192, 192, 192, 0.2)"; // 마우스 오버 시 배경색 변경
                this.statusBarItem!.style.boxShadow = "0 0 5px rgba(192, 192, 192, 0.5)"; // 약간의 그림자 효과
                this.statusBarItem!.style.transform = "scale(1.05)"; // 약간 확대 효과
            });

            this.statusBarItem.addEventListener("mouseleave", () => {
                this.statusBarItem!.style.backgroundColor = "transparent"; // 마우스가 나가면 원래대로
                this.statusBarItem!.style.boxShadow = "none"; // 그림자 효과 제거
                this.statusBarItem!.style.transform = "scale(1)"; // 원래 크기로 복귀
            });

            // 클릭 이벤트 추가
            this.statusBarItem.addEventListener("click", () => {
                showSettingsTab(this.plugin, 'schedule-tab');
                // showSettingsTab(this.plugin, 'common-tab');
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

}
