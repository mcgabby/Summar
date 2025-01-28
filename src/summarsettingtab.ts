import { PluginSettingTab, Setting } from "obsidian";
import { SummarDebug } from "./globals";
import SummarPlugin from "./main";


export class SummarSettingsTab extends PluginSettingTab {
  plugin: SummarPlugin;
  savedTabId: string;

  constructor(plugin: SummarPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
    this.savedTabId = 'common-tab';
  }

  async display(): Promise<void> {
    const { containerEl } = this;

    if (!containerEl || !this.plugin.settings) {
      SummarDebug.error(1, "Settings or containerEl not initialized correctly.");
      return;
    }

    containerEl.empty();

    // Create tabs container
    const tabsContainer = containerEl.createDiv({ cls: 'settings-tabs' });
    const tabContents = containerEl.createDiv({ cls: 'settings-tab-contents' });
    const tabs = [
      { name: 'Common', id: 'common-tab' },
      { name: 'Webpage Summary', id: 'webpage-tab' },
      { name: 'PDF Summary', id: 'pdf-tab' },
      { name: 'Recording Summary', id: 'recording-tab' },
    ];

    // Load last active tab from localStorage or default to the first tab
    // const savedTabId = localStorage.getItem('obsidian-active-tab');
    // let activeTab = savedTabId && tabs.some((tab) => tab.id === savedTabId) ? savedTabId : tabs[0].id;
    let activeTab = this.savedTabId;

    // Create tabs
    tabs.forEach((tab) => {
      const tabButton = tabsContainer.createEl('button', {
        text: tab.name,
        cls: 'settings-tab-button',
      });

      if (tab.id === activeTab) {
        tabButton.addClass('active');
      }

      tabButton.addEventListener('click', () => {
        this.savedTabId = activeTab = tab.id;

        // Update active state
        tabsContainer.querySelectorAll('.settings-tab-button').forEach((btn) => {
          btn.removeClass('active');
        });
        tabButton.addClass('active');

        // Show active tab content
        tabContents.querySelectorAll('.settings-tab-content').forEach((content) => {
          content.toggleClass('hidden', content.id !== activeTab);
        });
      });
    });   


    // Create tab contents
    (async () => {
      for (const tab of tabs) {
        const tabContent = tabContents.createDiv({
          cls: 'settings-tab-content hidden',
          attr: { id: tab.id },
        });

        if (tab.id === activeTab) {
          tabContent.removeClass('hidden');
        }

        switch (tab.id) {
          case 'common-tab':
            await this.buildCommonSettings(tabContent);
            break;
          case 'webpage-tab':
            await this.buildWebpageSettings(tabContent);
            break;
          case 'pdf-tab':
            await this.buildPdfSettings(tabContent);
            break;
          case 'recording-tab':
            await this.buildRecordingSettings(tabContent);
            break;
        }
      }
    })();
  }

  async buildCommonSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Common Settings" });

    // 설명 메시지 추가
    const message1 = document.createElement("span");
    message1.textContent = "current version: " + this.plugin.manifest.version + " - If you want to reload Obsidian, click ";
    containerEl.appendChild(message1);

    // 링크 생성 및 스타일링
    const link = document.createElement("a");
    link.textContent = "HERE";
    link.href = "#";
    link.style.cursor = "pointer";
    link.style.color = "blue"; // 링크 색상 설정 (옵션)

    // 클릭 이벤트 핸들러
    link.addEventListener("click", (event) => {
        event.preventDefault(); // 기본 동작 방지
        window.location.reload(); // Obsidian 재로드
    });

    // Fragment에 링크 추가
    containerEl.appendChild(link);

    new Setting(containerEl)
        .setName("OpenAI API Key")
        .setDesc("Enter your OpenAI API key.")
        .addText((text) => {
            text
                .setPlaceholder("Enter OpenAI API Key")
                .setValue(this.plugin.settings.openaiApiKey || "")
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettingsToFile(this.plugin.settings);
                });

