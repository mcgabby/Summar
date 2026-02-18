import { App, Modal, Setting } from 'obsidian';
import SummarPlugin from './main';
import {
  checkGoogleDriveStatus,
  readCalendarJson,
  checkCalendarJsonExists,
  checkNetworkStatus
} from './googledrive-utils';
import * as fs from 'fs';
import * as path from 'path';

export class CalendarSettingModal extends Modal {
  plugin: SummarPlugin;
  webAppUrl: string;
  pollInterval: NodeJS.Timeout | null = null;
  fileWatcher: fs.FSWatcher | null = null;
  attemptCount: number = 0;
  selectedDrivePath: string | null = null;

  // UI elements
  private calendarListEl: HTMLElement | null = null;
  private statusMessageEl: HTMLElement | null = null;
  private syncWarningEl: HTMLElement | null = null;
  private debugSectionEl: HTMLElement | null = null;
  private debugPreEl: HTMLElement | null = null;

  constructor(app: App, plugin: SummarPlugin, webAppUrl: string) {
    super(app);
    this.plugin = plugin;
    this.webAppUrl = webAppUrl;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('calendar-setting-modal');

    // Title
    contentEl.createEl('h2', { text: '📅 Google Calendar 설정' });

    // Check Google Drive status
    await this.renderGoogleDriveStatus(contentEl);

    // Check if we should continue (platform supported and Drive installed)
    const status = await checkGoogleDriveStatus();

    if (!status.platformSupported) {
      this.renderPlatformNotSupported(contentEl);
      return;
    }

    if (!status.installed || !status.loggedIn) {
      // Google Drive status messages already shown above
      return;
    }

    // Show permission info only when events.json does not exist yet
    const jsonExists = await checkCalendarJsonExists(
      this.plugin.settingsv2.schedule.googleDriveFilePath,
      this.selectedDrivePath || undefined
    );
    if (!jsonExists) {
      this.renderPermissionInfo(contentEl);
    }

    // Calendar selection button
    this.renderSelectButton(contentEl);

    // Calendar list (will be populated when JSON is detected)
    this.renderCalendarList(contentEl);

    // Help section
    this.renderHelpSection(contentEl);

    // Debug info (collapsed by default)
    this.renderDebugInfo(contentEl);

    // Start monitoring for JSON file
    this.startMonitoring();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.stopMonitoring();
  }

