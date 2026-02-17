import { CalendarHandler } from '../../src/calendarhandler';
import SummarPlugin from '../../src/main';
import { SummarDebug } from '../../src/globals';

// Mock modules
jest.mock('../../src/globals', () => ({
    SummarDebug: {
        log: jest.fn(),
        error: jest.fn(),
        Notice: jest.fn(() => ({ 
            hide: jest.fn(),
            setMessage: jest.fn(),
            noticeEl: {
                createEl: jest.fn((type, options, callback) => {
                    const mockEl = { onclick: null, style: {} };
                    if (callback) callback(mockEl);
                    return mockEl;
                })
            }
        }))
    }
}));

// Mock child_process
const mockSpawn = jest.fn();
const mockExec = jest.fn();
jest.mock('child_process', () => ({
    spawn: jest.fn().mockImplementation((...args) => mockSpawn(...args)),
    exec: jest.fn().mockImplementation((cmd, callback) => {
        // Provide default behavior for 'which swift' command
        if (cmd === 'which swift') {
            callback(null, '/usr/bin/swift', '');
        } else {
            callback(null, 'command output', '');
        }
    })
}));

// Mock promisify
const mockExecAsync = jest.fn();
jest.mock('util', () => ({
    promisify: jest.fn(() => mockExecAsync)
}));

// Mock fs
jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    truncate: jest.fn()
}));

// Mock obsidian
jest.mock('obsidian', () => ({
    Platform: {
        isMacOS: true,
        isDesktopApp: true
    },
    normalizePath: jest.fn((path) => path),
    FileSystemAdapter: jest.fn()
}));

