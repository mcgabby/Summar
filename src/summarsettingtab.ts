import { PluginSettingTab, Setting, Platform } from "obsidian";

import { SummarDebug, getDeviceId, sanitizeLabel } from "./globals";
import { PluginUpdater } from "./pluginupdater";
import SummarPlugin from "./main";
import { updateScheduledMeetings } from "./calendarevent";

export class SummarSettingsTab extends PluginSettingTab {
  plugin: SummarPlugin;
  savedTabId: string;
  deviceId: string;

  constructor(plugin: SummarPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
    this.savedTabId = 'common-tab';
      // 비동기 초기화 (가독성이 떨어짐)
    getDeviceId(plugin).then(deviceId => {
      this.deviceId = deviceId as string;
    });
  }

  async hide(): Promise<void> {
    await this.plugin.saveSettingsToFile();
    this.plugin.registerCustomCommandAndMenus();
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
      { name: 'Webpage', id: 'webpage-tab' },
      { name: 'PDF', id: 'pdf-tab' },
      { name: 'Recording', id: 'recording-tab' },
      { name: 'Custom command', id: 'custom-tab' },
      { name: 'Schedule', id: 'schedule-tab' },
    ];

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
          case 'custom-tab':
            await this.buildCustomCommandSettings(tabContent);
            break;

