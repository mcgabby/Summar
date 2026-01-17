import SummarPlugin from "./main";
import { SummarDebug } from "./globals";
import semver from "semver"

// API 로그 인터페이스
export interface APICallLog {
    id: string;
    timestamp: number;
    timestampISO: string;
    provider: 'openai' | 'gemini' | 'claude';
    model: string;
    actualModelUsed: string;

    endpoint: string;
    feature: string;
    
    requestSize: number;
    responseSize: number;
    requestTokens?: number;
    responseTokens?: number;
    totalTokens?: number;
    duration?: number;
    
    cost?: number;
    latency: number;
    success: boolean;
    errorMessage?: string;
    
    sessionId: string;
    userAgent: string;
    version: string;
}

// IndexedDB 관리 클래스
export class IndexedDBManager {
    /**
     * 현재 Summarailog 모듈의 버전을 나타냅니다.
     * 이 버전 정보는 로그 데이터의 스키마나 계산 방식이 변경될 때 사용되며,
     * 각 로그 항목에 기록되어 나중에 마이그레이션이나 비용 재계산 등 버전별 처리가 필요할 때 활용됩니다.
     */
    version = '1.0.3'; 
    /**
     * 현재 데이터베이스의 스키마 버전을 나타냅니다.
     * 데이터베이스 구조가 변경될 때마다 이 값을 증가시켜 마이그레이션을 관리합니다.
     */
    private dbVersion = 6;



    dbName = `summar-ai-api-logs-db`;
    private db: IDBDatabase | null = null;