describe('CalendarHandler', () => {
    let calendarHandler: CalendarHandler;
    let mockPlugin: jest.Mocked<SummarPlugin>;
    let mockProcess: any;

    beforeAll(() => {
        // Setup global DOM for all tests
        const mockCreateElement = jest.fn(() => ({
            classList: {
                add: jest.fn(),
                remove: jest.fn()
            },
            innerHTML: '',
            querySelector: jest.fn().mockReturnValue({
                addEventListener: jest.fn()
            })
        }));
        
        global.document = {
            createElement: mockCreateElement
        } as any;
    });

    beforeEach(() => {
        // Mock plugin with necessary properties
        mockPlugin = {
            app: {
                vault: {
                    adapter: {
                        getBasePath: jest.fn(() => '/mock/base/path')
                    }
                }
            },
            settingsv2: {
                schedule: {
                    calendar_polling_interval: 600000,
                    calendarName: ['Test Calendar'],
                    calendar_fetchdays: 7,
                    autoLaunchVideoMeetingOnSchedule: true,
                    autoLaunchVideoMeetingOnlyAccepted: false
                }
            },
            reservedStatus: {
                setStatusbarIcon: jest.fn(),
                update: jest.fn()
            },
            recordingManager: {
                getRecorderState: jest.fn(() => 'idle')
            }
        } as any;

        // Mock process object for spawn
        mockProcess = {
            stdout: {
                on: jest.fn()
            },
            stderr: {
                on: jest.fn()
            },
            on: jest.fn()
        };

        mockSpawn.mockReturnValue(mockProcess);
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Constructor and Initialization', () => {
        test('should create CalendarHandler instance', () => {
            calendarHandler = new CalendarHandler(mockPlugin);
            expect(calendarHandler).toBeInstanceOf(CalendarHandler);
        });

        test('should store plugin reference', () => {
            calendarHandler = new CalendarHandler(mockPlugin);
            expect((calendarHandler as any).plugin).toBe(mockPlugin);
        });
    });

    describe('Swift Environment Checks', () => {
        beforeEach(() => {
            calendarHandler = new CalendarHandler(mockPlugin);
        });

        test('should check if Swift is installed', async () => {
            const { exec } = require('child_process');
            (exec as jest.Mock).mockImplementation((cmd: string, callback: Function) => {
                if (cmd === 'which swift') {
                    callback(null, '/usr/bin/swift', '');
                }
            });

            const result = await (calendarHandler as any).checkSwiftInstalled();
            expect(result).toBe(true);
        });

        test('should handle Swift not installed', async () => {
            const { exec } = require('child_process');
            (exec as jest.Mock).mockImplementation((cmd: string, callback: Function) => {
                if (cmd === 'which swift') {
                    callback(new Error('command not found'), '', 'command not found');
                }
            });

            const result = await (calendarHandler as any).checkSwiftInstalled();
            expect(result).toBe(false);
        });

        test('should check Swift environment', async () => {
            const checkSwiftInstalledSpy = jest.spyOn(calendarHandler as any, 'checkSwiftInstalled').mockResolvedValue(true);
            mockExec.mockImplementation((cmd, callback) => {
                callback(null, { stdout: 'Environment check passed' });
            });

            await (calendarHandler as any).checkSwiftEnvironment();
            expect(checkSwiftInstalledSpy).toHaveBeenCalled();
        });
    });

    describe('Zoom Meeting Fetching', () => {
        beforeEach(() => {
            calendarHandler = new CalendarHandler(mockPlugin);
            // Mock checkSwiftInstalled to return true for most tests
            jest.spyOn(calendarHandler as any, 'checkSwiftInstalled').mockResolvedValue(true);
        });

        test('should fetch zoom meetings successfully', async () => {
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler, 'checkSwiftInstalled').mockResolvedValue(true);
            
            // Mock the execAsync for swift --version check
            mockExecAsync.mockResolvedValue({ stdout: 'Swift version', stderr: '' });
            
            const mockMeetings = [
                {
                    title: 'Test Meeting',
                    start: '2024-01-01T10:00:00Z',
                    end: '2024-01-01T11:00:00Z',
                    description: 'Test meeting description',
                    location: 'Online',
                    zoom_link: 'https://zoom.us/j/123456789',
                    attendees: ['test@example.com'],
                    participant_status: 'accepted'
                }
            ];

            // Setup spawn mock to simulate successful execution
            mockSpawn.mockReturnValue({
                stdout: {
                    on: jest.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from(JSON.stringify(mockMeetings)));
                        }
                    })
                },
                stderr: {
                    on: jest.fn()
                },
                on: jest.fn((event, callback) => {
                    if (event === 'close') {
                        callback(0); // Exit code 0 = success
                    }
                })
            });

            const meetings = await calendarHandler.fetchZoomMeetings();
            expect(meetings).toEqual(mockMeetings);
            expect(SummarDebug.Notice).toHaveBeenCalledWith(1, "Successfully fetched calendar information.");
        });

        test('should handle JSON parsing error', async () => {
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler, 'checkSwiftInstalled').mockResolvedValue(true);
            
            // Mock the execAsync for swift --version check
            mockExecAsync.mockResolvedValue({ stdout: 'Swift version', stderr: '' });
            
            mockSpawn.mockReturnValue({
                stdout: {
                    on: jest.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('invalid json'));
                        }
                    })
                },
                stderr: {
                    on: jest.fn()
                },
                on: jest.fn((event, callback) => {
                    if (event === 'close') {
                        callback(0);
                    }
                })
            });

            await expect(calendarHandler.fetchZoomMeetings()).rejects.toThrow('Failed to parse Swift output as JSON');
            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'JSON Parsing Error:', expect.any(Error));
        });

        test('should handle Swift execution error', async () => {
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler, 'checkSwiftInstalled').mockResolvedValue(true);
            
            // Mock the execAsync for swift --version check
            mockExecAsync.mockResolvedValue({ stdout: 'Swift version', stderr: '' });
            
            mockSpawn.mockReturnValue({
                stdout: {
                    on: jest.fn()
                },
                stderr: {
                    on: jest.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('Swift error'));
                        }
                    })
                },
                on: jest.fn((event, callback) => {
                    if (event === 'close') {
                        callback(1); // Exit code 1 = error
                    }
                })
            });

            await expect(calendarHandler.fetchZoomMeetings()).rejects.toThrow('Swift script execution failed');
            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Swift Execution Error:', 'Swift error');
        });

        test('should skip fetching when no calendar configured', async () => {
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler, 'checkSwiftInstalled').mockResolvedValue(true);
            
            // Mock the execAsync for swift --version check
            mockExecAsync.mockResolvedValue({ stdout: 'Swift version', stderr: '' });
            
            mockPlugin.settingsv2.schedule.calendarName = [];
            
            const meetings = await calendarHandler.fetchZoomMeetings();
            expect(meetings).toEqual([]);
            expect(SummarDebug.log).toHaveBeenCalledWith(1, "캘린더가 설정되지 않아 fetchZoomMeetings를 실행하지 않습니다.");
        });

        test('should skip fetching when calendar list is empty', async () => {
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler, 'checkSwiftInstalled').mockResolvedValue(true);
            
            // Mock the execAsync for swift --version check
            mockExecAsync.mockResolvedValue({ stdout: 'Swift version', stderr: '' });
            
            mockPlugin.settingsv2.schedule.calendarName = ['', '  '];
            
            const meetings = await calendarHandler.fetchZoomMeetings();
            expect(meetings).toEqual([]);
            expect(SummarDebug.log).toHaveBeenCalledWith(1, "캘린더 목록이 비어 있어 fetchZoomMeetings를 실행하지 않습니다.");
        });
    });

    describe('Scheduled Meetings Update', () => {
        beforeEach(() => {
            calendarHandler = new CalendarHandler(mockPlugin);
            jest.useFakeTimers();
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler as any, 'checkSwiftInstalled').mockResolvedValue(true);
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should update scheduled meetings and set timers', async () => {
            const futureTime = new Date(Date.now() + 300000); // 5 minutes from now
            const mockMeetings = [
                {
                    title: 'Test Meeting',
                    start: futureTime.toISOString(),
                    end: new Date(Date.now() + 3600000).toISOString(),
                    description: 'Test meeting description',
                    location: 'Online',
                    zoom_link: 'https://zoom.us/j/123456789',
                    attendees: ['test@example.com'],
                    participant_status: 'accepted'
                }
            ];

            jest.spyOn(calendarHandler, 'fetchZoomMeetings').mockResolvedValue(mockMeetings);
            jest.spyOn(calendarHandler, 'launchZoomMeeting').mockResolvedValue();

            await calendarHandler.updateScheduledMeetings();

            expect(SummarDebug.log).toHaveBeenCalledWith(1, '📅 Event 1: Test Meeting');
            // The start time is converted to Date object, so we need to match that
            expect(SummarDebug.log).toHaveBeenCalledWith(1, expect.stringContaining('🚀 Zoom meeting reserved:'));
            expect(SummarDebug.log).toHaveBeenCalledWith(1, expect.stringContaining('(Status: accepted)'));
        });

        test('should skip meetings based on participant status when autoLaunchVideoMeetingOnlyAccepted is true', async () => {
            mockPlugin.settingsv2.schedule.autoLaunchVideoMeetingOnlyAccepted = true;
            
            const declinedTime = new Date(Date.now() + 300000);
            const pendingTime = new Date(Date.now() + 600000);
            const mockMeetings = [
                {
                    title: 'Declined Meeting',
                    start: declinedTime.toISOString(),
                    end: new Date(Date.now() + 3600000).toISOString(),
                    description: 'Declined meeting description',
                    location: 'Online',
                    zoom_link: 'https://zoom.us/j/123456789',
                    attendees: ['test@example.com'],
                    participant_status: 'declined'
                },
                {
                    title: 'Pending Meeting',
                    start: pendingTime.toISOString(),
                    end: new Date(Date.now() + 3900000).toISOString(),
                    description: 'Pending meeting description',
                    location: 'Online',
                    zoom_link: 'https://zoom.us/j/987654321',
                    attendees: ['test2@example.com'],
                    participant_status: 'pending'
                }
            ];

            jest.spyOn(calendarHandler, 'fetchZoomMeetings').mockResolvedValue(mockMeetings);

            await calendarHandler.updateScheduledMeetings();

            expect(SummarDebug.log).toHaveBeenCalledWith(1, expect.stringContaining('❌ Zoom meeting skipped (declined):'));
            expect(SummarDebug.log).toHaveBeenCalledWith(1, expect.stringContaining('⏸️ Zoom meeting skipped (pending response):'));
        });

        test('should handle fetchZoomMeetings error', async () => {
            jest.spyOn(calendarHandler, 'fetchZoomMeetings').mockRejectedValue(new Error('Fetch error'));

            await calendarHandler.updateScheduledMeetings();

            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Error fetching Zoom meetings:', expect.any(Error));
        });
    });

    describe('Zoom Meeting Launch', () => {
        beforeEach(() => {
            calendarHandler = new CalendarHandler(mockPlugin);
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler as any, 'checkSwiftInstalled').mockResolvedValue(true);
        });

        test('should launch zoom meeting on macOS', async () => {
            const zoomUrl = 'https://zoom.us/j/123456789';
            
            // Clear and mock execAsync for successful launch
            mockExecAsync.mockClear();
            mockExecAsync.mockResolvedValue({ stdout: 'Meeting launched', stderr: '' });

            await calendarHandler.launchZoomMeeting(zoomUrl);

            expect(mockExecAsync).toHaveBeenCalledWith(`open "${zoomUrl}"`);
            expect(SummarDebug.log).toHaveBeenCalledWith(1, `Launching Zoom meeting: ${zoomUrl}`);
        });

        test('should handle zoom launch error', async () => {
            const zoomUrl = 'https://zoom.us/j/123456789';
            
            // Clear and mock execAsync to throw error  
            mockExecAsync.mockClear();
            mockExecAsync.mockRejectedValue(new Error('Launch failed'));

            // The method doesn't throw, but logs the error
            await calendarHandler.launchZoomMeeting(zoomUrl);
            
            expect(SummarDebug.error).toHaveBeenCalledWith(1, 'Failed to launch Zoom meeting:', expect.any(Error));
        });
    });

    describe('Available Calendars', () => {
        beforeEach(() => {
            calendarHandler = new CalendarHandler(mockPlugin);
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler as any, 'checkSwiftInstalled').mockResolvedValue(true);
        });

        test('should get available calendars successfully', async () => {
            const mockCalendars = ['Work Calendar', 'Personal Calendar'];
            
            mockSpawn.mockReturnValue({
                stdout: {
                    on: jest.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from(JSON.stringify(mockCalendars)));
                        }
                    })
                },
                stderr: {
                    on: jest.fn()
                },
                on: jest.fn((event, callback) => {
                    if (event === 'close') {
                        callback(0);
                    }
                })
            });

            const calendars = await calendarHandler.getAvailableCalendars();
            expect(calendars).toEqual(mockCalendars);
        });

        test('should handle permission denied for calendars', async () => {
            mockSpawn.mockReturnValue({
                stdout: {
                    on: jest.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('-1'));
                        }
                    })
                },
                stderr: {
                    on: jest.fn()
                },
                on: jest.fn((event, callback) => {
                    if (event === 'close') {
                        callback(0);
                    }
                })
            });

            const calendars = await calendarHandler.getAvailableCalendars();
            expect(calendars).toBeNull();
        });

        test('should handle empty calendar list', async () => {
            mockSpawn.mockReturnValue({
                stdout: {
                    on: jest.fn((event, callback) => {
                        if (event === 'data') {
                            callback(Buffer.from('[]'));
                        }
                    })
                },
                stderr: {
                    on: jest.fn()
                },
                on: jest.fn((event, callback) => {
                    if (event === 'close') {
                        callback(0);
                    }
                })
            });

            const calendars = await calendarHandler.getAvailableCalendars();
            expect(calendars).toEqual([]);
            expect(SummarDebug.log).toHaveBeenCalledWith(1, '[Calendar] Calendar list is empty.');
        });
    });

    describe('Event Display', () => {
        beforeEach(() => {
            calendarHandler = new CalendarHandler(mockPlugin);
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler as any, 'checkSwiftInstalled').mockResolvedValue(true);
        });

        test('should create event element with correct status', () => {
            const mockEvent = {
                title: 'Test Meeting',
                start: new Date('2024-01-01T10:00:00Z'),
                end: new Date('2024-01-01T11:00:00Z'),
                zoom_link: 'https://zoom.us/j/123456789',
                participant_status: 'accepted'
            };
            
            const element = calendarHandler.createEventElement(mockEvent, 0);

            // Verify that the function executed successfully and returned an element
            expect(element).toBeDefined();
            expect(element).toHaveProperty('innerHTML');
        });

        test('should handle different participant statuses', () => {
            const statuses = ['declined', 'tentative', 'pending', 'organizer'];

            statuses.forEach((status, index) => {
                const mockEvent = {
                    title: 'Test Meeting',
                    start: new Date('2024-01-01T10:00:00Z'),
                    end: new Date('2024-01-01T11:00:00Z'),
                    zoom_link: 'https://zoom.us/j/123456789',
                    participant_status: status
                };

                const element = calendarHandler.createEventElement(mockEvent, index);
                
                // Verify that the function executed successfully
                expect(element).toBeDefined();
            });
        });
    });

    describe('Cleanup', () => {
        beforeEach(() => {
            calendarHandler = new CalendarHandler(mockPlugin);
            // Mock checkSwiftInstalled to return true
            jest.spyOn(calendarHandler as any, 'checkSwiftInstalled').mockResolvedValue(true);
        });

        test('should clean up timers when updating scheduled meetings', async () => {
            // Add some mock timers
            const timer1 = setTimeout(() => {}, 1000);
            const timer2 = setTimeout(() => {}, 2000);
            (calendarHandler as any).timers.set(Date.now(), timer1);
            (calendarHandler as any).timers.set(Date.now() + 1000, timer2);

            jest.spyOn(calendarHandler, 'fetchZoomMeetings').mockResolvedValue([]);

            await calendarHandler.updateScheduledMeetings();

            expect((calendarHandler as any).timers.size).toBe(0);
            expect(SummarDebug.log).toHaveBeenCalledWith(expect.any(Number), expect.stringContaining('Timer for'));
        });
    });
});