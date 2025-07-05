import { normalizePath } from "obsidian";
import { SummarDebug } from "./globals";
import SummarPlugin from "./main";

export interface DailyNotesConfig {
    folder: string;
    format: string;
    template: string;
}

export class DailyNotesHandler {
    private plugin: SummarPlugin;

    constructor(plugin: SummarPlugin) {
        this.plugin = plugin;
    }

    /**
     * Obsidian의 Daily Notes 플러그인 설정을 읽어옵니다.
     */
    async getDailyNotesConfig(): Promise<DailyNotesConfig | null> {
        try {
            // Core Daily Notes 플러그인이 활성화되어 있는지 확인
            const corePlugin = (this.plugin.app as any).internalPlugins?.plugins?.['daily-notes'];
            const isCoreEnabled = corePlugin?.enabled;
            
            if (!isCoreEnabled) {
                SummarDebug.log(2, "Core Daily Notes plugin is not enabled");
                return null;
            }

            // Core Daily Notes 설정 가져오기
            const coreConfig = corePlugin?.instance?.options || {};
            
            // Community Daily Notes 플러그인 설정도 확인 (있다면)
            let communityConfig: any = {};
            try {
                const configPath = '.obsidian/plugins/daily-notes/data.json';
                const configFile = this.plugin.app.vault.getAbstractFileByPath(configPath);
                if (configFile) {
                    const configContent = await this.plugin.app.vault.read(configFile as any);
                    communityConfig = JSON.parse(configContent);
                    SummarDebug.log(2, "Found community Daily Notes plugin config");
                }
            } catch (error) {
                SummarDebug.log(2, "No community Daily Notes plugin config found, using core settings only");
            }

            // 설정 병합 (Core 설정이 우선, Community 플러그인 설정으로 보완)
            const finalConfig = {
                folder: coreConfig.folder || communityConfig.folder || '',
                format: coreConfig.format || communityConfig.format || 'YYYY-MM-DD',
                template: coreConfig.template || communityConfig.template || ''
            };

            SummarDebug.log(2, `Daily Notes config: ${JSON.stringify(finalConfig)}`);
            return finalConfig;

        } catch (error) {
            SummarDebug.error(1, "Failed to read Daily Notes config:", error);
            return null;
        }
    }

    /**
     * 현재 날짜를 기반으로 Daily Note 파일 경로를 생성합니다.
     */
    getDailyNoteFilePath(config: DailyNotesConfig, date?: Date): string {
        const targetDate = date || new Date();
        
        // 날짜 포맷 적용 (moment.js 스타일)
        let formattedDate = this.formatDate(targetDate, config.format);
        
        // 폴더 경로와 결합
        const folder = config.folder ? normalizePath(config.folder) : '';
        const fileName = `${formattedDate}.md`;
        
        return folder ? normalizePath(`${folder}/${fileName}`) : fileName;
    }

    /**
     * 날짜를 지정된 포맷으로 변환합니다.
     * 기본적인 moment.js 스타일 포맷을 지원합니다.
     */
    private formatDate(date: Date, format: string): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const shortYear = String(year).slice(-2);