  /**
   * Render Google Drive status and warnings
   */
  private async renderGoogleDriveStatus(containerEl: HTMLElement): Promise<void> {
    const statusContainer = containerEl.createDiv({ cls: 'google-drive-status' });

    const status = await checkGoogleDriveStatus();

    if (!status.platformSupported) {
      return; // Will be handled separately
    }

    // Not installed
    if (!status.installed) {
      statusContainer.createEl('p', {
        text: '⚠️ Google Drive Desktop이 필요합니다',
        attr: { style: 'color: #d97706; font-weight: 600; margin-bottom: 8px;' }
      });

      const steps = statusContainer.createEl('div', { cls: 'setup-steps' });
      steps.createEl('p', { text: '다음 단계를 따라주세요:' });

      const ol = steps.createEl('ol');
      ol.createEl('li', { text: 'Google Drive Desktop 다운로드 및 설치' });
      ol.createEl('li', { text: 'Google 계정으로 로그인' });
      ol.createEl('li', { text: '동기화 완료 대기' });
      ol.createEl('li', { text: 'Obsidian 재시작' });

      new Setting(statusContainer)
        .addButton(button => button
          .setButtonText('Google Drive 다운로드')
          .onClick(() => {
            window.open('https://www.google.com/drive/download/', '_blank');
          })
        );

      return;
    }

    // Installed but not logged in
    if (!status.loggedIn) {
      statusContainer.createEl('p', {
        text: '⚠️ Google Drive에 로그인이 필요합니다',
        attr: { style: 'color: #d97706; font-weight: 600; margin-bottom: 8px;' }
      });

      const steps = statusContainer.createEl('div', { cls: 'setup-steps' });
      steps.createEl('p', { text: '다음 단계를 따라주세요:' });

      const ol = steps.createEl('ol');
      ol.createEl('li', { text: 'Google Drive 앱 실행' });
      ol.createEl('li', { text: 'Google 계정으로 로그인' });
      ol.createEl('li', { text: '동기화 완료 대기' });
      ol.createEl('li', { text: '이 창에서 "새로고침" 클릭' });

      const buttonContainer = statusContainer.createDiv({ cls: 'button-container' });

      new Setting(buttonContainer)
        .addButton(button => button
          .setButtonText('Google Drive 열기')
          .onClick(() => {
            require('child_process').exec('open -a "Google Drive"');
          })
        )
        .addButton(button => button
          .setButtonText('새로고침')
          .onClick(async () => {
            this.contentEl.empty();
            await this.onOpen();
          })
        );

      return;
    }

    // Multiple accounts detected
    if (status.multipleAccounts) {
      statusContainer.createEl('p', {
        text: 'ℹ️ 여러 Google Drive 계정이 감지되었습니다',
        attr: { style: 'color: #0088cc; font-weight: 600; margin-bottom: 8px;' }
      });

      new Setting(statusContainer)
        .setName('사용할 계정 선택')
        .setDesc('Summar와 동기화할 Google Drive 계정을 선택하세요')
        .addDropdown(dropdown => {
          status.availablePaths.forEach((drivePath) => {
            const folderName = path.basename(drivePath);
            dropdown.addOption(drivePath, folderName);
          });

          dropdown.setValue(status.drivePath || status.availablePaths[0]);
          dropdown.onChange((value) => {
            this.selectedDrivePath = value;
          });
        });

      this.selectedDrivePath = status.drivePath;
    } else {
      // All good - show success message briefly
      statusContainer.createEl('p', {
        text: '✅ Google Drive 준비 완료',
        attr: { style: 'color: #16a34a; font-weight: 600; margin-bottom: 8px;' }
      });

      this.selectedDrivePath = status.drivePath;
    }
  }

  /**
   * Render platform not supported message
   */
  private renderPlatformNotSupported(containerEl: HTMLElement): void {
    containerEl.createEl('p', {
      text: '⚠️ Google Calendar 동기화는 현재 macOS에서만 지원됩니다.',
      attr: { style: 'color: #d97706; margin-bottom: 12px;' }
    });

    containerEl.createEl('p', {
      text: 'Windows/Linux에서는 CalDAV 설정을 사용하세요.',
      attr: { style: 'margin-bottom: 12px;' }
    });

    new Setting(containerEl)
      .addButton(button => button
        .setButtonText('닫기')
        .onClick(() => this.close())
      );
  }

  /**
   * Render permission information
   */
  private renderPermissionInfo(containerEl: HTMLElement): void {
    const permissionSection = containerEl.createDiv({ cls: 'permission-section' });

    permissionSection.createEl('h3', { text: '📋 필요한 권한' });

    const infoBox = permissionSection.createDiv({ cls: 'info-box' });
    infoBox.createEl('p', {
      text: 'Google Apps Script 웹앱에서 다음 권한을 요청합니다:',
      attr: { style: 'margin-bottom: 12px;' }
    });

    const permList = infoBox.createEl('ul');

    const calPerm = permList.createEl('li');
    calPerm.createEl('strong', { text: '✓ Google Calendar 읽기' });
    const calDetails = calPerm.createEl('ul');
    calDetails.createEl('li', { text: '캘린더 목록 조회' });
    calDetails.createEl('li', { text: '이벤트 정보 읽기 (제목, 시간, 참석자 등)' });
    calDetails.createEl('li', { text: '회의 URL 추출 (Zoom, Google Meet, Teams)' });

    const drivePerm = permList.createEl('li');
    drivePerm.createEl('strong', { text: '✓ Google Drive 파일 작성' });
    const driveDetails = drivePerm.createEl('ul');
    driveDetails.createEl('li', { text: 'events.json 파일 생성/수정' });
    driveDetails.createEl('li', { text: 'Summar 폴더 생성' });

    const pathInfo = infoBox.createDiv({ cls: 'path-info', attr: { style: 'margin-top: 12px; padding: 8px; background: var(--background-secondary); border-radius: 4px;' } });
    pathInfo.createEl('div', { text: `📁 저장 위치: ${this.plugin.settingsv2.schedule.googleDriveFilePath}` });
    pathInfo.createEl('div', {
      text: `🔄 동기화 간격: ${Math.round(this.plugin.settingsv2.schedule.googleDriveSyncInterval / 60)}분마다`,
      attr: { style: 'margin-top: 4px;' }
    });
  }