          case 'schedule-tab':
            if (Platform.isMacOS) {
              await this.buildScheduleSettings(tabContent);
            }
            break;
        }
      }
    })();
  }

  async buildCommonSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Common Settings" });


    // Current version: #.#.# - Click here to force an update, and click here to reload Obsidian.
    // 설명 메시지 추가
    const message1 = document.createElement("span");
    message1.textContent = "Current version: " + this.plugin.manifest.version + " - Click ";
    containerEl.appendChild(message1);

    const forceUpdate = document.createElement("a");
    forceUpdate.textContent = "here";
    forceUpdate.href = "#";
    forceUpdate.style.cursor = "pointer";
    forceUpdate.style.color = "blue"; // 링크 색상 설정 (옵션)
    // 클릭 이벤트 핸들러
    forceUpdate.addEventListener("click", (event) => {
      event.preventDefault(); // 기본 동작 방지
      setTimeout(async () => {
        try {
          SummarDebug.log(1, "Checking for plugin updates...");
          const pluginUpdater = new PluginUpdater(this.plugin);
          await pluginUpdater.updatePlugin();
        } catch (error) {
          SummarDebug.error(1, "Error during plugin update:", error);
        }
      }, 100); // 0.1s    
    });
    // Fragment에 링크 추가
    containerEl.appendChild(forceUpdate);

    const message2 = document.createElement("span");
    message2.textContent = " to force an update, and click ";
    containerEl.appendChild(message2);

    // 링크 생성 및 스타일링
    const forceReload = document.createElement("a");
    forceReload.textContent = "here";
    forceReload.href = "#";
    forceReload.style.cursor = "pointer";
    forceReload.style.color = "blue"; // 링크 색상 설정 (옵션)

    // 클릭 이벤트 핸들러
    forceReload.addEventListener("click", (event) => {
        event.preventDefault(); // 기본 동작 방지
        window.location.reload(); // Obsidian 재로드
    });
    // Fragment에 링크 추가
    containerEl.appendChild(forceReload);

    const message3 = document.createElement("span");
    message3.textContent = " to reload Obsidian.";
    containerEl.appendChild(message3);

    new Setting(containerEl)
        .setName("OpenAI API Key")
        .setDesc("Enter your OpenAI API key.")
        .addText((text) => {
            text
                .setPlaceholder("Enter OpenAI API Key")
                .setValue(this.plugin.settings.openaiApiKey || "")
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
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
                });

            const textAreaEl = text.inputEl;
            textAreaEl.style.width = "100%";
        });

    // Confluence Base URL with a checkbox in the same line
    new Setting(containerEl)
        .addToggle((toggle) =>
            toggle.setValue(this.plugin.settings.useConfluenceAPI).onChange(async (value) => {
                this.plugin.settings.useConfluenceAPI = value;

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
                    // await this.plugin.saveSettingsToFile(this.plugin.settings);
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
    await navigator.mediaDevices.getUserMedia({audio: true});
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(
      (audioDevice) => audioDevice.kind === "audioinput"
    );

    // Audio device dropdown
    new Setting(containerEl)
      .setName("Audio Input Device")
      .setDesc("Select the audio input device for recording.")
      .addDropdown(async (dropdown) => {

        if (audioDevices.length === 0) {
          dropdown.addOption("", "No Devices Found");
        } else {
          audioDevices.forEach((audioDevice) => {
            const label = audioDevice.label || "Unknown Device";
            const sanitizedLabel = sanitizeLabel(label);

            dropdown.addOption(sanitizedLabel, label);
          });
        }

        // 이전에 선택한 장치 라벨 불러오기
        const savedDeviceLabel = this.plugin.settings[this.deviceId] as string || "";
        dropdown.setValue(savedDeviceLabel);

        dropdown.onChange(async (value) => {
          this.plugin.settings[this.deviceId] = value;
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
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "150px";
        textAreaEl.style.resize = "none";
      })
      ;        
  }

  async buildCustomCommandSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Custom commands" });

    new Setting(containerEl)
      .setName("Custom Prompt (for Selected Text in the Note)")
      .setDesc("The menu name you enter here will appear in the context menu or command palette when you select highlighted text in your note. \nRunning this menu will trigger the prompt you set here.");


    for (let i = 1; i <= this.plugin.settings.cmd_count; i++) {
      this.createCustomCommandSetting(containerEl, i);
    }  
    new Setting(containerEl)
    .addButton(button => button
      .setButtonText('Add Command')
      .onClick(async() => {
        if (this.plugin.settings.cmd_count < 5) {
          this.plugin.settings.cmd_count += 1;
          this.plugin.settings[`cmd_text_${this.plugin.settings.cmd_count}`] = '';
          this.plugin.settings[`cmd_prompt_${this.plugin.settings.cmd_count}`] = '';
          this.plugin.settings[`cmd_hotkey_${this.plugin.settings.cmd_count}`] = '';
          this.display();
        } else {
          SummarDebug.Notice(0, 'You can only add up to 5 commands.');
        }
      }));
  }

  createCustomCommandSetting(containerEl: HTMLElement, index: number): void {
    new Setting(containerEl)
      .setHeading()
      .addText((text) => {
        text
          .setPlaceholder('Menu Name')
          .setValue(this.plugin.settings[`cmd_text_${index}`] as string)
          .onChange(async (value) => {
            this.plugin.settings[`cmd_text_${index}`] = value;
          });
        const textEl = text.inputEl;
        textEl.style.width = "100%";
      })
      .addText((hotkeyInput) => {
        hotkeyInput
          .setPlaceholder('Press a hotkey...')
          .setValue(this.plugin.settings[`cmd_hotkey_${index}`] as string)
          .onChange(async (value) => {
            this.plugin.settings[`cmd_hotkey_${index}`] = value;
          });
        const hotkeyEl = hotkeyInput.inputEl;
        hotkeyEl.style.width = "150px";
        hotkeyEl.readOnly = true;
  
        // 핫키 입력 리스너 추가
        hotkeyEl.addEventListener('keydown', async (event) => {
          event.preventDefault(); // 기본 입력 방지
  
          const modifiers = [];
          // if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
          if (event.ctrlKey) modifiers.push('Ctrl');
          if (event.metaKey) modifiers.push('Cmd');
          if (event.shiftKey) modifiers.push('Shift');
          if (event.altKey) modifiers.push('Alt');
  
          const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
          const hotkey = [...modifiers, key].join('+');

          if (hotkey === 'Backspace' || hotkey === 'Delete' || hotkey === ' ')
            hotkeyEl.value = "";
          else
            hotkeyEl.value = hotkey;
          this.plugin.settings[`cmd_hotkey_${index}`] = hotkey;

        });
      })      
      .addExtraButton(button => button
        .setIcon('trash-2')
        .setTooltip('Remove Command')
        .onClick(async () => {
          for (let i = index; i < this.plugin.settings.cmd_count; i++) {
            this.plugin.settings[`cmd_text_${i}`] = this.plugin.settings[`cmd_text_${i+1}`];
            this.plugin.settings[`cmd_prompt_${i}`] = this.plugin.settings[`cmd_prompt_${i+1}`];
            this.plugin.settings[`cmd_hotkey_${i}`] = this.plugin.settings[`cmd_hotkey_${i+1}`];
          }
          delete this.plugin.settings[`cmd_text_${this.plugin.settings.cmd_count}`];
          delete this.plugin.settings[`cmd_prompt_${this.plugin.settings.cmd_count}`];
          delete this.plugin.settings[`cmd_hotkey_${this.plugin.settings.cmd_count}`];
          this.plugin.settings.cmd_count -= 1;
          this.display();
        }));

    new Setting(containerEl)
      .setHeading()
      .addTextArea((textarea) => {
        textarea
          .setPlaceholder('Run OpenAI’s API using the text you selected in the note. Type the prompt you want to use here.')
          .setValue(this.plugin.settings[`cmd_prompt_${index}`] as string)
          .onChange(async (value) => {
            this.plugin.settings[`cmd_prompt_${index}`] = value;
          })
        const textAreaEl = textarea.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "150px";
        textAreaEl.style.resize = "none";
      });
  }

  async buildScheduleSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Today's Schedule" });
  
    new Setting(containerEl)
      .setName("Custom Prompt (for Selected Text in the Note)")
      .setDesc("The menu name you enter here will appear in the context menu or command palette when you select highlighted text in your note. \nRunning this menu will trigger the prompt you set here.");
  
    await updateScheduledMeetings(this.plugin);
    setInterval(updateScheduledMeetings, 10 * 60 * 1000); // 10분마다 업데이트
    
    // for (let i = 1; i <= this.plugin.settings.cmd_count; i++) {
    //   this.createCustomCommandSetting(containerEl, i);
    // }  
    // new Setting(containerEl)
    // .addButton(button => button
    //   .setButtonText('Add Command')
    //   .onClick(async() => {
    //     if (this.plugin.settings.cmd_count < 5) {
    //       this.plugin.settings.cmd_count += 1;
    //       this.plugin.settings[`cmd_text_${this.plugin.settings.cmd_count}`] = '';
    //       this.plugin.settings[`cmd_prompt_${this.plugin.settings.cmd_count}`] = '';
    //       this.plugin.settings[`cmd_hotkey_${this.plugin.settings.cmd_count}`] = '';
    //       this.display();
    //     } else {
    //       SummarDebug.Notice(0, 'You can only add up to 5 commands.');
    //     }
    //   }));
  }
}