        return format
            .replace(/YYYY/g, String(year))
            .replace(/YY/g, shortYear)
            .replace(/MM/g, month)
            .replace(/DD/g, day)
            .replace(/M/g, String(date.getMonth() + 1))
            .replace(/D/g, String(date.getDate()));
    }

    /**
     * 파일 경로에서 날짜를 추출합니다.
     * 일반적인 날짜 형식 (YYYY-MM-DD, YYYYMMDD, YYMMDD 등)을 찾아 반환합니다.
     */
    private extractDateFromFilePath(filePath: string): Date | null {
        try {
            // 다양한 날짜 패턴 검색
            const patterns = [
                /(\d{4})-(\d{2})-(\d{2})/,  // YYYY-MM-DD
                /(\d{4})(\d{2})(\d{2})/,    // YYYYMMDD
                /(\d{4})\.(\d{2})\.(\d{2})/, // YYYY.MM.DD
                /(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
                /(\d{2})(\d{2})(\d{2})/,    // YYMMDD
            ];

            for (const pattern of patterns) {
                const match = filePath.match(pattern);
                if (match) {
                    let year = parseInt(match[1], 10);
                    let month = parseInt(match[2], 10) - 1; // JavaScript Date는 월이 0부터 시작
                    let day = parseInt(match[3], 10);
                    
                    // YYMMDD 패턴인 경우 (2자리 년도)
                    if (pattern.source === /(\d{2})(\d{2})(\d{2})/.source) {
                        // 2자리 년도를 4자리로 변환 (20년대는 2020년대, 그 외는 19년대로 가정)
                        year = year >= 0 && year <= 30 ? 2000 + year : 1900 + year;
                    }
                    
                    const date = new Date(year, month, day);
                    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
                        SummarDebug.log(2, `Extracted date from file path: ${date.toISOString().split('T')[0]}`);
                        return date;
                    }
                }
            }

            SummarDebug.log(2, `No valid date found in file path: ${filePath}`);
            return null;
        } catch (error) {
            SummarDebug.log(2, `Error extracting date from file path: ${filePath}`, error);
            return null;
        }
    }

    /**
     * Daily Note에 회의록 링크를 추가합니다.
     */
    async addMeetingLinkToDailyNote(meetingFilePath: string, meetingType: 'transcript' | 'summary' | 'refinement' = 'summary', recordingDate?: Date): Promise<boolean> {
        try {
            if (!this.plugin.settings.addLinkToDailyNotes) {
                SummarDebug.log(2, "Daily Notes linking is disabled in settings");
                return false;
            }

            const config = await this.getDailyNotesConfig();
            if (!config) {
                SummarDebug.log(1, "Daily Notes plugin is not enabled or configured properly");
                return false;
            }

            // 녹음 날짜를 기준으로 Daily Note 경로 생성 (녹음 날짜가 없으면 파일 경로에서 추출 시도)
            const targetDate = recordingDate || this.extractDateFromFilePath(meetingFilePath) || new Date();
            const dailyNoteFilePath = this.getDailyNoteFilePath(config, targetDate);
            SummarDebug.log(2, `Daily Note file path: ${dailyNoteFilePath} for date: ${targetDate.toISOString().split('T')[0]}`);

            // Daily Note 파일이 존재하는지 확인
            let dailyNoteFile = this.plugin.app.vault.getAbstractFileByPath(dailyNoteFilePath);
            let dailyNoteContent = '';

            if (dailyNoteFile) {
                // 기존 파일이 있으면 내용을 읽어옴
                dailyNoteContent = await this.plugin.app.vault.read(dailyNoteFile as any);
            } else {
                // 파일이 없으면 새로 생성
                SummarDebug.log(2, `Creating new Daily Note: ${dailyNoteFilePath}`);
                
                // 템플릿이 있으면 템플릿 내용을 가져옴
                if (config.template) {
                    try {
                        const templateFile = this.plugin.app.vault.getAbstractFileByPath(config.template);
                        if (templateFile) {
                            dailyNoteContent = await this.plugin.app.vault.read(templateFile as any);
                        }
                    } catch (error) {
                        SummarDebug.log(2, `Template file not found: ${config.template}`);
                    }
                }
            }

            // 회의록 링크 생성
            const meetingFileName = meetingFilePath.split('/').pop()?.replace('.md', '') || 'Unknown';
            
            const linkLine = `- [[${meetingFileName}]]`;

            // 링크가 이미 존재하는지 확인 (중복 방지)
            if (dailyNoteContent.includes(linkLine)) {
                SummarDebug.log(2, "Link already exists in Daily Note");
                return true;
            }

            // Transcription 섹션을 찾아서 링크 추가
            const updatedContent = this.addLinkToTranscriptionSection(dailyNoteContent, linkLine);

            // 파일 저장
            if (dailyNoteFile) {
                await this.plugin.app.vault.modify(dailyNoteFile as any, updatedContent);
            } else {
                await this.plugin.app.vault.create(dailyNoteFilePath, updatedContent);
            }

            SummarDebug.log(1, `Added meeting link to Daily Note: ${dailyNoteFilePath}`);
            return true;

        } catch (error) {
            SummarDebug.error(1, "Failed to add link to Daily Note:", error);
            return false;
        }
    }

    /**
     * 회의록 타입에 따른 라벨을 반환합니다.
     */
    private getMeetingTypeLabel(type: 'transcript' | 'summary' | 'refinement'): string {
        switch (type) {
            case 'transcript':
                return '전사 완료';
            case 'summary':
                return '회의록 작성';
            case 'refinement':
                return '회의록 보강';
            default:
                return '회의록';
        }
    }

    /**
     * Daily Note 내용에서 Transcription 섹션을 찾아 링크를 추가합니다.
     * Transcription 섹션이 없으면 생성합니다.
     */
    private addLinkToTranscriptionSection(content: string, linkLine: string): string {
        const lines = content.split('\n');
        let transcriptionSectionIndex = -1;
        let nextSectionIndex = -1;
        
        // Transcription 섹션 찾기 (다양한 형태의 헤더 지원)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toLowerCase();
            if (line.startsWith('#') && (
                line.includes('transcription') ||
                line.includes('전사') ||
                line.includes('녹음') ||
                line.includes('recording')
            )) {
                transcriptionSectionIndex = i;
                break;
            }
        }

        if (transcriptionSectionIndex >= 0) {
            // Transcription 섹션을 찾은 경우, 다음 섹션 찾기
            for (let i = transcriptionSectionIndex + 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('#') && line.length > 1) {
                    nextSectionIndex = i;
                    break;
                }
            }

            // 링크가 이미 있는지 확인
            const sectionEnd = nextSectionIndex >= 0 ? nextSectionIndex : lines.length;
            const sectionContent = lines.slice(transcriptionSectionIndex, sectionEnd).join('\n');
            if (sectionContent.includes(linkLine)) {
                return content; // 이미 존재하므로 변경하지 않음
            }

            // Transcription 섹션 내에서 적절한 위치에 링크 추가
            const insertIndex = nextSectionIndex >= 0 ? nextSectionIndex : lines.length;
            
            // 섹션 끝의 빈 줄 앞에 삽입
            let actualInsertIndex = insertIndex;
            while (actualInsertIndex > transcriptionSectionIndex + 1 && 
                   lines[actualInsertIndex - 1].trim() === '') {
                actualInsertIndex--;
            }

            lines.splice(actualInsertIndex, 0, linkLine);
        } else {
            // Transcription 섹션이 없으면 생성하여 추가
            const transcriptionSection = [
                '',
                '## 📝 Transcription',
                '',
                linkLine
            ];
            
            lines.push(...transcriptionSection);
        }

        return lines.join('\n');
    }
}