  /**
   * Render calendar selection button
   */
  private renderSelectButton(containerEl: HTMLElement): void {
    const buttonSection = containerEl.createDiv({ cls: 'button-section', attr: { style: 'margin: 20px 0;' } });

    new Setting(buttonSection)
      .setName('캘린더 선택')
      .setDesc('Google Apps Script 웹앱을 열어 동기화할 캘린더를 선택합니다')
      .addButton(button => button
        .setButtonText('Calendar 선택')
        .setCta()
        .onClick(async () => {
          await this.openWebApp();
        })
      );
  }

  /**
   * Open Google Apps Script web app
   */
  private async openWebApp(): Promise<void> {
    const filePath = this.plugin.settingsv2.schedule.googleDriveFilePath;
    const intervalSeconds = this.plugin.settingsv2.schedule.googleDriveSyncInterval;
    const intervalMinutes = Math.round(intervalSeconds / 60);

    // Validate interval for Google Apps Script
    const validIntervals = [1, 5, 10, 15, 30];
    const validInterval = validIntervals.reduce((prev, curr) => {
      return Math.abs(curr - intervalMinutes) < Math.abs(prev - intervalMinutes) ? curr : prev;
    });

    const params = new URLSearchParams({
      filePath: filePath,
      interval: String(validInterval),
      vaultName: this.plugin.app.vault.getName()
    });

    const fullUrl = `${this.webAppUrl}?${params.toString()}`;
    window.open(fullUrl, '_blank');

    // Show monitoring message
    if (this.statusMessageEl) {
      this.statusMessageEl.textContent = '⏳ Google Drive 동기화 대기 중...';
      this.statusMessageEl.style.color = '#0088cc';
    }
  }

  /**
   * Render calendar list section
   */
  private renderCalendarList(containerEl: HTMLElement): void {
    const listSection = containerEl.createDiv({ cls: 'calendar-list-section' });

    listSection.createEl('hr', { attr: { style: 'margin: 20px 0; border: none; border-top: 1px solid var(--background-modifier-border);' } });

    listSection.createEl('h3', { text: '선택된 캘린더' });

    this.statusMessageEl = listSection.createEl('p', {
      text: '(확인 중...)',
      attr: { style: 'color: #666; font-style: italic;' }
    });

    this.calendarListEl = listSection.createDiv({ cls: 'calendar-list' });
  }

  /**
   * Update calendar list UI with data
   */
  private updateCalendarListUI(calendars: Array<{ id: string; name: string }>, localFileTime: Date): void {
    if (!this.calendarListEl || !this.statusMessageEl) return;

    if (this.syncWarningEl) {
      this.syncWarningEl.remove();
      this.syncWarningEl = null;
    }
    this.attemptCount = 0;

    this.statusMessageEl.textContent = `✅ 선택된 캘린더 (${calendars.length}개)`;
    this.statusMessageEl.style.color = '#16a34a';
    this.statusMessageEl.style.fontStyle = 'normal';
    this.statusMessageEl.style.fontWeight = '600';

    this.calendarListEl.empty();

    this.calendarListEl.createEl('p', {
      text: `마지막 업데이트 시간: ${localFileTime.toLocaleString()}`,
      attr: { style: 'color: #666; font-size: 0.85em; margin-bottom: 8px;' }
    });

    if (calendars.length === 0) {
      this.calendarListEl.createEl('p', {
        text: '선택된 캘린더가 없습니다.',
        attr: { style: 'color: #666; font-style: italic;' }
      });
      return;
    }

    const ul = this.calendarListEl.createEl('ul', { cls: 'calendar-items' });

    calendars.forEach(cal => {
      const li = ul.createEl('li');
      li.createEl('span', { text: '📅 ', attr: { style: 'margin-right: 8px;' } });
      li.createEl('span', { text: cal.name });
    });

    // Add close button
    new Setting(this.calendarListEl)
      .addButton(button => button
        .setButtonText('닫기')
        .onClick(() => this.close())
      );
  }

