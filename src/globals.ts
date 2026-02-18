import { 
  Notice, 
  requestUrl, 
  Hotkey, 
  Modifier, 
  RequestUrlParam, 
  RequestUrlResponsePromise, 
  MarkdownView, 
  normalizePath 
} from "obsidian";
import * as os from 'os';
import { Device } from '@capacitor/device';

export const PDF_SVG = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 24 24"
     fill="none"
     stroke="currentColor"
     stroke-width="1.5"
     stroke-linecap="round"
     stroke-linejoin="round">
  <!-- File outline with folded corner -->
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  
  <!-- Bottom bar (black by default; themeable via 'color') -->
  <rect x="1" y="13" width="22" height="10" rx="1.2" fill="var(--text-muted)" stroke="var(--text-muted)"/>

  <!-- 'PDF' letters in var(--background-primary) strokes on the bar -->
  <!-- P -->
  <path d="M5.5 16v4" stroke="var(--background-primary)" stroke-width="1.5"/>
  <path d="M5.5 16h2" stroke="var(--background-primary)" stroke-width="1.5"/>
  <path d="M7.5 16c1 0 1 2 0 2H5.5" stroke="var(--background-primary)" stroke-width="1.5"/>
  <!-- D -->
  <path d="M10.5 16v4" stroke="var(--background-primary)" stroke-width="1.5"/>
  <path d="M10.5 16h2" stroke="var(--background-primary)" stroke-width="1.5"/>
  <path d="M12.5 16c1.6 0 1.6 4 0 4H10.5" stroke="var(--background-primary)" stroke-width="1.5"/>
  <!-- F -->
  <path d="M16.5 16v4" stroke="var(--background-primary)" stroke-width="1.5"/>
  <path d="M16.5 16h3" stroke="var(--background-primary)" stroke-width="1.5"/>
  <path d="M16.5 18h2" stroke="var(--background-primary)" stroke-width="1.5"/>
