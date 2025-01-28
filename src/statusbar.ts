import { Plugin } from "obsidian";

export class StatusBar {
	plugin: Plugin;
	statusBarItem: HTMLElement | null = null;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.statusBarItem = this.plugin.addStatusBarItem();
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
}