  /**
   * Show sync delay warning (reuses existing element to avoid duplication)
   */
  private showSyncDelayWarning(): void {
    if (!this.statusMessageEl) return;

    // Reuse existing warning element if already shown
    if (!this.syncWarningEl) {
      this.syncWarningEl = this.statusMessageEl.parentElement?.createDiv({ cls: 'sync-warning' }) ?? null;
      if (!this.syncWarningEl) return;

      this.syncWarningEl.setAttribute('style', 'background: #fff9e6; border-left: 4px solid #ffc107; padding: 12px; margin-top: 12px; border-radius: 4px;');

      this.syncWarningEl.createEl('p', {
        text: '⏳ 파일이 아직 동기화되지 않았습니다',
        attr: { style: 'font-weight: 600; margin-bottom: 8px;' }
      });

      const tipsList = this.syncWarningEl.createEl('ul');
      tipsList.createEl('li', { text: 'Google Drive 앱에서 동기화 상태를 확인하세요' });
      tipsList.createEl('li', { text: '인터넷 연결을 확인하세요' });
      tipsList.createEl('li', { text: '잠시 후 자동으로 다시 확인됩니다' });
    }
  }

  /**
   * Start monitoring for JSON file (both polling and file watcher)
   */
  private async startMonitoring(): Promise<void> {
    // Try to set up file watcher first
    await this.startFileWatcher();

    // Always start polling as backup (file watcher may not work in all cases)
    this.startPolling();

    // Do immediate check
    await this.checkAndUpdateCalendarList();
  }

  /**
   * Start file watcher for immediate detection
   */
  private async startFileWatcher(): Promise<boolean> {
    try {
      const drivePath = this.selectedDrivePath || await checkGoogleDriveStatus().then(s => s.drivePath);
      if (!drivePath) return false;

      const fullPath = path.join(drivePath, this.plugin.settingsv2.schedule.googleDriveFilePath);
      const parentDir = path.dirname(fullPath);
      const filename = path.basename(fullPath);

      // Check if parent directory exists
      if (!fs.existsSync(parentDir)) {
        console.log('[Calendar Modal] Parent directory does not exist yet, using polling only');
        return false;
      }

      this.fileWatcher = fs.watch(parentDir, (eventType, changedFile) => {
        if (changedFile === filename && (eventType === 'change' || eventType === 'rename')) {
          console.log('[Calendar Modal] File change detected');
          this.checkAndUpdateCalendarList();
        }
      });

      console.log('[Calendar Modal] File watcher started');
      return true;

    } catch (err) {
      console.warn('[Calendar Modal] File watcher failed, using polling only:', err);
      return false;
    }
  }

  /**
   * Start polling for JSON file
   */
  private startPolling(): void {
    if (this.pollInterval) return; // Already polling

    this.pollInterval = setInterval(async () => {
      await this.checkAndUpdateCalendarList();
    }, 3000); // Check every 3 seconds

    console.log('[Calendar Modal] Polling started (3s interval)');
  }