</svg>
`;

import SummarPlugin from "./main";
import { SummarOutputRecord } from "./view/SummarViewTypes";

// import { PluginSettings } from "./types";
// import exp from "constants";

// SWIFT_SCRIPT_TEMPLATE 삭제됨. 이제 외부 Swift 파일을 사용하세요.

export class SummarViewContainer {
  plugin: SummarPlugin;
  outputRecord: SummarOutputRecord;

  timerInterval: number | undefined; // 타이머 ID
  dotCount = 0; // 점(.)의 개수
  started = false; // 시작 여부

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
    this.outputRecord = this.createOutputRecord();
  }

  private createOutputRecord(label: string = "compose prompt"): SummarOutputRecord {
    const record = new SummarOutputRecord(this.plugin.generateUniqueId());
    record.label = label;
    record.itemEl = null;
    record.result = "";
    record.noteName = undefined;
    record.folded = false;
    return record;
  }

  // 오버로드: 문자열 또는 옵션 객체 모두 지원 + clearOldItems 제어
  initOutputRecord(label?: string, clearOldItems?: boolean): void;
  initOutputRecord(opts?: { label?: string; clearOldItems?: boolean }): void;
  initOutputRecord(
    arg: string | { label?: string; clearOldItems?: boolean } = {},
    clearOldItems?: boolean
  ): void {
    let label = "";
    let shouldClear: boolean | undefined = clearOldItems;
    if (typeof arg === "string") {
      label = arg;
    } else if (arg && typeof arg === "object") {
      ({ label = "", clearOldItems: shouldClear } = arg);
    }
    this.outputRecord = this.createOutputRecord(label);
    // const doClear = typeof shouldClear === "boolean" ? shouldClear : (this.plugin.settingsv2.system.debugLevel < 3);
    const doClear = typeof shouldClear === "boolean" ? shouldClear : true;
    if (doClear) this.clearAllOutputItems();
  }

  setOutputRecord(key: string, label: string) {
    this.outputRecord.key = key;
    this.outputRecord.label = label;
  }

  pushOutputPrompt(prompt: string) {
    return this.plugin.pushOutputPrompt(this.outputRecord.key, prompt);
  }

  /**
   * Updates the value of a result container.
   * @param outputContainer The container object to update.
   * @param message The message to set as the value.
   */
  updateOutputText(message: string, isFinal=false): string {
      this.outputRecord.result = message;
      return this.plugin.updateOutputText(this.outputRecord.key, 
                                          this.outputRecord.label as string, 
                                          this.outputRecord.result,
                                          isFinal);
  }

  appendOutputText(message: string): string {
      this.outputRecord.result = message;
      return this.plugin.appendOutputText(this.outputRecord.key, 
                                          this.outputRecord.label as string, 
                                          this.outputRecord.result);
  }
  getOutputText(): string {
      return this.plugin.getOutputText(this.outputRecord.key);
  }

  setNewNoteName(newNotePath?: string) {
    this.outputRecord.noteName = newNotePath;
    this.plugin.setNewNoteName(this.outputRecord.key, this.outputRecord.noteName);
  } 

  foldOutput(fold: boolean): void {
    this.plugin.foldOutput(this.outputRecord.key, fold);
  }
  
  async clearAllOutputItems(): Promise<void> {
    await this.plugin.clearAllOutputItems();
  }

  // 타이머 시작 함수
  startTimer(): void {
    if (this.started) {
      return;
    }

    this.started = true; // 시작 여부 변경
    this.dotCount = 0; // 초기화
    this.timerInterval = window.setInterval(() => {
      const result = this.appendOutputText(".");      
      this.dotCount++;
    }, 500); // 500ms마다 실행
  }

  // 타이머 정지 함수
  stopTimer(): void {
    if (this.timerInterval !== undefined) {
      clearInterval(this.timerInterval); // 타이머 종료
      this.started = false; // 시작 여부 변경
      this.timerInterval = undefined;
    } else {
    }
  }

}

export class SummarDebug {
  private static debugLevel: number = 0;

  static initialize(debugLevel: number): void {
    this.debugLevel = debugLevel;
  }

  static Notice(debugLevel: number, msg: string | DocumentFragment, duration?: number): Notice | null {
    if (this.debugLevel >= debugLevel)
      return new Notice(msg, duration);
    return null;
  }
  static log(debugLevel: number, message?: any, ...optionalParams: any[]): void {
    if (this.debugLevel >= debugLevel)
      console.log(message, ...optionalParams);
  }

  static error(debugLevel: number, message?: any, ...optionalParams: any[]): void {
    if (this.debugLevel >= debugLevel)
      console.error(message, ...optionalParams);
  }

  static warn(debugLevel: number, message?: any, ...optionalParams: any[]): void {
    if (this.debugLevel >= debugLevel)
      console.warn(message, ...optionalParams);
  }

  static level(): number {
    return this.debugLevel;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function SummarRequestUrlWithTimeout(
  plugin: SummarPlugin,
  request: RequestUrlParam | string,
  timeoutMs: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("⏰ Request timed out"));
    }, timeoutMs);

    SummarRequestUrl(plugin, request)
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function SummarRequestUrl(plugin: SummarPlugin, request: RequestUrlParam | string, throwFlag: boolean = true): RequestUrlResponsePromise {
  let requestParam: RequestUrlParam;
  
  if (typeof request === 'string') {
    // request가 문자열이면 객체로 변환
    requestParam = { url: request, headers: {}, method: "GET", throw: throwFlag }; 
  } else {
    // request가 객체이면 그대로 사용
    requestParam = request;
    // 기존 헤더가 없으면 빈 객체로 초기화
    if (!requestParam.headers) {
      requestParam.headers = {};
    }
  }

  // User-Agent 헤더 추가
  requestParam.headers = { ...requestParam.headers, "user-agent": `Obsidian-Summar/${plugin.manifest.version}` };
  
  // curl 디버깅 로그 출력
  let curlDebug = `curl -X ${requestParam.method} "${requestParam.url}" \\`;
  for (const [key, value] of Object.entries(requestParam.headers)) {
    curlDebug += `\n-H "${key}: ${value}" \\`;
  }
  if (requestParam.body) {
    if (typeof requestParam.body === "string") {
      curlDebug += `\n-d '${requestParam.body}' \\`;
    } else if (requestParam.body instanceof ArrayBuffer) {
      const base64String = arrayBufferToBase64(requestParam.body); 
      curlDebug += `\n--data-binary '${base64String}' \\`;
    }
  }
  curlDebug += `\n--write-out "\\n\\n[HTTP Response Code]: %{http_code}\\n" \\`;
  curlDebug += `\n--silent \\`;
  curlDebug += `\n--show-error`;
  SummarDebug.log(3, curlDebug);

  return requestUrl(requestParam); // 수정된 객체로 requestUrl 호출
}

export function extractDomain(url: string): string | null {
  // URL에서 도메인을 추출하는 정규식
  const domainPattern = /^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i;
  const match = url.match(domainPattern);
  return match ? match[1] : null;
}

export function containsDomain(text: string, domain: string): boolean {
  // 정규식을 사용해 특정 도메인이 포함되어 있는지 확인
  const domainPattern = new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?${domain.replace('.', '\\.')}`, 'i');
  return domainPattern.test(text);
}

export function getFileBaseName(filePath: string): string {
  if (!filePath) {
    return '';
  }

  const segments = filePath.split(/[\\\/]/);
  const rawName = segments.length > 0 ? segments[segments.length - 1] : filePath;

  const dotIndex = rawName.lastIndexOf('.');
  if (dotIndex > 0) {
    return rawName.substring(0, dotIndex);
  }

  return rawName;
}