    async init(plugin: SummarPlugin): Promise<void> {
        this.dbName = `summar-ai-api-logs-db-${plugin.app.vault.getName()}`;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                // Cleanup old conversation logs (older than 1 day). Run asynchronously.
                try {
                    void this.clearOldConversationLogs(1)
                        .then((deleted) => SummarDebug.log(1, `clearOldConversationLogs(1): ${deleted} rows deleted`))
                        .catch(() => {/* ignore cleanup errors */});
                } catch {/* ignore */}
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const upgradeTx: IDBTransaction | null = (event.target as IDBOpenDBRequest).transaction;
                
                // API 로그 저장소
                if (!db.objectStoreNames.contains('api_logs')) {
                    const logsStore = db.createObjectStore('api_logs', { keyPath: 'id' });
                    logsStore.createIndex('timestamp', 'timestamp', { unique: false });
                    logsStore.createIndex('provider', 'provider', { unique: false });
                    logsStore.createIndex('feature', 'feature', { unique: false });
                    logsStore.createIndex('success', 'success', { unique: false });
                    logsStore.createIndex('provider_timestamp', ['provider', 'timestamp'], { unique: false });
                }
                
                // 일별 집계 저장소 (성능 최적화용)
                if (!db.objectStoreNames.contains('daily_stats')) {
                    const statsStore = db.createObjectStore('daily_stats', { keyPath: 'id' });
                    statsStore.createIndex('date', 'date', { unique: false });
                    statsStore.createIndex('provider', 'provider', { unique: false });
                    statsStore.createIndex('date_provider', ['date', 'provider'], { unique: true });
                }
                
                // 설정 저장소
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // 상위 레벨 대화 로그 저장소 (chat_logs -> conversation_logs 마이그레이션)
                if (!db.objectStoreNames.contains('conversation_logs')) {
                    // 기존 chat_logs가 있으면 데이터를 conversation_logs로 마이그레이션
                    if (db.objectStoreNames.contains('chat_logs') && upgradeTx) {
                        const oldChatStore = upgradeTx.objectStore('chat_logs');
                        const conversationStore = db.createObjectStore('conversation_logs', { keyPath: 'statsId' });
                        
                        // 인덱스 생성
                        conversationStore.createIndex('prompt', 'prompt', { unique: false });
                        conversationStore.createIndex('timestamp', 'timestamp', { unique: false });
                        
                        // 데이터 마이그레이션
                        const migrationRequest = oldChatStore.getAll();
                        migrationRequest.onsuccess = () => {
                            const allData = migrationRequest.result;
                            allData.forEach(data => {
                                try {
                                    conversationStore.add(data);
                                } catch (e) {
                                    console.warn('Failed to migrate chat log:', data.statsId, e);
                                }
                            });
                            
                            // 마이그레이션 완료 후 기존 chat_logs 삭제
                            try {
                                db.deleteObjectStore('chat_logs');
                                console.log('Successfully migrated chat_logs to conversation_logs');
                            } catch (e) {
                                console.warn('Failed to delete old chat_logs store:', e);
                            }
                        };
                        migrationRequest.onerror = () => {
                            console.error('Failed to migrate chat_logs data');
                        };
                    } else {
                        // 새로운 설치: conversation_logs만 생성
                        const conversationStore = db.createObjectStore('conversation_logs', { keyPath: 'statsId' });
                        conversationStore.createIndex('prompt', 'prompt', { unique: false });
                        conversationStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                } else if (upgradeTx) {
                    // conversation_logs가 이미 있지만 인덱스가 없을 수 있는 경우
                    const conversationStore = upgradeTx.objectStore('conversation_logs');
                    const indexNames = conversationStore.indexNames as unknown as DOMStringList;
                    if (!(indexNames as any).contains || !(indexNames as any).contains('timestamp')) {
                        try { conversationStore.createIndex('timestamp', 'timestamp', { unique: false }); } catch {}
                    }
                    if (!(indexNames as any).contains || !(indexNames as any).contains('prompt')) {
                        try { conversationStore.createIndex('prompt', 'prompt', { unique: false }); } catch {}
                    }
                }
            };
        });
    }

    /**
     * conversation_logs에 대화 데이터를 저장합니다.
     */
    async addConversation(statsId: string, prompt: string, response: string): Promise<boolean> {
        return false;
        return new Promise((resolve) => {
            if (!this.db) { resolve(false); return; }
            const tx = this.db.transaction(['conversation_logs'], 'readwrite');
            const store = tx.objectStore('conversation_logs');
            const now = Date.now();
            const req = store.put({ statsId, prompt, response_text: response, timestamp: now });
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    }

    /** 내부용: conversation_logs에서 statsId로 조회 */
    async getConversation(statsId: string): Promise<{ statsId: string; prompt: string; response_text: string; timestamp?: number } | null> {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) { resolve(null); return; }
                const tx = this.db.transaction(['conversation_logs'], 'readonly');
                const store = tx.objectStore('conversation_logs');
                const req = store.get(statsId);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * getConversationInfo(statsId)
     * - conversation_logs에서 prompt/response_text 읽기
     * - api_logs에서 requestTokens/responseTokens/model/actualModelUsed/timestamp 읽기
     * - 단일 오브젝트로 합쳐 반환
     */
    async getConversationInfo(statsId: string): Promise<{
        prompt: string;
        response: string;
        requestToken?: number;
        responseToken?: number;
        model?: string;
        actualModelUsed?: string;
        timestamp?: number; // conversation_logs timestamp
    } | null> {
        const [conversation, api] = await Promise.all([
            this.getConversation(statsId),
            this.getLog(statsId)
        ]);
        if (!conversation && !api) return null;
        return {
            prompt: conversation?.prompt ?? '',
            response: conversation?.response_text ?? '',
            requestToken: api?.requestTokens,
            responseToken: api?.responseTokens,
            model: api?.model,
            actualModelUsed: api?.actualModelUsed,
            // 요구사항: conversation_logs의 timestamp를 사용
            timestamp: conversation?.timestamp,
        };
    }

    async addLog(log: APICallLog, update: boolean = false): Promise<boolean> {
        return new Promise((resolve) => {
            const transaction = this.db!.transaction(['api_logs', 'daily_stats'], 'readwrite');
            const logsStore = transaction.objectStore('api_logs');
            const statsStore = transaction.objectStore('daily_stats');
            
            // 로그 추가
            const addRequest = update ? logsStore.put(log) : logsStore.add(log);
            
            addRequest.onsuccess = async () => {
                // 일별 통계 업데이트
                try {
                    await this.updateDailyStats(log, statsStore);
                    resolve(true);
                } catch (e) {
                    resolve(false);
                }
            };
            
            addRequest.onerror = () => resolve(false);
        });
    }

    private async updateDailyStats(log: APICallLog, statsStore: IDBObjectStore): Promise<void> {
        const date = new Date(log.timestamp).toISOString().split('T')[0];
        const statsId = `${date}-${log.provider}`;
        
        return new Promise((resolve, reject) => {
            const getRequest = statsStore.get(statsId);
            
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                
                let stats;
                if (existing) {
                    stats = {
                        ...existing,
                        totalCalls: existing.totalCalls + 1,
                        totalTokens: existing.totalTokens + (log.totalTokens || 0),
                        totalCost: existing.totalCost + (log.cost || 0),
                        latencySum: existing.latencySum + log.latency,
                        successCount: existing.successCount + (log.success ? 1 : 0),
                        features: { ...existing.features, [log.feature]: (existing.features[log.feature] || 0) + 1 }
                    };
                    stats.avgLatency = stats.latencySum / stats.totalCalls;
                    stats.successRate = (stats.successCount / stats.totalCalls) * 100;
                } else {
                    stats = {
                        id: statsId,
                        date,
                        provider: log.provider,
                        totalCalls: 1,
                        totalTokens: log.totalTokens || 0,
                        totalCost: log.cost || 0,
                        latencySum: log.latency,
                        avgLatency: log.latency,
                        successCount: log.success ? 1 : 0,
                        successRate: log.success ? 100 : 0,
                        features: { [log.feature]: 1 }
                    };
                }
                
                const putRequest = statsStore.put(stats);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async getLogs(options: {
        startDate?: Date,
        endDate?: Date,
        provider?: string,
        feature?: string,
        limit?: number,
        offset?: number
    } = {}): Promise<APICallLog[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['api_logs'], 'readonly');
            const store = transaction.objectStore('api_logs');
            
            let request: IDBRequest;
            
            if (options.startDate || options.endDate) {
                const index = store.index('timestamp');
                const range = IDBKeyRange.bound(
                    options.startDate?.getTime() || 0,
                    options.endDate?.getTime() || Date.now()
                );
                request = index.getAll(range);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => {
                let logs = request.result as APICallLog[];
                
                // 필터링
                if (options.provider) {
                    logs = logs.filter(log => log.provider === options.provider);
                }
                if (options.feature) {
                    logs = logs.filter(log => log.feature === options.feature);
                }
                
                // 정렬 (최신순)
                logs.sort((a, b) => b.timestamp - a.timestamp);
                
                // 페이지네이션
                if (options.offset || options.limit) {
                    const start = options.offset || 0;
                    const end = options.limit ? start + options.limit : undefined;
                    logs = logs.slice(start, end);
                }
                
                resolve(logs);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 단일 로그를 statsId(id)로 조회합니다.
     * @param statsId addLog 시 생성된 고유 id
     * @returns APICallLog 또는 null (없거나 에러 시)
     */
    async getLog(statsId: string): Promise<APICallLog | null> {
        return new Promise((resolve, reject) => {
            try {
                if (!this.db) {
                    resolve(null);
                    return;
                }
                const transaction = this.db.transaction(['api_logs'], 'readonly');
                const store = transaction.objectStore('api_logs');
                const request = store.get(statsId);

                request.onsuccess = () => {
                    const result = request.result as APICallLog | undefined;
                    resolve(result ?? null);
                };
                request.onerror = () => {
                    reject(request.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    async getDailyStats(days: number = 30): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['daily_stats'], 'readonly');
            const store = transaction.objectStore('daily_stats');
            const index = store.index('date');
            
            const endDate = new Date();
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - days);
            
            const range = IDBKeyRange.bound(
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            );
            
            const request = index.getAll(range);
            
            request.onsuccess = () => {
                const stats = request.result;
                
                // 일별로 그룹화
                const dailyData: Record<string, any> = {};
                
                stats.forEach(stat => {
                    if (!dailyData[stat.date]) {
                        dailyData[stat.date] = {
                            period: this.formatDate(new Date(stat.date)),
                            totalCalls: 0,
                            totalTokens: 0,
                            totalCost: 0,
                            avgLatency: 0,
                            successRate: 0,
                            providers: {},
                            features: {}
                        };
                    }
                    
                    const day = dailyData[stat.date];
                    day.totalCalls += stat.totalCalls;
                    day.totalTokens += stat.totalTokens;
                    day.totalCost += stat.totalCost;
                    day.providers[stat.provider] = (day.providers[stat.provider] || 0) + stat.totalCalls;
                    
                    // 기능별 집계
                    Object.entries(stat.features).forEach(([feature, calls]) => {
                        day.features[feature] = (day.features[feature] || 0) + calls;
                    });
                });
                
                // 평균 계산 및 정리
                const result = Object.values(dailyData).map(day => ({
                    ...day,
                    avgLatency: day.totalCalls > 0 ? day.avgLatency / day.totalCalls : 0,
                    successRate: day.totalCalls > 0 ? (day.successRate / day.totalCalls) : 100,
                    topFeatures: Object.entries(day.features)
                        .map(([feature, calls]) => ({ feature, calls: calls as number }))
                        .sort((a, b) => (b.calls as number) - (a.calls as number))
                        .slice(0, 5),
                    providerBreakdown: Object.entries(day.providers)
                        .map(([provider, calls]) => ({
                            provider,
                            calls: calls as number,
                            percentage: ((calls as number) / day.totalCalls) * 100
                        }))
                        .sort((a, b) => (b.calls as number) - (a.calls as number))
                }));
                
                resolve(result.sort((a, b) => a.period.localeCompare(b.period)));
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async getStats(): Promise<any> {
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['api_logs'], 'readonly');
            const store = transaction.objectStore('api_logs');
            const request = store.getAll();
            
            request.onsuccess = () => {
                const logs = request.result as APICallLog[];
                
                if (logs.length === 0) {
                    resolve({
                        totalLogs: 0,
                        totalCost: 0,
                        totalTokens: 0,
                        avgLatency: 0,
                        successRate: 100,
                        providers: [],
                        features: [],
                        oldestLog: null,
                        newestLog: null
                    });
                    return;
                }
                
                const totalCost = logs.reduce((sum, log) => sum + (log.cost || 0), 0);
                const totalTokens = logs.reduce((sum, log) => sum + (log.totalTokens || 0), 0);
                const avgLatency = logs.reduce((sum, log) => sum + log.latency, 0) / logs.length;
                const successCount = logs.filter(log => log.success).length;
                const successRate = (successCount / logs.length) * 100;
                
                const providers = [...new Set(logs.map(log => log.provider))];
                const features = [...new Set(logs.map(log => log.feature))];
                
                const timestamps = logs.map(log => log.timestamp);
                const oldestLog = new Date(Math.min(...timestamps));
                const newestLog = new Date(Math.max(...timestamps));
                
                resolve({
                    totalLogs: logs.length,
                    totalCost,
                    totalTokens,
                    avgLatency,
                    successRate,
                    providers,
                    features,
                    oldestLog,
                    newestLog
                });
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async exportData(): Promise<string> {
        const logs = await this.getLogs();
        return JSON.stringify(logs, null, 2);
    }

    async importData(jsonData: string): Promise<number> {
        const logs = JSON.parse(jsonData) as APICallLog[];
        let imported = 0;
        
        for (const log of logs) {
            try {
                await this.addLog(log);
                imported++;
            } catch (error) {
                console.warn('Failed to import log:', log.id, error);
            }
        }
        
        return imported;
    }

    /**
     * api_logs에서 days일 이전의 항목을 삭제합니다.
     */
    async clearOldAPILogs(days: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['api_logs'], 'readwrite');
            const store = transaction.objectStore('api_logs');
            const index = store.index('timestamp');
            
            const range = IDBKeyRange.upperBound(cutoffDate.getTime());
            const request = index.openCursor(range);
            
            let deleted = 0;
            
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    cursor.delete();
                    deleted++;
                    cursor.continue();
                } else {
                    resolve(deleted);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * conversation_logs에서 days일 이전의 항목을 삭제합니다.
     * conversation_logs.timestamp 인덱스를 사용하며, 없을 경우 전체 순회를 통해 삭제합니다.
     */
    async clearOldConversationLogs(days: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        return new Promise((resolve, reject) => {
            if (!this.db) { resolve(0); return; }
            const transaction = this.db.transaction(['conversation_logs'], 'readwrite');
            const store = transaction.objectStore('conversation_logs');

            let deleted = 0;

            // 인덱스가 있으면 활용
            let request: IDBRequest<IDBCursorWithValue | null>;
            try {
                const index = store.index('timestamp');
                const range = IDBKeyRange.upperBound(cutoffDate.getTime());
                request = index.openCursor(range);
            } catch {
                // 인덱스가 없는 경우 전체 순회
                request = store.openCursor();
            }

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
                if (cursor) {
                    const value = cursor.value as { timestamp?: number };
                    if (!value.timestamp || value.timestamp <= cutoffDate.getTime()) {
                        cursor.delete();
                        deleted++;
                    }
                    cursor.continue();
                } else {
                    resolve(deleted);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    private formatDate(date: Date): string {
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    async deleteIf(predicate: (log: APICallLog) => boolean): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database is not initialized.'));
                return;
            }
            const transaction = this.db.transaction(['api_logs'], 'readwrite');
            const store = transaction.objectStore('api_logs');
            const getAllRequest = store.getAll();
            let deleted = 0;
    
            getAllRequest.onsuccess = () => {
                const logs = getAllRequest.result as APICallLog[];
                const toDelete = logs.filter(predicate);
                if (toDelete.length === 0) {
                    resolve(0);
                    return;
                }
                let processed = 0;
                toDelete.forEach(log => {
                    const deleteRequest = store.delete(log.id);
                    deleteRequest.onsuccess = () => {
                        deleted++;
                        processed++;
                        if (processed === toDelete.length) {
                            resolve(deleted);
                        }
                    };
                    deleteRequest.onerror = () => {
                        processed++;
                        if (processed === toDelete.length) {
                            resolve(deleted);
                        }
                    };
                });
            };
            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }
}

// API 클라이언트 (IndexedDB 연동)
export class TrackedAPIClient {
    private dbManager: IndexedDBManager;
    private sessionId: string;
    private startTime: number;
    private plugin: SummarPlugin;

    constructor(plugin: SummarPlugin) {
        this.plugin = plugin;
        this.dbManager = plugin.dbManager;
        this.sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        this.startTime = Date.now();
    }

    /**
     * 대화 상위 로그를 저장합니다. (conversation_logs)
     */
    async logConversation(statsId: string, prompt: string, response: string): Promise<boolean> {
        try {
            return await this.dbManager.addConversation(statsId, prompt, response);
        } catch (e) {
            console.error('Failed to save conversation to IndexedDB:', e);
            return false;
        }
    }

    start() {
        this.startTime = Date.now();
    }
    getLatency() : number {
        return Date.now() - this.startTime;
    }

    async fixDB() : Promise<number> {
        const fixed = await this.recalcCost(log => semver.lt(log.version, this.dbManager.version));
        SummarDebug.log(1, `TrackedAPIClient.fixDB(): ${fixed} fixed.`)
        return fixed;
    }

    /**
     * loadAPICall()
     * - provider: string;
     * - model: string;
     * - endpoint: string;
     * - feature: string;
     * - requestData: any;
     * - responseData: any;
     * - success?: boolean;
     * - errorMessage?: string;
     * - duration?: number;
     */
    async logAPICall(
        { provider, model, endpoint, feature, requestData, responseData, success=true, errorMessage = '', duration = -1}:
        { 
            provider: string;
            model: string;
            endpoint: string;
            feature: string;
            requestData: any;
            responseData: any;
            success?: boolean;
            errorMessage?: string;
            duration?: number;
        }
    ): Promise<string | null> {
// if (this.plugin.settings.debugLevel < 1) {
//     return;
// }

        let requestSize: number;
        if (requestData instanceof ArrayBuffer) {
            requestSize = requestData.byteLength;
        } else if (requestData instanceof Uint8Array) {
            requestSize = requestData.byteLength;
        } else {
            requestSize = new Blob([JSON.stringify(requestData)]).size;
        }

        const responseSize = responseData ? new Blob([JSON.stringify(responseData)]).size : 0;
        const latency = this.getLatency();
        const now = Date.now();

        const logEntry: APICallLog = {
            id: crypto.randomUUID(),
            timestamp: now,
            timestampISO: new Date(now).toISOString(),
            provider: provider as any,
            model,
            endpoint,
            feature,
            
            requestSize,
            responseSize,
            duration,
            
            latency,
            success,
            errorMessage: errorMessage,
            
            sessionId: this.sessionId,
            userAgent: `Obsidian-Summar/${this.plugin.manifest.version}`,
            version: this.dbManager.version,//'1.0.0',
            
            ...this.parseUsageData(provider, responseData, feature, model, duration)
        };

        try {
            const ok = await this.dbManager.addLog(logEntry);
            return ok ? logEntry.id : null;
        } catch (error) {
            console.error('Failed to save log to IndexedDB:', error);
            return null;
        }
    }

    private parseUsageData(provider: string, responseData: any, feature: string, model: string = '', duration: number = -1): any {
        if (!responseData) return {};

        if (provider === 'openai') {
            if (feature === 'stt') {
                return {
                    requestTokens: 0,
                    responseTokens: 0,
                    cost : this.calculateOpenAIAudioTranscriptionCost(model || '', duration) 
                };
            } else if (responseData.usage) {
                return {
                    requestTokens: responseData.usage.prompt_tokens,
                    responseTokens: responseData.usage.completion_tokens,
                    totalTokens: responseData.usage.total_tokens,
                    actualModelUsed: responseData.model,
                    cost: this.calculateOpenAICost(model || '', responseData.usage)
                };
            }
        }

        if (provider === 'gemini' && responseData.usageMetadata) {
            return {
                requestTokens: responseData.usageMetadata.promptTokenCount,
                responseTokens: responseData.usageMetadata.candidatesTokenCount,
                totalTokens: responseData.usageMetadata.totalTokenCount,
                actualModelUsed: responseData.modelVersion,
                cost: this.calculateGeminiCost(model, 
                    { 
                        promptTokenCount: responseData.usageMetadata.promptTokenCount,
                        candidatesTokenCount: responseData.usageMetadata.candidatesTokenCount
                    }, 
                    (feature === 'stt'))
            };
        }

        return {};
    }

    calculateOpenAICost(model: string, usage: any): number {
        // 모델명 정규화
        const m = model.toLowerCase();

        const pricing = this.plugin.modelPricing?.openai ?? {};
        // const matchedKey = Object.keys(pricing).find(key => m.includes(key.toLowerCase())) ?? '';
        const matchedKey = Object.keys(pricing).find(key => key.toLowerCase() === m) ?? '';
        const price = pricing[matchedKey] ?? { inputPerK: 0, outputPerK: 0 };

SummarDebug.log(3, `model: ${m}, matched: ${matchedKey}, inputPerK: ${price.inputPerK}, outputPerK: ${price.outputPerK}`);
        if (m.includes('whisper') || m.includes('transcribe')) return 0;
        return (usage.prompt_tokens * price.inputPerK / 1000) + (usage.completion_tokens * price.outputPerK / 1000);
    }

    calculateOpenAIAudioTranscriptionCost(model: string, duration: number): number {
        const m = model.toLowerCase();
        const pricing = this.plugin.modelPricing?.openai ?? {};
        const matchedKey = Object.keys(pricing).find(key => key.toLowerCase() === m) ?? '';
        const pricePerMinute = pricing[matchedKey]?.inputPerMinute ?? 0;
        // SummarDebug.log(3, `calculateOpenAIAudioTranscriptionCost()\nModel: ${model}, Duration: ${duration}, Price per minute: ${pricePerMinute}, Matched Key: ${matchedKey}`);
        // SummarDebug.log(3, `Pricing: ${JSON.stringify(pricing)}`);

        return (duration / 60) * pricePerMinute;
    }

    calculateGeminiCost(
        model: string,
        usage: {
            promptTokenCount: number;
            candidatesTokenCount: number;
        },
        sttFlag: boolean
    ): number {
        const m = (model || '').toLowerCase();
        const promptTokens = usage.promptTokenCount || 0;
        const completionTokens = usage.candidatesTokenCount || 0;

        const pricing = this.plugin.modelPricing?.gemini ?? {};
        let inputPerK = 0, outputPerK = 0;

        // 모델 매칭
        const matchedKey = Object.keys(pricing).find(key => key.toLowerCase() === m) ?? '';
        const modelPricing = pricing[matchedKey];

        // 계층형 가격 모델 여부를 JSON 구조로 판단 (under200k/over200k 키 존재 여부)
        const isTieredModel = modelPricing?.under200k !== undefined && modelPricing?.over200k !== undefined;

        if (isTieredModel) {
            const tier = promptTokens > 200_000
                ? modelPricing.over200k
                : modelPricing.under200k;
            inputPerK = tier?.inputPerK ?? 0;
            outputPerK = tier?.outputPerK ?? 0;
        } else {
            const tier = modelPricing ?? { inputPerK: 0, outputPerK: 0, audioPerK: 0 };
            inputPerK = (sttFlag === true) ? tier.audioPerK : tier.inputPerK;
            outputPerK = tier.outputPerK;
        }


        return (promptTokens * inputPerK) / 1000 + (completionTokens * outputPerK) / 1000;

    }

    private extractGeminiModel(endpoint: string): string {
        const match = endpoint.match(/models\/([^:\/]+)/);
        return match ? match[1] : 'unknown';
    }

    async logAPICallTest(days: number, count: number) {
        // feature-model 매핑
        const modelFeatureMap = {
            webModel: ['web'],
            pdfModel: ['pdf'],
            sttModel: ['stt'],
            transcriptSummaryModel: ['stt-summary', 'stt-refine'],
            customModel: ['custom', 'conversation']
        };
        const modelList = this.plugin.modelsJson?.model_list || {};

        // SummarDebug.log(1, "modelList in logAPICallTest:\n", JSON.stringify(modelList));

        // feature별 모델 목록 생성
        const featureModels: Record<string, string[]> = {};
        Object.entries(modelFeatureMap).forEach(([modelKey, features]) => {
            const modelsObj = modelList[modelKey]?.models || {};
            const models = Object.keys(modelsObj);
            features.forEach(f => {
                featureModels[f] = models;
            });
        });
        const features = Object.keys(featureModels);
        const now = Date.now();
        const oneYear = days * 24 * 60 * 60 * 1000;
        function randomStr(len: number) {
            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let s = '';
            for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
            return s;
        }
        for (let i = 0; i < count; i++) {
            // 날짜 랜덤
            const timestamp = now - Math.floor(Math.random() * oneYear);
            const timestampISO = new Date(timestamp).toISOString();
            // feature 랜덤
            const feature = features[Math.floor(Math.random() * features.length)];
            const models = featureModels[feature] || [];
            if (models.length === 0) continue; // 모델 없으면 skip
            // 모델 랜덤
            const model = models[Math.floor(Math.random() * models.length)];
            const actualModelUsed = '';
            // provider 추정
            let provider: 'openai' | 'gemini' = 'openai';
            if (model.startsWith('gemini')) provider = 'gemini';
            else if (model.startsWith('gpt') || model.startsWith('o') || model.startsWith('whisper')) provider = 'openai';
            // 기타 값 랜덤
            const requestSize = 100 + Math.floor(Math.random() * 101);
            const responseSize = 100 + Math.floor(Math.random() * 101);
            const latency = 1000 + Math.floor(Math.random() * 3001);
            const success = Math.random() < 0.8;
            const errorMessage = success ? undefined : 'Error occurred: ' + randomStr(8);
            const sessionId = randomStr(10 + Math.floor(Math.random() * 11));
            const userAgent = `Obsidian-Summar-LogTest/${this.plugin.manifest?.version ?? '1.0.0'}`;
            const version = this.dbManager.version; //'1.0.0';
            const requestTokens = 100 + Math.floor(Math.random() * 100);
            const responseTokens = 100 + Math.floor(Math.random() * 100);
            const totalTokens = requestTokens + responseTokens;
            let duration: number;
            // if (provider === 'openai' && feature === 'stt') {
            if (feature === 'stt') {
                duration = (10000 + Math.floor(Math.random() * 91000))/1000; // 10~100
            } else {
                duration = -1;
            }
            // const cost = Math.random() * 0.003;
            let cost = 0;
            if (provider==='openai') {
                if (feature==='stt') {
                    cost = this.calculateOpenAIAudioTranscriptionCost(
                        model, duration
                    )
                } else {
                    cost = this.calculateOpenAICost(
                        model, 
                        { 
                            prompt_tokens: requestTokens,
                            completion_tokens: responseTokens,
                            totalTokens: totalTokens,
                        }
                    );
                }
            } else if (provider==='gemini'){
                cost = this.calculateGeminiCost(
                    model,
                    {
                        promptTokenCount: requestTokens,
                        candidatesTokenCount: responseTokens,
                    },
                    (feature==='stt')
                );
            }
            let endpoint = 'test';
            if (provider === 'gemini') {
                endpoint = 'generateContent';
            } else if (provider === 'openai') { 
                if (feature === 'stt') {
                    endpoint = 'audio/transcription';
                } else {
                    endpoint = 'chat/completions';
                }
            }
            const log = {
                id: crypto.randomUUID(),
                timestamp,
                timestampISO,
                provider,
                model,
                actualModelUsed,
                endpoint,
                feature,
                requestSize,
                responseSize,
                requestTokens,
                responseTokens,
                totalTokens,
                duration,
                cost,//: Number(cost.toFixed(6)),
                latency,
                success,
                errorMessage,
                sessionId,
                userAgent,
                version
            };
            await this.dbManager.addLog(log);
        }
    }

    /**
     * DB의 로그 중 조건에 맞는 것만 cost를 재계산하고, 변경된 경우 업데이트합니다.
     * @param predicate 재계산할 log를 선택하는 함수 (true 반환 시 재계산)
     * @returns 업데이트된 row 개수
     * 사용 예시:
     *   - 모든 log 재계산: await recalcCost(() => true)
     *   - 특정 조건만: await recalcCost(log => log.version < '1.0.2')
     */
    async recalcCost(predicate: (log: APICallLog) => boolean = () => true): Promise<number> {
        const logs = await this.dbManager.getLogs();
        let updated = 0;
        let condition = 0;
        for (const log of logs) {
            if (!predicate(log)) continue;
            let newCost = log.cost ?? 0;
            if (log.provider === 'openai' && log.feature === 'stt') {
                newCost = this.calculateOpenAIAudioTranscriptionCost(log.model, log.duration ?? 0) ?? log.cost ?? 0;
            } else if (log.provider === 'openai' && log.requestTokens !== undefined && log.responseTokens !== undefined) {
                const usage = {
                    prompt_tokens: log.requestTokens ?? 0,
                    completion_tokens: log.responseTokens ?? 0,
                    totalTokens: log.totalTokens ?? 0
                };
                newCost = this.calculateOpenAICost(log.model, usage) ?? log.cost ?? 0;
            } else if (log.provider === 'gemini' && log.totalTokens !== undefined) {
                const usage = {
                    promptTokenCount: log.requestTokens ?? 0,
                    candidatesTokenCount: log.responseTokens ?? 0,
                };
                newCost = this.calculateGeminiCost(
                    log.model, 
                    {
                        promptTokenCount: usage.promptTokenCount,
                        candidatesTokenCount: usage.candidatesTokenCount,
                    }, (log.feature === 'stt')
                ) ?? log.cost ?? 0;
            }
            if (log.cost !== newCost) {
                SummarDebug.log(3, `recalcCost()\noldcost: ${log.cost}, newcost: ${newCost}, provider: ${log.provider}, feature: ${log.feature}`);
                updated++;
            }
            if ((log.cost !== newCost) || (log.version !== this.dbManager.version))
            {
                log.cost = newCost;
                log.version = this.dbManager.version;
                condition++;
                await this.dbManager.addLog(log, true); // addLog는 기존 id면 update
            }
        }
        SummarDebug.log(3, `TrackedAPIClient.recalcCost(): ${condition} rows updated`)
        return updated;
    }

    async deleteTestLog(): Promise<number> {
        return this.dbManager.deleteIf(
            log => (log.endpoint === 'test' || (!!log.userAgent && log.userAgent.includes('Obsidian-Summar-LogTest')))
        );    
    }
}