            const textAreaEl = text.inputEl;
            textAreaEl.style.width = "100%";
        });

    new Setting(containerEl)
        .setName("Confluence API Token")
        .setDesc("Enter your Confluence API token.")
        .addText((text) => {
            text
                .setPlaceholder("Enter Confluence API Token")
                .setValue(this.plugin.settings.confluenceApiToken || "")
                .onChange(async (value) => {
                    this.plugin.settings.confluenceApiToken = value;
                    await this.plugin.saveSettingsToFile(this.plugin.settings);
                });

            const textAreaEl = text.inputEl;
            textAreaEl.style.width = "100%";
        });

    // Confluence Base URL with a checkbox in the same line
    new Setting(containerEl)
        .addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.useConfluenceAPI).onChange(async (value) => {
                this.plugin.settings.useConfluenceAPI = value;
                await this.plugin.saveSettingsToFile(this.plugin.settings);

                // Dynamically enable/disable the input field
                const inputField = containerEl.querySelector<HTMLInputElement>(".confluence-url-input");
                if (inputField) {
                    inputField.disabled = !value;
                }
            })
        )
        .addText((text) => {
            text.setPlaceholder("Enter your Confluence Domain")
                .setValue(this.plugin.settings.confluenceDomain || "wiki.workers-hub.com")
                .onChange(async (value) => {
                    this.plugin.settings.confluenceDomain = value;
                    await this.plugin.saveSettingsToFile(this.plugin.settings);
                });

            const textAreaEl = text.inputEl;
            textAreaEl.style.width = "100%";

            // Assign a custom class for targeting
            text.inputEl.classList.add("confluence-url-input");

            // Disable the text field if "useConfluenceAPI" is false on initialization
            text.inputEl.disabled = !this.plugin.settings.useConfluenceAPI;
        })
        .setName("Confluence Domain")
        .setDesc("If you want to use the Confluence Open API, toggle it on; if not, toggle it off.");
  }

  async buildWebpageSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Webpage Summary" });

    new Setting(containerEl)
      .setName("System Prompt (for Web page summary)")
      .setDesc("This prompt will be added to the beginning of every chat.")

    new Setting(containerEl)
      .setHeading()
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter system prompt")
          .setValue(this.plugin.settings.systemPrompt || "")
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettingsToFile(this.plugin.settings);
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "150px";
        textAreaEl.style.resize = "none";

        // 간격을 좁히는 스타일 추가
        const descriptionEl = containerEl.querySelector('.setting-item-description') as HTMLElement;
        if (descriptionEl) {
          descriptionEl.style.marginBottom = "1px"; // 설명과 textarea 사이 간격 조정
        }
        textAreaEl.style.marginTop = "1px"; // textarea의 위쪽 간격 조정          
      })
      ;

    new Setting(containerEl)
      .setName("User Prompt (for Web page summary)")
      .setDesc("This prompt will guide the AI response.")

    new Setting(containerEl)
      .setHeading()
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter user prompt")
          .setValue(this.plugin.settings.userPrompt || "")
          .onChange(async (value) => {
            this.plugin.settings.userPrompt = value;
            await this.plugin.saveSettingsToFile(this.plugin.settings);
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "150px";
        textAreaEl.style.resize = "none";
      })
      ;
  }

  async buildPdfSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "PDF Summary" });

    new Setting(containerEl)
      .setName("System Prompt (for PDF to Markdown)")
      .setDesc("This prompt will guide the AI response.")
    new Setting(containerEl)
      .setHeading()
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter user prompt")
          .setValue(this.plugin.settings.pdfPrompt || "")
          .onChange(async (value) => {
            this.plugin.settings.pdfPrompt = value;
            await this.plugin.saveSettingsToFile(this.plugin.settings);
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "150px";
        textAreaEl.style.resize = "none";
      })
      ;
  }

  async buildRecordingSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Recording Summary" });

    /////////////////////////////////////////////////////
    // containerEl.createEl("h2", { text: "Audio Input Plugin Settings" });

    // Get list of audio devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(
      (device) => device.kind === "audioinput"
    );

    // Audio device dropdown
    new Setting(containerEl)
      .setName("Audio Input Device")
      .setDesc("Select the audio input device for recording.")
      .addDropdown((dropdown) => {
        audioDevices.forEach((device) =>
          dropdown.addOption(device.deviceId, device.label || "Unknown Device")
        );

        dropdown.setValue(this.plugin.settings.selectedDeviceId || "");
        dropdown.onChange(async (value) => {
          this.plugin.settings.selectedDeviceId = value;
          await this.plugin.saveSettingsToFile(this.plugin.settings);
        });
      });

    new Setting(containerEl)
      .setName("Temporary folder")
      .setDesc("Specify the path in the vault where to save the audio files and the transcription files")
      .addText((text) => {
        text
          .setPlaceholder("Specify temporary folder")
          .setValue(this.plugin.settings.recordingDir || "")
          .onChange(async (value) => {
            this.plugin.settings.recordingDir = value;
            await this.plugin.saveSettingsToFile(this.plugin.settings);
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
      });

    // Recording Unit
    new Setting(containerEl)
        .setName("Recording Unit")
        .setDesc("Set the unit of time for recording (in seconds).")
        .addSlider((slider) => {
            slider
                .setLimits(1, 20, 1)
                .setValue(this.plugin.settings.recordingUnit)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.recordingUnit = value;
                    await this.plugin.saveSettingsToFile(this.plugin.settings);
                });
        });

    new Setting(containerEl)
      .setName("System Prompt (for summarizing recorded content))")
      .setDesc("This prompt will guide the AI response.")
    new Setting(containerEl)
      .setHeading()
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter system prompt")
          .setValue(this.plugin.settings.recordingPrompt || "")
          .onChange(async (value) => {
            this.plugin.settings.recordingPrompt = value;
            await this.plugin.saveSettingsToFile(this.plugin.settings);
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "150px";
        textAreaEl.style.resize = "none";
      })
      ;        
  }
}