export function parseHotkey(hotkeyString: string): Hotkey | undefined{
  if (!hotkeyString || hotkeyString.length===0) return undefined;
  const parts = hotkeyString.split('+').map(part => part.trim().toLowerCase());
  const key = parts.pop() || '';  // 마지막 부분은 실제 키

  const modifiers: Modifier[] = parts.map(part => {
    switch (part) {
      case 'ctrl': return 'Mod';
      case 'shift': return 'Shift';
      case 'alt': return 'Alt';
      case 'cmd': return 'Meta';
      default: return '' as Modifier;  // 빈 문자열을 Modifier로 캐스팅
    }
  }).filter(Boolean) as Modifier[];  // 타입 필터링

  return { modifiers, key };
}

async function getDeviceName(): Promise<string> {
  // 데스크탑 환경인 경우
  if (os && os.hostname) {
    SummarDebug.log(1, `desktop: ${os.hostname()}`);
    return os.hostname();
  }

  // 모바일(Android, iOS) 환경인 경우
  try {
      const info = await Device.getInfo();
      SummarDebug.log(1, `mobile: ${info.name}`);
      return info.name || "Unknown Device";
  } catch (error) {
      SummarDebug.error(1, 'Failed to get device name:', error);
      return "Unknown Device";
  }
}

function replaceAllSpecialChars(input: string): string {
  // 알파벳, 숫자를 제외한 모든 문자를 '_'로 변환
  const encodedInput = encodeURIComponent(input);
  const allSpecialCharsRegex = /[^a-zA-Z0-9]/g;
  return encodedInput.replace(allSpecialCharsRegex, '_');
}

// 디바이스 ID 로드 또는 생성
export async function getDeviceId(plugin: any): Promise<string> {
  const deviceName = await getDeviceName();

  const deviceId = `selectedDeviceId_${replaceAllSpecialChars(deviceName)}`;
  SummarDebug.log(1, `deviceId: ${deviceId}`);
  return deviceId;
}

// 특수문자 제거 및 안전한 키 생성 함수
export function sanitizeLabel(label: string): string {
  return label.replace(/[ .,+'"']/g, '_').toLowerCase();
}

// 저장된 라벨을 기반으로 deviceId를 반환하는 함수
export async function getDeviceIdFromLabel(savedLabel: string): Promise<string | null> {
  try {
      // 마이크 권한 요청 및 초기화
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      // 초기화 지연 (Android 환경 안정화)
      await new Promise(resolve => setTimeout(resolve, 500));

      // 장치 목록 가져오기
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      // 저장된 라벨을 정규화
      const normalizedSavedLabel = sanitizeLabel(savedLabel);

      // 라벨 비교를 통해 일치하는 deviceId 찾기
      for (const device of audioDevices) {
          const deviceLabel = device.label || "Unknown Device";
          const normalizedDeviceLabel = sanitizeLabel(deviceLabel);

          if (normalizedDeviceLabel === normalizedSavedLabel) {
              return device.deviceId;
          }
      }

      // 일치하는 장치가 없는 경우
      // console.warn("No matching device found for label:", savedLabel);
      SummarDebug.log(1,`No matching device found for label: ${savedLabel}`);
      return null;

  } catch (error) {
      SummarDebug.error(1, "Error while retrieving deviceId from label:", error);
      return null;
  }
}


// Function to find the next available filename with postfix
export function getAvailableFilePath(basePath: string, suffix: string, plugin: SummarPlugin): string  {
  let index = 1;
  let currentPath = `${basePath}${suffix}`;
  while (plugin.app.vault.getAbstractFileByPath(currentPath)) {
    currentPath = `${basePath} (${index})${suffix}`;
    index++;
  }
  return currentPath;
}

export async function showSettingsTab(plugin: SummarPlugin, tabname: string) {
  // Set savedTabId before opening so any display() triggered by open-settings
  // already renders the correct tab (avoids a redundant display() call)
  plugin.summarSettingTab.savedTabId = tabname;

  // 설정 창 열기
  (plugin.app as any).commands.executeCommandById("app:open-settings");

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
      let summarTabFound = false;

      navLinks.forEach((link) => {
        const linkEl = link as HTMLElement;

        if (linkEl.innerText.includes("Summar")) {
          summarTabFound = true;

          if (linkEl.classList.contains('is-active')) {
            // Summar is already the active settings tab.
            // display() was already called by executeCommandById with the correct
            // savedTabId, so only a DOM-level tab switch is needed.
            plugin.summarSettingTab.activateTab(tabname);
          } else {
            // Summar is not yet active: click to navigate to it.
            // savedTabId is already set, so the resulting display() call will
            // render the correct internal tab immediately.
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            linkEl.dispatchEvent(clickEvent);
          }
        }
      });

      // Summar 탭을 찾지 못하면 계속 감시
      if (!summarTabFound) {
        requestAnimationFrame(waitForSummarTab);
      }
    } else {
      // SummarDebug.log(3, "설정창이 아직 로드되지 않음, 다시 확인...");
      requestAnimationFrame(waitForSummarTab);
    }
  };

  // 설정창이 완전히 열릴 때까지 감시 시작
  requestAnimationFrame(waitForSummarTab);
}

