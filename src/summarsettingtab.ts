import { PluginSettingTab, Setting, Platform, ButtonComponent } from "obsidian";

import { SummarDebug, getDeviceId, sanitizeLabel } from "./globals";
import { PluginUpdater } from "./pluginupdater";
import SummarPlugin from "./main";
import { ConfluenceAPI } from "./confluenceapi";

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

    // SummarDebug.log(1, "SummarSettingsTab: Displaying settings tab");
    const { containerEl } = this;

    if (!containerEl || !this.plugin.settings) {
      SummarDebug.error(1, "Settings or containerEl not initialized correctly.");
      return;
    }

    containerEl.empty();

    // Create tabs container
    const tabsContainer = containerEl.createDiv({ cls: 'settings-tabs' });

    // 터치패드 및 마우스 휠 이벤트 처리 (좌우 스크롤)
    tabsContainer.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        // 터치패드에서 수직 스크롤이 발생할 경우 가로 스크롤로 변환
        event.preventDefault();
        tabsContainer.scrollBy({
          left: event.deltaY * 2,
          behavior: "smooth",
        });
      }
    });

    // 탭 버튼 클릭 시 자동 스크롤 조정
    document.querySelectorAll(".settings-tab-button").forEach((button) => {
      button.addEventListener("click", (event) => {
        const target = event.currentTarget as HTMLElement;
        const containerRect = tabsContainer.getBoundingClientRect();
        const buttonRect = target.getBoundingClientRect();

        if (buttonRect.left < containerRect.left) {
          // 왼쪽에 가려진 경우
          tabsContainer.scrollBy({
            left: buttonRect.left - containerRect.left - 10,
            behavior: "smooth",
          });
        } else if (buttonRect.right > containerRect.right) {
          // 오른쪽에 가려진 경우
          tabsContainer.scrollBy({
            left: buttonRect.right - containerRect.right + 10,
            behavior: "smooth",
          });
        }
      });
    });

    // 모바일 및 터치스크린을 위한 터치 스크롤 기능 추가
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;

    tabsContainer.addEventListener("mousedown", (event) => {
      isDragging = true;
      startX = event.pageX - tabsContainer.offsetLeft;
      scrollLeft = tabsContainer.scrollLeft;
    });

    tabsContainer.addEventListener("mouseleave", () => {
      isDragging = false;
    });

    tabsContainer.addEventListener("mouseup", () => {
      isDragging = false;
    });

    tabsContainer.addEventListener("mousemove", (event) => {
      if (!isDragging) return;
      event.preventDefault();
      const x = event.pageX - tabsContainer.offsetLeft;
      const walk = (x - startX) * 2; // 이동 거리 계산
      tabsContainer.scrollLeft = scrollLeft - walk;
    });

    // 터치스크린 지원 (모바일 환경)
    let touchStartX = 0;
    let touchScrollLeft = 0;

    tabsContainer.addEventListener("touchstart", (event) => {
      touchStartX = event.touches[0].pageX - tabsContainer.offsetLeft;
      touchScrollLeft = tabsContainer.scrollLeft;
    });

    tabsContainer.addEventListener("touchmove", (event) => {
      event.preventDefault();
      const touchX = event.touches[0].pageX - tabsContainer.offsetLeft;
      const touchMove = (touchX - touchStartX) * 2; // 이동 거리 계산
      tabsContainer.scrollLeft = touchScrollLeft - touchMove;
    });

    const tabContents = containerEl.createDiv({ cls: 'settings-tab-contents' });
    const tabs = [
      { name: 'Common', icon: 'settings', id: 'common-tab', tooltip: 'Common Settings' },
      { name: 'Webpage', icon: 'globe', id: 'webpage-tab', tooltip: 'Webpage Summary' },
      { name: 'PDF', icon: 'file-text', id: 'pdf-tab', tooltip: 'PDF Summary' },
      { name: 'Recording', icon: 'voicemail', id: 'recording-tab', tooltip: 'Transcription Summary' },
      { name: 'Schedule', icon: 'calendar-check', id: 'schedule-tab', tooltip: 'Auto recording' },
      { name: 'Custom command', icon: 'wand-sparkles', id: 'custom-tab', tooltip: 'Custom Commands' },

    ];

    let activeTab = this.savedTabId;

    // Create tabs
    tabs.forEach((tab) => {
      if ((tab.id !== 'pdf-tab' && tab.id !== 'schedule-tab') || (Platform.isMacOS && Platform.isDesktopApp)) {
        const setting = new Setting(tabsContainer);

        const tabButton = setting.addExtraButton((button) => {
          button.setIcon(tab.icon) // 적절한 아이콘 선택
            .setTooltip(tab.tooltip)
            .onClick(() => {
              // SummarDebug.log(3, `savedTabId: ${this.savedTabId}, tab.id: ${tab.id}`);

              this.savedTabId = activeTab = tab.id;

              // Update active state
              tabsContainer.querySelectorAll('.clickable-icon').forEach((btn) => {
                btn.removeClass('active');
              });

              // ExtraButton의 내부 요소에 클래스 추가
              const buttonEl = setting.settingEl.querySelector('.clickable-icon');
              if (buttonEl) {
                buttonEl.addClass('active');
              }
              // Show active tab content
              tabContents.querySelectorAll('.settings-tab-content').forEach((content) => {
                // SummarDebug.log(3, `content.id: ${content.id}, activeTab: ${activeTab}`);
                content.toggleClass('hidden', content.id !== activeTab);
              });
            });
        });

        // ExtraButton의 요소 직접 가져와 활성화
        const buttonEl = setting.settingEl.querySelector('.clickable-icon');
        (buttonEl as HTMLElement).dataset.id = tab.id;
        if (tab.id === activeTab) {
          if (buttonEl) buttonEl.addClass('active');
        }

      }
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
            if (Platform.isMacOS && Platform.isDesktopApp) {
              await this.buildPdfSettings(tabContent);
            }
            break;
          case 'recording-tab':
            await this.buildRecordingSettings(tabContent);
            break;
          case 'custom-tab':
            await this.buildCustomCommandSettings(tabContent);
            break;

          case 'schedule-tab':
            if (Platform.isMacOS && Platform.isDesktopApp) {
              await this.buildScheduleSettings(tabContent);
            }
            break;
        }
      }
    })();
  }

