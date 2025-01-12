import fetch from "node-fetch";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";
import semver from "semver";

import { SummarDebug } from "./globals";

export class PluginUpdater {
  private plugin: any;

  private REMOTE_MANIFEST_URL = 'https://github.com/mcgabby/Summar/releases/latest/download/manifest.json';
  private PLUGIN_ZIP_URL = 'https://github.com/mcgabby/Summar/releases/latest/download/summar.zip';

  constructor(plugin: any) {
    this.plugin = plugin;
  }

  /**
   * 플러그인 업데이트 확인 및 수행
   */
  async updatePluginIfNeeded(): Promise<void> {
    try {
      SummarDebug.log(1, 'Checking for plugin updates...');
      const localVersion = this.getLocalVersion(this.plugin);
      const remoteVersion = await this.getRemoteVersion(this.REMOTE_MANIFEST_URL);

      if (!localVersion || !remoteVersion) {
        SummarDebug.log(1, 'Plugin is not installed. Installing now...');
      } else if (semver.gt(remoteVersion, localVersion)) {
        SummarDebug.log(1, `Updating plugin from version ${localVersion} to ${remoteVersion}...`);

        // 최신 플러그인 다운로드 및 설치
        const zipPath = path.join(this.plugin.OBSIDIAN_PLUGIN_DIR, `${this.plugin.PLUGIN_NAME}.zip`);
        await this.downloadPlugin(this.PLUGIN_ZIP_URL, zipPath);
        await this.extractZip(zipPath, path.join(this.plugin.OBSIDIAN_PLUGIN_DIR, this.plugin.PLUGIN_NAME));
        fs.unlinkSync(zipPath); // ZIP 파일 삭제

        SummarDebug.log(1, 'Summar update complete! Please reload Obsidian to apply changes.');
        const fragment = document.createDocumentFragment();

        {
          // 설명 메시지 추가
          const message1 = document.createElement("span");
          message1.textContent = "Summar update completed! Please click ";
          fragment.appendChild(message1);

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
          fragment.appendChild(link);

          // 설명 메시지 추가
          const message2 = document.createElement("span");
          message2.textContent = " to reload Obsidian and apply the changes.";
          fragment.appendChild(message2); // Fragment에 메시지 추가

          SummarDebug.Notice(0, fragment, 0);
        }
      } else if (localVersion === remoteVersion) {
        SummarDebug.log(1, 'Plugin is already up to date.');
        return;
      }
    } catch (error) {
      SummarDebug.error(1, 'Failed to update plugin:', error);
    }
  }

  // 로컬 manifest.json에서 버전 읽기
  private getLocalVersion(plugin: any): string | null {
    if (!fs.existsSync(plugin.LOCAL_MANIFEST_PATH)) {
      return null;
    }
    const manifest = JSON.parse(fs.readFileSync(plugin.LOCAL_MANIFEST_PATH, 'utf-8'));
    SummarDebug.log(1, 'Summar Local version:', manifest.version);
    return manifest.version || null;
  }

  // 원격 manifest.json에서 버전 가져오기
  private async getRemoteVersion(url: string): Promise<string | null> {
    interface Manifest {
      version: string;
    }

    try {
      SummarDebug.log(1, `Fetching manifest from URL: ${url}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch remote manifest. Status code: ${response.status}`);
      }

      const data = (await response.json()) as Manifest;
      return data.version || null;
    } catch (error) {
      SummarDebug.error(1, `Error fetching remote manifest: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 플러그인 다운로드
   */
  private async downloadPlugin(url: string, outputPath: string): Promise<void> {
    try {
      SummarDebug.log(1, `Fetching plugin from URL: ${url}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to download plugin. Status code: ${response.status}`);
      }

      const fileStream = fs.createWriteStream(outputPath);

      return new Promise((resolve, reject) => {
        // 응답의 Body 스트림을 파일 스트림으로 파이핑
        response.body?.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });

        fileStream.on("error", (error) => {
          fs.unlinkSync(outputPath); // 실패 시 파일 삭제
          reject(error);
        });
      });
    } catch (error) {
      SummarDebug.error(1, `Error downloading plugin: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * ZIP 파일 추출
   */
  private async extractZip(zipPath: string, extractTo: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`unzip -o \"${zipPath}\" -d \"${extractTo}\"`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

}