export class SummarTooltip {
  private plugin: SummarPlugin;  
  private tooltipEl: HTMLElement | null = null;
  private showTimeout: number | null = null;

  constructor(plugin: SummarPlugin) {
    this.plugin = plugin;
    this.plugin.register(() => this.cleanup());
  }

  attach(el: HTMLElement, content: string, delay = 300) {
    el.addEventListener('mouseenter', () => {
      this.showTimeout = window.setTimeout(() => {
        this.showTooltip(el, content);
      }, delay);
    });

    el.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    el.addEventListener('blur', () => {
      this.hideTooltip();
    });

    el.addEventListener('focus', () => {
      this.showTooltip(el, content);
    });
  }

  private showTooltip(anchor: HTMLElement, content: string) {
    if (this.tooltipEl) return;

    const tooltip = createDiv('custom-tooltip');
    tooltip.setText(content);

    document.body.appendChild(tooltip);
    this.tooltipEl = tooltip;
  
    requestAnimationFrame(() => {
      const styles = getComputedStyle(document.body);
  
      let bgColor = styles.getPropertyValue('--tooltip-bg').trim();
      let textColor = styles.getPropertyValue('--tooltip-text').trim();

      if (bgColor === '' || bgColor === 'transparent' || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(bgColor)) {
        bgColor = '#2e2e2e'; // 어두운 회색 계열 기본값
      }

      tooltip.setCssStyles({
        position: 'fixed',
        backgroundColor: bgColor,
        color: textColor || '#ffffff',
        padding: '6px 12px',
        borderRadius: '4px',
        fontSize: '12px',
        maxWidth: '300px',
        textAlign: 'left',
        whiteSpace: 'pre-wrap',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        zIndex: '9999',
        pointerEvents: 'none'
      });

      const rect = anchor.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();

      tooltip.setCssStyles({
        top: `${rect.bottom + 5}px`,
        left: `${Math.max(5, rect.left + rect.width / 2 - tipRect.width / 2)}px`
      });
    });
  }

  private hideTooltip() {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }

  private cleanup() {
    this.hideTooltip();
  }
}

// 파일명을 안전하게 처리하는 함수 (파일 시스템 + markdown 링크 호환성)
export function sanitizeFileName(fileName: string): string {
  // 파일 시스템에서 문제가 되는 문자들과 markdown 링크에서 문제가 되는 문자들을 제거
  // 파일 시스템: < > : " / \ | ? *
  // Markdown 링크: # [ ] ^ | ( )
  // 추가로 백틱, 언더스코어, 틸드 등도 문제가 될 수 있음
  return fileName
    .replace(/[<>:"/\\|?*#\[\]^(){}`;~`]/g, '-')  // 특수문자를 하이픈으로 변환
    .replace(/\s+/g, ' ')  // 연속된 공백을 하나의 공백으로 변환 (언더스코어 대신 공백 유지)
    .replace(/-{2,}/g, '-')  // 연속된 하이픈을 하나로 변환
    .replace(/^[-\s]+|[-\s]+$/g, '')  // 시작과 끝의 하이픈, 공백 제거
    .trim();
}

export async function openNote(plugin: SummarPlugin, noteName: string, outputTextContent: string) {
    try {
      const filePath = normalizePath(noteName);
      const existingFile = plugin.app.vault.getAbstractFileByPath(filePath);

      if (existingFile) {
        SummarDebug.log(1, `file exist: ${filePath}`);
        const leaves = plugin.app.workspace.getLeavesOfType("markdown");

        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MarkdownView && view.file && view.file.path === filePath) {
            plugin.app.workspace.setActiveLeaf(leaf);
            return;
          }
        }
        await plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);        
      } else {
        SummarDebug.log(1, `file is not exist: ${filePath}`);
        const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
        const folderExists = await plugin.app.vault.adapter.exists(folderPath);
        if (!folderExists) {
          plugin.app.vault.adapter.mkdir(folderPath);
        }
        
        SummarDebug.log(1, `outputText content===\n${outputTextContent}`);
        await plugin.app.vault.create(filePath, outputTextContent);
        await plugin.app.workspace.openLinkText(normalizePath(filePath), "", true);
      }
    } catch (error) {
      SummarDebug.error(1, "Error creating/opening note:", error);
    }
  }