  /**
   * Stop all monitoring
   */
  private stopMonitoring(): void {
    this.stopPolling();
    this.stopFileWatcher();
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[Calendar Modal] Polling stopped');
    }
  }

  /**
   * Stop file watcher
   */
  private stopFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      console.log('[Calendar Modal] File watcher stopped');
    }
  }

  /**
   * Check for JSON file and update UI
   */
  private async checkAndUpdateCalendarList(): Promise<void> {
    this.attemptCount++;

    try {
      const jsonData = await readCalendarJson(
        this.plugin.settingsv2.schedule.googleDriveFilePath,
        this.selectedDrivePath || undefined,
        this.plugin.app.vault.getName()
      );

      if (!jsonData) {
        // File not found yet
        if (this.statusMessageEl) {
          this.statusMessageEl.textContent = `⏳ Google Drive 동기화 대기 중... (${this.attemptCount}회 시도, ${this.attemptCount * 3}초 경과)`;
          this.statusMessageEl.style.color = '#0088cc';
        }

        // Show delay warning after 30 seconds
        if (this.attemptCount >= 10 && this.attemptCount % 10 === 0) {
          this.showSyncDelayWarning();
        }

        return;
      }

      // File found and parsed successfully!
      console.log('[Calendar Modal] Calendar JSON detected:', jsonData.selectedCalendars.length, 'calendars');
      this.updateCalendarListUI(jsonData.selectedCalendars, jsonData.localFileTime);

    } catch (err) {
      console.error('[Calendar Modal] Failed to check calendar JSON:', err);
      // Don't show error to user, will retry automatically
    }
  }

  /**
   * Render help section
   */
  private renderHelpSection(containerEl: HTMLElement): void {
    const helpSection = containerEl.createDiv({ cls: 'help-section', attr: { style: 'margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--background-modifier-border);' } });

    const collapsible = helpSection.createEl('details');
    collapsible.createEl('summary', {
      text: '📖 사용 가이드',
      attr: { style: 'cursor: pointer; font-weight: 600; margin-bottom: 8px;' }
    });

    const content = collapsible.createDiv();

    const steps = [
      '"Calendar 선택" 버튼을 클릭하여 웹앱을 엽니다',
      'Google 계정으로 로그인하고 권한을 승인합니다',
      '동기화할 캘린더를 선택합니다',
      '"Save Settings & Start Sync" 버튼을 클릭합니다',
      '잠시 후 이 창에서 선택된 캘린더가 표시됩니다'
    ];

    const ol = content.createEl('ol');
    steps.forEach(step => {
      ol.createEl('li', { text: step });
    });
  }

  /**
   * Render debug information
   */
  private renderDebugInfo(containerEl: HTMLElement): void {
    const debugContainer = containerEl.createDiv({ cls: 'debug-section', attr: { style: 'margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--background-modifier-border);' } });

    const collapsible = debugContainer.createEl('details');
    collapsible.createEl('summary', {
      text: '🐛 디버그 정보',
      attr: { style: 'cursor: pointer; font-weight: 600; margin-bottom: 8px;' }
    });

    this.debugSectionEl = collapsible.createDiv();

    new Setting(this.debugSectionEl)
      .setName('디버그 정보 새로고침')
      .addButton(button => button
        .setButtonText('새로고침')
        .onClick(async () => {
          await this.updateDebugInfo();
        })
      );

    this.debugPreEl = this.debugSectionEl.createEl('pre', {
      attr: {
        style: 'background: var(--background-secondary); padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 0.85em;'
      }
    });

    // Initial load
    this.updateDebugInfo();
  }

  /**
   * Update debug information
   */
  private async updateDebugInfo(): Promise<void> {
    if (!this.debugSectionEl) return;

    const status = await checkGoogleDriveStatus();
    const networkOk = await checkNetworkStatus();

    const fullPath = status.drivePath
      ? path.join(status.drivePath, this.plugin.settingsv2.schedule.googleDriveFilePath)
      : 'N/A';

    const fileExists = status.drivePath
      ? fs.existsSync(fullPath)
      : false;

    const debugInfo = {
      platform: process.platform,
      platformSupported: status.platformSupported,
      googleDriveInstalled: status.installed,
      googleDriveLoggedIn: status.loggedIn,
      drivePath: status.drivePath,
      multipleAccounts: status.multipleAccounts,
      availablePaths: status.availablePaths,
      selectedDrivePath: this.selectedDrivePath,
      vaultName: this.plugin.app.vault.getName(),
      expectedFilePath: this.plugin.settingsv2.schedule.googleDriveFilePath,
      fullPath: fullPath,
      fileExists: fileExists,
      attemptCount: this.attemptCount,
      networkStatus: networkOk ? 'Connected' : 'Disconnected',
      pollingActive: this.pollInterval !== null,
      watcherActive: this.fileWatcher !== null
    };

    // Update existing pre element in-place
    if (this.debugPreEl) {
      this.debugPreEl.textContent = JSON.stringify(debugInfo, null, 2);
    }
  }
}
