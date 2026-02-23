import { Modal, Setting, Notice } from 'obsidian';
import SummarPlugin from './main';
import { SettingHelperConfig } from './types';

export class SettingHelperModal extends Modal {
    plugin: SummarPlugin;
    helperConfig: SettingHelperConfig;
    private openaiCheckbox: HTMLInputElement;
    private confluenceCheckbox: HTMLInputElement;
    private slackWorkspaceCheckbox: HTMLInputElement;
    private slackApiCheckbox: HTMLInputElement;

    private customVocabularyCheckbox?: HTMLInputElement;

    private onApply?: () => void;

    constructor(plugin: SummarPlugin, helperConfig: SettingHelperConfig, onApply?: () => void) {
        super(plugin.app);
        this.plugin = plugin;
        this.helperConfig = helperConfig;
        this.onApply = onApply;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // reset transient references
        this.customVocabularyCheckbox = undefined;

        // Ensure modal width accommodates description text on a single line
        this.modalEl.style.width = "90vw";
        this.modalEl.style.maxWidth = "780px";

        // 모달 제목 설정
        contentEl.createEl("h2", { text: "Setting Helper" });

        if (this.helperConfig.common) {
            const defaultDomainSection = contentEl.createDiv({ cls: "setting-helper-default-domain" });
            
            // 설명 텍스트
            const descriptionText = defaultDomainSection.createEl("p", {
                text: "These are the default settings for our office. Would you like to apply the following configurations?"
            });
            descriptionText.style.marginBottom = "15px";
            
            // 설정 정보 표시 (각각 체크박스 포함)
            const settingsInfo = defaultDomainSection.createDiv({ cls: "settings-info" });
            settingsInfo.style.marginLeft = "20px";
            settingsInfo.style.fontSize = "1.0em"; // 0.9em에서 1.0em으로 증가
            
            const { common, recording } = this.helperConfig;
            
            // OpenAI API Endpoint URL
            const openaiDiv = settingsInfo.createEl("div");
            openaiDiv.style.marginBottom = "8px";
            openaiDiv.style.display = "flex";
            openaiDiv.style.alignItems = "center";
            this.openaiCheckbox = openaiDiv.createEl("input", { type: "checkbox" });
            this.openaiCheckbox.style.marginRight = "8px";
            this.openaiCheckbox.checked = true;
            const openaiLabel = openaiDiv.createEl("label");
            openaiLabel.style.cursor = "pointer";
            openaiLabel.innerHTML = `OpenAI API Endpoint URL : <span style="color: var(--text-accent)">${common.openaiApiEndpoint || 'N/A'}</span>`;
            // 라벨 클릭 시 체크박스 토글
            openaiLabel.addEventListener("click", () => {
                this.openaiCheckbox.checked = !this.openaiCheckbox.checked;
            });
            
            // ChatAI PAT 링크 (OpenAI 아래에 추가)
            const chatAIPatDiv = settingsInfo.createEl("div");
            chatAIPatDiv.style.marginBottom = "8px";
            chatAIPatDiv.style.marginLeft = "23px"; // 체크박스 너비(14px) + 마진(8px) = 22px로 정렬
            chatAIPatDiv.style.fontSize = "0.9em"; // 0.85em에서 0.9em으로 증가
            chatAIPatDiv.style.color = "var(--text-muted)";
            chatAIPatDiv.innerHTML = `Get ChatAI PAT : <a href="${this.helperConfig.common.getChatAIPat || '#'}" target="_blank">Go to link</a>`;
            
            // Confluence Domain
            const confluenceDiv = settingsInfo.createEl("div");
            confluenceDiv.style.marginBottom = "8px";
            confluenceDiv.style.display = "flex";
            confluenceDiv.style.alignItems = "center";
            this.confluenceCheckbox = confluenceDiv.createEl("input", { type: "checkbox" });
            this.confluenceCheckbox.style.marginRight = "8px";
            this.confluenceCheckbox.checked = true;
            const confluenceLabel = confluenceDiv.createEl("label");
            confluenceLabel.style.cursor = "pointer";
            confluenceLabel.innerHTML = `Confluence Domain : <span style="color: var(--text-accent)">${common.confluenceDomain || 'N/A'}</span>`;
            // 라벨 클릭 시 체크박스 토글
            confluenceLabel.addEventListener("click", () => {
                this.confluenceCheckbox.checked = !this.confluenceCheckbox.checked;
            });
            
            // Confluence PAT 링크 (Confluence 아래에 추가)
            const confluencePatDiv = settingsInfo.createEl("div");
            confluencePatDiv.style.marginBottom = "8px";
            confluencePatDiv.style.marginLeft = "23px"; // 체크박스 너비(14px) + 마진(8px) = 22px로 정렬
            confluencePatDiv.style.fontSize = "0.9em"; // 0.85em에서 0.9em으로 증가
            confluencePatDiv.style.color = "var(--text-muted)";
            confluencePatDiv.innerHTML = `Get Confluence PAT : <a href="${this.helperConfig.common.getConfluencePat || '#'}" target="_blank">Go to link</a>`;
            
            // Slack Workspace Domain
            const slackWorkspaceDiv = settingsInfo.createEl("div");
            slackWorkspaceDiv.style.marginBottom = "8px";
            slackWorkspaceDiv.style.display = "flex";
            slackWorkspaceDiv.style.alignItems = "center";
            this.slackWorkspaceCheckbox = slackWorkspaceDiv.createEl("input", { type: "checkbox" });
            this.slackWorkspaceCheckbox.style.marginRight = "8px";
            this.slackWorkspaceCheckbox.checked = true;
            const slackWorkspaceLabel = slackWorkspaceDiv.createEl("label");
            slackWorkspaceLabel.style.cursor = "pointer";
            slackWorkspaceLabel.innerHTML = `Slack Workspace Domain : <span style="color: var(--text-accent)">${common.slackWorkspaceDomain || 'N/A'}</span>`;
            // 라벨 클릭 시 체크박스 토글
            slackWorkspaceLabel.addEventListener("click", () => {
                this.slackWorkspaceCheckbox.checked = !this.slackWorkspaceCheckbox.checked;
            });
            
            // Slack API Domain
            const slackApiDiv = settingsInfo.createEl("div");
            slackApiDiv.style.marginBottom = "8px";
            slackApiDiv.style.display = "flex";
            slackApiDiv.style.alignItems = "center";
            this.slackApiCheckbox = slackApiDiv.createEl("input", { type: "checkbox" });
            this.slackApiCheckbox.style.marginRight = "8px";
            this.slackApiCheckbox.checked = true;
            const slackApiLabel = slackApiDiv.createEl("label");
            slackApiLabel.style.cursor = "pointer";
            slackApiLabel.innerHTML = `Slack API Domain : <span style="color: var(--text-accent)">${common.slackApiDomain || 'N/A'}</span>`;
            // 라벨 클릭 시 체크박스 토글
            slackApiLabel.addEventListener("click", () => {
                this.slackApiCheckbox.checked = !this.slackApiCheckbox.checked;
            });
            
            // Slack API Proxy 도움말 링크 (Slack API Domain 아래에 추가)
            const slackProxyHelpDiv = settingsInfo.createEl("div");
            slackProxyHelpDiv.style.marginBottom = "8px";
            slackProxyHelpDiv.style.marginLeft = "23px"; // 체크박스 너비(14px) + 마진(8px) = 22px로 정렬
            slackProxyHelpDiv.style.fontSize = "0.9em"; // 0.85em에서 0.9em으로 증가
            slackProxyHelpDiv.style.color = "var(--text-muted)";
            slackProxyHelpDiv.innerHTML = `Reference Slack API Proxy Help : <a href="${this.helperConfig.common.slackApiProxyDoc || '#'}" target="_blank">Go to link</a>`;
            
            // Slack API Proxy 사용 시 설명 추가
            const slackProxyDescDiv = settingsInfo.createEl("div");
            slackProxyDescDiv.style.marginBottom = "8px";
            slackProxyDescDiv.style.marginLeft = "23px"; // 체크박스 정렬(22px) + 추가 들여쓰기(20px) = 42px
            slackProxyDescDiv.style.fontSize = "0.85em"; // 0.8em에서 0.85em으로 증가
            slackProxyDescDiv.style.color = "var(--text-muted)";
            slackProxyDescDiv.innerHTML = `When using Slack API proxy in the office, Slack bot token is not required.`;
            
            // Slack 앱 설치 관련 추가 설명
            const slackAppNoticeDiv = settingsInfo.createEl("div");
            slackAppNoticeDiv.style.marginBottom = "8px";
            slackAppNoticeDiv.style.marginLeft = "23px";
            slackAppNoticeDiv.style.fontSize = "0.85em";
            slackAppNoticeDiv.style.color = "var(--text-muted)";
            slackAppNoticeDiv.innerHTML = `Note: Add the Slack app to your target channel first. See help link above.`;


            if (recording?.customVocabulary && recording.customVocabulary.length > 0 ) {
                // Custom Vocabulary
                const customVocabularyDiv = settingsInfo.createEl("div");
                customVocabularyDiv.style.marginBottom = "8px";
                customVocabularyDiv.style.display = "flex";
                customVocabularyDiv.style.alignItems = "flex-start";
                this.customVocabularyCheckbox = customVocabularyDiv.createEl("input", { type: "checkbox" });
                this.customVocabularyCheckbox.style.marginRight = "8px";
                this.customVocabularyCheckbox.checked = true;
                const customVocabularyLabel = customVocabularyDiv.createEl("label");
                customVocabularyLabel.style.cursor = "pointer";
                customVocabularyLabel.style.display = "inline-block";
                customVocabularyLabel.style.flex = "1";
                customVocabularyLabel.style.whiteSpace = "normal";
                customVocabularyLabel.style.wordBreak = "break-word";
                customVocabularyLabel.innerHTML = `Custom Transcription Vocabulary:<br /><span style="color: var(--text-accent)">${recording.customVocabulary || 'N/A'}</span>`;
                // 라벨 클릭 시 체크박스 토글
                customVocabularyLabel.addEventListener("click", () => {
                    if (this.customVocabularyCheckbox) {
                        this.customVocabularyCheckbox.checked = !this.customVocabularyCheckbox.checked;
                    }
                });
                
                // customVocabulary PAT 링크 (customVocabulary 아래에 추가)
                const customVocabularyDesc = settingsInfo.createEl("div");
                customVocabularyDesc.style.marginBottom = "8px";
                customVocabularyDesc.style.marginLeft = "23px"; // 체크박스 너비(14px) + 마진(8px) = 22px로 정렬
                customVocabularyDesc.style.fontSize = "0.9em"; // 0.85em에서 0.9em으로 증가
                customVocabularyDesc.style.color = "var(--text-muted)";
                customVocabularyDesc.innerHTML = `Comma-separated word list to ensure clear recognition and accurate spelling while transcribing.`;
            } else {
            }
        }

        // 버튼 영역
        const buttonContainer = contentEl.createDiv({ cls: "setting-helper-buttons" });
        buttonContainer.style.marginTop = "20px";
        buttonContainer.style.display = "flex";
        buttonContainer.style.gap = "10px";
        buttonContainer.style.justifyContent = "flex-end";

        // Apply Selected Settings 버튼
        new Setting(buttonContainer)
            .addButton((button) => {
                button
                    .setButtonText("Apply Selected Settings")
                    .setCta()
                    .onClick(() => {
                        this.applySelectedSettings();
                        if (this.onApply) {
                            this.onApply();
                        }
                        this.close();
                    });
            });

        // 닫기 버튼
        new Setting(buttonContainer)
            .addButton((button) => {
                button
                    .setButtonText("Close")
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    private applySelectedSettings() {
        try {
            if (!this.helperConfig.common) return;

            const { common, recording } = this.helperConfig;
            let appliedCount = 0;
            
            // 선택된 설정값들만 플러그인 설정에 적용
            if (this.openaiCheckbox?.checked && common.openaiApiEndpoint) {
                this.plugin.settingsv2.common.openaiApiEndpoint = common.openaiApiEndpoint;
                // [GEMINI_PROXY] Uncomment when Gemini proxy is implemented:
                // this.plugin.settingsv2.common.geminiApiEndpoint = common.openaiApiEndpoint;
                appliedCount++;
            }
            if (this.confluenceCheckbox?.checked && common.confluenceDomain) {
                this.plugin.settingsv2.common.confluenceDomain = common.confluenceDomain;
                appliedCount++;
            }
            if (this.slackWorkspaceCheckbox?.checked && common.slackWorkspaceDomain) {
                this.plugin.settingsv2.common.slackWorkspaceDomain = common.slackWorkspaceDomain;
                appliedCount++;
            }
            if (this.slackApiCheckbox?.checked && common.slackApiDomain) {
                this.plugin.settingsv2.common.slackApiDomain = common.slackApiDomain;
                appliedCount++;
            }
            if (recording?.customVocabulary && this.customVocabularyCheckbox?.checked) {
                this.plugin.settingsv2.recording.customVocabulary = recording.customVocabulary;
                appliedCount++;
            }

            if (appliedCount === 0) {
                new Notice('Please select settings to apply.');
                return;
            }

            // 설정 저장
            this.plugin.settingsv2.saveSettings().then(() => {
                // 사용자에게 완료 알림
                new Notice(`${appliedCount} setting(s) have been applied.`);
            }).catch((error) => {
                new Notice('An error occurred while applying settings.');
                console.error('Error applying selected settings:', error);
            });
        } catch (error) {
            new Notice('An error occurred while applying settings.');
            console.error('Error in applySelectedSettings:', error);
        }
    }
}