async activateTab(tabId: string): Promise<void> {
    const { containerEl } = this;

    if (!containerEl) {
        SummarDebug.error(1, "SummarSettingsTab: containerEl is not available");
        return;
    }

    // 현재 탭 ID 저장
    this.savedTabId = tabId;

    // // 활성화할 탭 찾기
    // const tabsContainer = containerEl.querySelector('.settings-tabs');
    // const tabContents = containerEl.querySelector('.settings-tab-contents');

    // if (!tabsContainer || !tabContents) {
    //     SummarDebug.error(1, "SummarSettingsTab: tabsContainer or tabContents not found");
    //     return;
    // }

    // // 모든 버튼에서 active 클래스 제거
    // tabsContainer.querySelectorAll('.clickable-icon').forEach((btn) => {
    //   SummarDebug.log(1, `btn id: ${(btn as HTMLElement).dataset.id}`);
    //   if ((btn as HTMLElement).dataset.id === tabId) {
    //     btn.addClass('active');
    //   } else {
    //     btn.removeClass('active');
    //   }
    // });

    this.display();
    // SummarDebug.log(1, `SummarSettingsTab: Activated tab '${tabId}'`);
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
    forceUpdate.style.color = "var(--text-accent)"; // 링크 색상 설정 (옵션)
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
    forceReload.style.color = "var(--text-accent)"; // 링크 색상 설정 (옵션)

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

    containerEl.createEl("p"); 

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

    // OpenAI API Endpoint 입력란 추가
    new Setting(containerEl)
      .setName("OpenAI API Endpoint URL")
      .setDesc("(Optional) Enter the OpenAI API endpoint URL.")
      .addText((text) => {
        text
          .setPlaceholder("https://api.openai.com")
          .setValue(this.plugin.settings.openaiApiEndpoint || "")
          .onChange(async (value) => {
            this.plugin.settings.openaiApiEndpoint = value;
          });
        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
      });

      new Setting(containerEl)
      .setName("Gemini API Key")
      .setDesc("Enter your Gemini API key.")
      .addText((text) => {
        text
          .setPlaceholder("Enter Gemini API Key")
          .setValue(this.plugin.settings.googleApiKey || "")
          .onChange(async (value) => {
            this.plugin.settings.googleApiKey = value;
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
      });

      containerEl.createEl("p"); 

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
      
      let checkButton: ButtonComponent; // ButtonComponent 객체를 저장

      if (Platform.isMacOS && Platform.isDesktopApp) {
        const urlContainer = new Setting(containerEl)
        .setName("Confluence Parent Page URL")
        .setDesc(
          "To post content to a Confluence page, you need the space key and the ID of the parent page where the content will be stored. " +
          "Enter the Confluence page URL here so you can get the required space key and parent page ID.")
        .addText((text) => {
          text
            .setPlaceholder("Enter Confluence page URL")
            .setValue(this.plugin.settings.confluenceParentPageUrl || "")
            .onChange(async (value) => {
              // URL이 변경될 때마다 저장
              checkButton.setDisabled(!value.trim()); // ButtonComponent의 메서드로 상태 변경 
            });
            const textEl = text.inputEl;
            // textEl.style.width = "calc(100% - 40px)"; // 체크 버튼을 위한 공간 확보
            // 📏 입력창 크기 크게 조정
            textEl.style.width = "100%";
            // textEl.style.height = "3em";
            textEl.style.fontSize = "1em";
            textEl.style.padding = "8px";

            // 🔠 긴 URL도 잘 보이도록
            textEl.style.whiteSpace = "normal";
            textEl.style.overflowWrap = "break-word";          
        })
        .addButton((button) => {
          checkButton = button; // ButtonComponent 객체 저장
          button
            .setButtonText("✓")
            .setClass("check-button")
            .setDisabled(true)
            .onClick(async () => {

              const urlInput = urlContainer.controlEl.querySelector("input") as HTMLInputElement;
              const url = urlInput.value.trim();
              spaceKeyInput.setValue("");
              pageIdInput.setValue("");

              if (url) {
                try {
                  const conflueceapi = new ConfluenceAPI(this.plugin);
                  const result = await conflueceapi.getPageId(url);
                  
                  // if (result.spaceKey) {
                  //   spaceKeyInput.setValue(result.spaceKey);
                  //   this.plugin.settings.confluenceParentPageSpaceKey = result.spaceKey;
                  // }
                  
                  if (result.pageId) {
                    pageIdInput.setValue(result.pageId);
                    this.plugin.settings.confluenceParentPageId = result.pageId;
                    const spaceKey = await conflueceapi.getSpaceKey(result.pageId);
                    if (spaceKey) {
                      spaceKeyInput.setValue(spaceKey);
                      this.plugin.settings.confluenceParentPageSpaceKey = spaceKey;
                      this.plugin.settings.confluenceParentPageUrl = url;
                    }
                  }

                  // 설정 저장
                  await this.plugin.saveData(this.plugin.settings);
                } catch (error) {
                  console.error("Error fetching page info:", error);
                }
              }
            });
          button.buttonEl.style.marginLeft = "4px";
          // checkButtonEl = button.buttonEl;
          return button;
        });

        // Space Key 입력 필드 (읽기 전용)
      let spaceKeyInput: any;
      new Setting(containerEl)
        .setName("Space Key")
        .setDesc("Space Key will be automatically filled when checking the URL")
        .addText((text) => {
          spaceKeyInput = text;
          text
            .setPlaceholder("Space Key")
            .setValue(this.plugin.settings.confluenceParentPageSpaceKey || "")
            .setDisabled(true);
          const textEl = text.inputEl;
          textEl.style.width = "100%";
        });


      // 🎨 Desc 스타일 좁게 조정 (너비 제한)
      const descEl = urlContainer.descEl;
      descEl.style.maxWidth = "450px"; // 필요시 400~600px 사이로 조정 가능

      // Parent Page ID 입력 필드 (읽기 전용)
      let pageIdInput: any;
      new Setting(containerEl)
        .setName("Parent Page ID")
        .setDesc("Parent Page ID will be automatically filled when checking the URL")
        .addText((text) => {
          pageIdInput = text;
          text
            .setPlaceholder("Parent Page ID")
            .setValue(this.plugin.settings.confluenceParentPageId || "")
            .setDisabled(true);
          const textEl = text.inputEl;
          textEl.style.width = "100%";
        });      
      }
  }

  async buildWebpageSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Webpage Summary" });

    // new Setting(containerEl)
    //   .setName("System Prompt (for Web page summary)")
    //   .setDesc("This prompt will be added to the beginning of every chat.")

    // new Setting(containerEl)
    //   .setHeading()
    //   .addTextArea((text) => {
    //     text
    //       .setPlaceholder("Enter system prompt")
    //       .setValue(this.plugin.settings.systemPrompt || "")
    //       .onChange(async (value) => {
    //         this.plugin.settings.systemPrompt = value;
    //       });

    //     const textAreaEl = text.inputEl;
    //     textAreaEl.style.width = "100%";
    //     textAreaEl.style.height = "150px";
    //     textAreaEl.style.resize = "none";

    //     // 간격을 좁히는 스타일 추가
    //     const descriptionEl = containerEl.querySelector('.setting-item-description') as HTMLElement;
    //     if (descriptionEl) {
    //       descriptionEl.style.marginBottom = "1px"; // 설명과 textarea 사이 간격 조정
    //     }
    //     textAreaEl.style.marginTop = "1px"; // textarea의 위쪽 간격 조정          
    //   })
    //   ;

    // new Setting(containerEl)
    // .setName("OpenAI Model")
    // .setDesc("Select the OpenAI model to use in the prompt.")
    // .addDropdown(dropdown => 
    //     dropdown
    //         .addOptions({
    //             "gpt-4o": "gpt-4o",
    //             "o1-mini": "o1-mini",
    //             "o3-mini": "o3-mini"
    //         })
    //         .setValue(this.plugin.settings.webModel)
    //         .onChange(async (value) => {
    //             this.plugin.settings.webModel = value;
    //         })
    // );

    new Setting(containerEl)
      .setName("Prompt (for Web page summary)")
      .setDesc("This prompt will guide the AI response.")
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("webpage");
        if (Object.keys(options).length === 0) {
          options['gpt-4o'] = 'gpt-4o'; 
          options['gpt-4.1'] = 'gpt-4.1';
          options['o1-mini'] = 'o1-mini';
          options['o3-mini'] = 'o3-mini';
        }            
        dropdown
          .addOptions(options)
          .setValue(this.plugin.settings.webModel)
          .onChange(async (value) => {
            this.plugin.settings.webModel = value;
          })
      });

    new Setting(containerEl)
      .setHeading()
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter prompt")
          .setValue(this.plugin.settings.webPrompt || "")
          .onChange(async (value) => {
            this.plugin.settings.webPrompt = value;
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

    // PDF 모델 선택 드롭다운 및 프롬프트 입력 UI를 Webpage와 동일하게 구성
    new Setting(containerEl)
      .setName("Prompt (for PDF to Markdown)")
      .setDesc("This prompt will guide the AI response.")
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("pdf");
        if (Object.keys(options).length === 0) {
          options['gpt-4o'] = 'gpt-4o';
          options['gpt-4.1'] = 'gpt-4.1';
          options['gpt-4.1-mini'] = 'gpt-4.1-mini';
        }
        dropdown
          .addOptions(options)
          .setValue(String(this.plugin.settings.pdfModel))
          .onChange(async (value) => {
            this.plugin.settings.pdfModel = value;
          });
      });      
    new Setting(containerEl)
      .setHeading()
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter prompt")
          .setValue(this.plugin.settings.pdfPrompt || "")
          .onChange(async (value) => {
            this.plugin.settings.pdfPrompt = value;
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "100px";
        textAreaEl.style.resize = "none";
      });
  }

  async buildRecordingSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Transcription Summary" });

    if ((Platform.isMacOS && Platform.isDesktopApp)) {
      new Setting(containerEl)
        .setName("Auto record on Zoom meeting")
        .setDesc("Automatically start recording when a Zoom meeting starts, and stop when it ends.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.autoRecordOnZoomMeeting).onChange(async (value) => {
            this.plugin.settings.autoRecordOnZoomMeeting = value;
            await this.plugin.saveSettingsToFile();
            this.plugin.updateZoomAutoRecordWatcher(); // 토글 변경 시 감시 상태 갱신
          })
        );
    }
    /////////////////////////////////////////////////////
    // containerEl.createEl("h2", { text: "Audio Input Plugin Settings" });

    // Get list of audio devices
    await navigator.mediaDevices.getUserMedia({ audio: true });
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

      new Setting(containerEl)
      .setName("Save to a New Note")
      .setDesc("Enable this toggle button to save the summary results to a new note.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.recordingResultNewNote).onChange(async (value) => {
          this.plugin.settings.recordingResultNewNote = value;
        }));

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
      .setName("Transcription Language")
      .setDesc("Please select the language of the recorded meeting transcript.")
      .addDropdown(dropdown =>
          dropdown
          .addOptions({
            "": "Auto Detect",
            "ko-KR": "Korean (ko)",
            "ja-JP": "Japanese (ja)",
            "en-US": "English (en)",
            "zh-TW": "Chinese (zh)",
            "th-TH": "ภาษาไทย (th)",
            "vi-VN": "Tiếng Việt (vi)"
          })
          .setValue(this.plugin.settings.recordingLanguage || "")
          .onChange(async (value) => {
            this.plugin.settings.recordingLanguage = value;
          })
      );


    new Setting(containerEl)
      .setName("Speech to Text Model")
      .setDesc("Select the STT model to transcribe the audio")
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("speech_to_text");
        if (Object.keys(options).length === 0) {
          options['whisper-1'] = 'whisper-1';
          options['gpt-4o-mini-transcribe'] = 'gpt-4o-mini-transcribe';
          options['gpt-4o-transcribe'] = 'gpt-4o-transcribe';
          options['gemini-2.0-flash'] = 'gemini-2.0-flash';
        }    

        dropdown
          .addOptions(options)
          .setValue(this.plugin.settings.transcriptSTT)
          .onChange(async (value) => {
            this.plugin.settings.transcriptSTT = value;
            const promptTextArea = containerEl.querySelector(".transcription-prompt-textarea") as HTMLTextAreaElement;
            if (promptTextArea) {
              promptTextArea.parentElement?.toggleClass("hidden", value !== "gpt-4o-mini-transcribe" && value !== "gpt-4o-transcribe");
            }
          })
      });
      new Setting(containerEl)
      .setHeading()
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter prompt for transcribing")
          .setValue(this.plugin.settings.transcribingPrompt || "")
          .onChange(async (value) => {
            this.plugin.settings.transcribingPrompt = value;
          });

        const textAreaEl = text.inputEl;
        textAreaEl.classList.add("transcription-prompt-textarea");
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "150px";
        textAreaEl.style.resize = "none";

        // 초기 숨김 여부 설정
        if (this.plugin.settings.transcriptSTT !== "gpt-4o-mini-transcribe" && 
            this.plugin.settings.transcriptSTT !== "gpt-4o-transcribe") {
          textAreaEl.parentElement?.classList.add("hidden");
        }
      })
      ;
      
    new Setting(containerEl)
      .setName("Prompt (for summarizing recorded content))")
      .setDesc("This prompt will guide the AI response.")
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("transcription");
        if (Object.keys(options).length === 0) {
          options['gpt-4o'] = 'gpt-4o'; 
          options['gpt-4.1'] = 'gpt-4.1';
          options['o1-mini'] = 'o1-mini';
          options['o3-mini'] = 'o3-mini';
        }    

        dropdown
          .addOptions(options)
          .setValue(this.plugin.settings.transcriptModel)
          .onChange(async (value) => {
            this.plugin.settings.transcriptModel = value;
          })
      });
    new Setting(containerEl)
      .setHeading()
      .addTextArea((text) => {
        text
          .setPlaceholder("Enter prompt")
          .setValue(this.plugin.settings.recordingPrompt || "")
          .onChange(async (value) => {
            this.plugin.settings.recordingPrompt = value;
          });

        const textAreaEl = text.inputEl;
        textAreaEl.style.width = "100%";
        textAreaEl.style.height = "150px";
        textAreaEl.style.resize = "none";
      });
    
    containerEl.createEl("p"); 
    // Refining summary
    new Setting(containerEl)
        .setName("Refine summary based on transcription")
        .setDesc("Use this prompt to refine the summary by comparing it with the recorded transcription.")
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.refineSummary).onChange(async (value) => {
            this.plugin.settings.refineSummary = value;
            const promptTextArea = containerEl.querySelector(".refining-prompt-textarea") as HTMLTextAreaElement;
            if (promptTextArea) {
              promptTextArea.parentElement?.toggleClass("hidden", !this.plugin.settings.refineSummary);
            }
      }));

    new Setting(containerEl)
        .setHeading()
        .addTextArea((text) => {
          text
            .setPlaceholder("Enter prompt")
            .setValue(this.plugin.settings.refiningPrompt || "")
            .onChange(async (value) => {
              this.plugin.settings.refiningPrompt = value;
            });
  
          const textAreaEl = text.inputEl;
          textAreaEl.classList.add("refining-prompt-textarea");
          textAreaEl.style.width = "100%";
          textAreaEl.style.height = "150px";
          textAreaEl.style.resize = "none";

          if (!this.plugin.settings.refineSummary) {
            textAreaEl.parentElement?.classList.add("hidden");
          }
      });
  
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
        .onClick(async () => {
          if (this.plugin.settings.cmd_count < this.plugin.settings.cmd_max) {  
            this.plugin.settings.cmd_count += 1;
            this.plugin.settings[`cmd_text_${this.plugin.settings.cmd_count}`] = '';
            this.plugin.settings[`cmd_prompt_${this.plugin.settings.cmd_count}`] = '';
            this.plugin.settings[`cmd_hotkey_${this.plugin.settings.cmd_count}`] = '';
            this.plugin.settings[`cmd_model_${this.plugin.settings.cmd_count}`] = 'gpt-4o';
            this.display();
          } else {
            SummarDebug.Notice(0, `You can only add up to ${this.plugin.settings.cmd_max} commands.`);
          }
        }));
  }

  createCustomCommandSetting(containerEl: HTMLElement, index: number): void {
    if (this.plugin.settings[`cmd_model_${index}`] === undefined ||
        (this.plugin.settings[`cmd_model_${index}`] as string).length === 0) {
      this.plugin.settings[`cmd_model_${index}`] = 'gpt-4o';
      SummarDebug.log(1,`[set gpt-4o] cmd_model_${index}: ` + this.plugin.settings[`cmd_model_${index}`]);
    }
    else {
      SummarDebug.log(1,`cmd_model_${index}: ` + this.plugin.settings[`cmd_model_${index}`]);
    }

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
      
      .addDropdown(dropdown => {
        const options = this.plugin.getAllModelKeyValues("custom");
        if (Object.keys(options).length === 0) {
          options['gpt-4o'] = 'gpt-4o';
          options['gpt-4.1'] = 'gpt-4.1';
          options['o1-mini'] = 'o1-mini';
          options['o3-mini'] = 'o3-mini';
        }    

        dropdown
          .addOptions(options)
          .setValue(this.plugin.settings[`cmd_model_${index}`] as string)
          .onChange(async (value) => {
            this.plugin.settings[`cmd_model_${index}`] = value;
          })
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

          SummarDebug.log(1, `Hotkey changed: ${hotkey}`);
          if (hotkey !== 'Escape') {
            if (hotkey === 'Backspace' || hotkey === 'Delete' || hotkey === ' ')
              hotkeyEl.value = "";
            else
              hotkeyEl.value = hotkey;
            this.plugin.settings[`cmd_hotkey_${index}`] = hotkeyEl.value;
          }
        });
      })
      .addExtraButton(button => button
        .setIcon('trash-2')
        .setTooltip('Remove Command')
        .onClick(async () => {
          for (let i = index; i < this.plugin.settings.cmd_count; i++) {
            this.plugin.settings[`cmd_text_${i}`] = this.plugin.settings[`cmd_text_${i + 1}`];
            this.plugin.settings[`cmd_prompt_${i}`] = this.plugin.settings[`cmd_prompt_${i + 1}`];
            this.plugin.settings[`cmd_hotkey_${i}`] = this.plugin.settings[`cmd_hotkey_${i + 1}`];
            this.plugin.settings[`cmd_model_${i}`] = this.plugin.settings[`cmd_model_${i + 1}`];
          }
          delete this.plugin.settings[`cmd_text_${this.plugin.settings.cmd_count}`];
          delete this.plugin.settings[`cmd_prompt_${this.plugin.settings.cmd_count}`];
          delete this.plugin.settings[`cmd_hotkey_${this.plugin.settings.cmd_count}`];
          delete this.plugin.settings[`cmd_model_${this.plugin.settings.cmd_count}`];
          this.plugin.settings.cmd_count -= 1;
          this.display();
        }));


    // new Setting(containerEl)
    // .setHeading()
    // .setName("OpenAI Model")
    //   .setDesc("Select the OpenAI model to use in the prompt.")
    //   .addDropdown(dropdown =>
    //     dropdown
    //       .addOptions({
    //         "gpt-4o": "gpt-4o",
    //         "o1-mini": "o1-mini",
    //         "o3-mini": "o3-mini"
    //       })
    //       .setValue(this.plugin.settings[`cmd_model_${index}`] as string)
    //       .onChange(async (value) => {
    //         this.plugin.settings[`cmd_model_${index}`] = value;
    //       })
    //   );

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
        textAreaEl.style.height = "80px";
        textAreaEl.style.resize = "none";
      });

    // 옵션 토글 2개: Append Results to Note, Copy Results to Clipboard (TextArea 바로 아래, 한 줄, 우측 정렬)
    const optionRow = document.createElement('div');
    optionRow.className = 'custom-command-options-row';
    optionRow.style.display = 'flex';
    optionRow.style.justifyContent = 'flex-end';
    optionRow.style.gap = '24px';
    optionRow.style.marginTop = '4px';
    optionRow.style.marginBottom = '4px';

    // Append Results to Note
    const appendLabel = document.createElement('label');
    appendLabel.style.display = 'flex';
    appendLabel.style.alignItems = 'center';
    appendLabel.style.gap = '4px';
    appendLabel.style.fontSize = '0.95em';
    appendLabel.style.cursor = 'pointer';
    const appendToggle = document.createElement('input');
    appendToggle.type = 'checkbox';
    appendToggle.checked = !!this.plugin.settings[`cmd_append_to_note_${index}`];
    appendToggle.addEventListener('change', () => {
      this.plugin.settings[`cmd_append_to_note_${index}`] = appendToggle.checked;
    });
    appendLabel.appendChild(appendToggle);
    appendLabel.appendChild(document.createTextNode('Append Results to Note'));
    optionRow.appendChild(appendLabel);

    // Copy Results to Clipboard
    const copyLabel = document.createElement('label');
    copyLabel.style.display = 'flex';
    copyLabel.style.alignItems = 'center';
    copyLabel.style.gap = '4px';
    copyLabel.style.fontSize = '0.95em';
    copyLabel.style.cursor = 'pointer';
    const copyToggle = document.createElement('input');
    copyToggle.type = 'checkbox';
    copyToggle.checked = !!this.plugin.settings[`cmd_copy_to_clipboard_${index}`];
    copyToggle.addEventListener('change', () => {
      this.plugin.settings[`cmd_copy_to_clipboard_${index}`] = copyToggle.checked;
    });
    copyLabel.appendChild(copyToggle);
    copyLabel.appendChild(document.createTextNode('Copy Results to Clipboard'));
    optionRow.appendChild(copyLabel);

    containerEl.appendChild(optionRow);
  }

  createCalendarField(containerEl: HTMLElement, index: number): void {
    const setting = new Setting(containerEl)
      // .setName(`Calendar ${index + 1}`)
      .setHeading()
      .addText((text) => {
        text
          .setPlaceholder("Enter Calendar Name")
          .setValue(this.plugin.settings[`calendar_${index}`] as string)
          .onChange((value) => {
            this.plugin.settings[`calendar_${index}`] = value;
          });
        const textEl = text.inputEl;
        textEl.style.width = "100%";
        // Focus가 떠날 때 dirty flag 설정
        textEl.addEventListener("blur", async () => {
          // SummarDebug.Notice(3, "Calendar name changed. Please save the settings.");
          await this.plugin.saveSettingsToFile();
          await this.plugin.calendarHandler.updateScheduledMeetings();
          await this.plugin.calendarHandler.displayEvents();
        });
      }
      )
      .addExtraButton(button => button
        .setIcon(`trash-2`)
        .setTooltip(`Remove Calendar`)
        .onClick(async () => {
          for (let i = index; i < this.plugin.settings.calendar_count; i++) {
            this.plugin.settings[`calendar_${i}`] = this.plugin.settings[`calendar_${i + 1}`];
          }
          delete this.plugin.settings[`calendar_${this.plugin.settings.calendar_count}`];
          this.plugin.settings.calendar_count -= 1;
          this.display();
          await this.plugin.saveSettingsToFile();
          await this.plugin.calendarHandler.updateScheduledMeetings();
          await this.plugin.calendarHandler.displayEvents();
        })
      );
  }

  async buildScheduleSettings(containerEl: HTMLElement): Promise<void> {
    containerEl.createEl("h2", { text: "Auto recording" });

    new Setting(containerEl)
      .setName("Enter the macOS calendar to search for Zoom meetings")
      .setDesc("Leave blank to search all calendars.")
      .addButton(button => button
        .setButtonText('Add Calendar')
        .onClick(async () => {
          if (this.plugin.settings.calendar_count < 5) {
            this.plugin.settings.calendar_count += 1;
            this.plugin.settings[`calendar_${this.plugin.settings.calendar_count}`] = '';
            this.display();
          } else {
            SummarDebug.Notice(0, 'You can only add up to 5 calendars.');
          }
        }));

    const calendarContainer = containerEl.createDiv();
    for (let i = 1; i <= this.plugin.settings.calendar_count; i++) {
      this.createCalendarField(containerEl, i);
    }

    new Setting(containerEl)
      .setName("Show Zoom meetings only")
      .setDesc("When the toggle switch is on, only Zoom meetings are listed. When it is off, all events are displayed.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.calendar_zoom_only).onChange(async (value) => {
          this.plugin.settings.calendar_zoom_only = value;
          await this.plugin.calendarHandler.displayEvents();
        }));

    new Setting(containerEl)
      .setName("Automatically records events that include Zoom meetings.")
      .setDesc("If the toggle switch is turned on, recording will automatically start at the scheduled time of events that include Zoom meetings.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoRecording).onChange(async (value) => {
          this.plugin.settings.autoRecording = value;
          await this.plugin.calendarHandler.displayEvents(value);
          // this.plugin.reservedStatus.update(value ? "⏰" : "", value ? "green" : "black");
          if (value) {
            this.plugin.reservedStatus.setStatusbarIcon("calendar-clock", "red");
          } else {
            this.plugin.reservedStatus.setStatusbarIcon("calendar-x", "var(--text-muted)");
          }
        }));

    // const eventContainer = containerEl.createDiv();
    await this.plugin.calendarHandler.displayEvents(this.plugin.settings.autoRecording, containerEl.createDiv());
  }

}

