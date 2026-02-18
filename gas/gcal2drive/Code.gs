// ============================================================
// Google Calendar to Google Drive Sync
// Purpose: Sync selected calendar events to Google Drive as JSON
// ============================================================

// ============================================================
// 1. Web App Entry Point
// ============================================================
function doGet(e) {
  // Extract URL parameters from Summar
  const params = e.parameter || {};
  const props = PropertiesService.getUserProperties();

  // Priority: 1. URL params → 2. User Properties → 3. Default values
  const filePath = params.filePath || props.getProperty('LAST_FILE_PATH') || 'Summar/calendar/events.json';
  const intervalRaw = parseInt(params.interval) || parseInt(props.getProperty('LAST_INTERVAL')) || 15;
  const vaultName = params.vaultName || '';

  // Google Apps Script everyMinutes() only supports 1, 5, 10, 15, 30
  const validIntervals = [1, 5, 10, 15, 30];
  const interval = validIntervals.reduce((prev, curr) => {
    return Math.abs(curr - intervalRaw) < Math.abs(prev - intervalRaw) ? curr : prev;
  });

  // Store in cache for Settings.html to access (5 min expiration)
  const cache = CacheService.getUserCache();
  cache.put('INIT_FILE_PATH', filePath, 300);
  cache.put('INIT_INTERVAL', String(interval), 300);
  cache.put('INIT_VAULT_NAME', vaultName, 300);

  return HtmlService.createHtmlOutputFromFile('Settings')
    .setTitle('Google Calendar Sync Settings')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// 2. Main Sync Function (Called by triggers)
// ============================================================
function syncEventsToDrive() {
  try {
    const props = PropertiesService.getUserProperties();

    // Read last configuration from Properties
    const filePath = props.getProperty('LAST_FILE_PATH');
    const interval = parseInt(props.getProperty('LAST_INTERVAL')) || 15;
    const vaultCalendars = JSON.parse(props.getProperty('VAULT_CALENDARS') || '{}');
    const vaultCalendarsInfo = JSON.parse(props.getProperty('VAULT_CALENDARS_INFO') || '{}');

    if (!filePath || Object.keys(vaultCalendars).length === 0) {
      console.log('[ERROR] Missing configuration. Please configure via web app.');
      return;
    }

    // Calculate time range (interval minutes ago ~ 24 hours later)
    const now = new Date();
    const startTime = new Date(now.getTime() - interval * 60 * 1000);
    const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const totalVaults = Object.keys(vaultCalendars).length;
    console.log(`[RUN] Syncing ${totalVaults} vault(s): ${Utilities.formatDate(now, "GMT", "yyyy-MM-dd HH:mm:ss")} (window=${interval}m ago ~ +24h)`);

    // Build per-vault events
    const vaultsOutput = {};

    Object.entries(vaultCalendars).forEach(([vaultName, calendarIds]) => {
      const calendarInfo = vaultCalendarsInfo[vaultName] || [];
      const events = [];

      calendarIds.forEach(calId => {
        const calendar = CalendarApp.getCalendarById(calId);
        if (!calendar) {
          console.warn(`[WARN] Calendar not found or inaccessible: ${calId}`);
          return;
        }

        const calEvents = calendar.getEvents(startTime, endTime);

        calEvents.forEach(event => {
          try {
            const eventId = event.getId().split('@')[0];

            let advEvent = null;
            let meeting_url = '';
            let participant_status = '';

            try {
              if (typeof Calendar !== 'undefined') {
                advEvent = Calendar.Events.get(calId, eventId);
                meeting_url = extractMeetingUrl(advEvent);
                participant_status = getMyParticipantStatus(advEvent);
              } else {
                console.warn(`[WARN] Calendar API not available. Please add "Google Calendar API" service in Apps Script editor.`);
              }
            } catch (apiErr) {
              console.warn(`[WARN] Calendar API error for event ${event.getTitle()}: ${apiErr.message}`);
            }

            events.push({
              calendarName: calendar.getName(),
              title: event.getTitle(),
              start: event.getStartTime().toISOString(),
              end: event.getEndTime().toISOString(),
              meeting_url: meeting_url,
              description: event.getDescription() || '',
              location: event.getLocation() || '',
              attendees: event.getGuestList().map(g => g.getEmail()),
              participant_status: participant_status,
              isAllDay: event.isAllDayEvent()
            });
          } catch (err) {
            console.warn(`[WARN] Failed to process event ${event.getTitle()}: ${err.message}`);
          }
        });
      });

      // Sort events by start time (chronological order)
      events.sort((a, b) => new Date(a.start) - new Date(b.start));

      const selectedCalendars = calendarInfo.length > 0
        ? calendarInfo
        : calendarIds.map(id => ({ id, name: 'Unknown' }));

      vaultsOutput[vaultName] = {
        selectedCalendars: selectedCalendars,
        events: events
      };

      console.log(`[VAULT] "${vaultName}": ${events.length} events from ${calendarIds.length} calendar(s)`);
    });

    // Build final JSON output
    const output = { vaults: vaultsOutput };
    const jsonString = JSON.stringify(output, null, 2);

    // Log Google Drive JSON content
    console.log('[SYNC] Google Drive JSON to be saved:');
    console.log(jsonString);

    // Save to Google Drive
    saveToDrive(filePath, jsonString);

    const totalEvents = Object.values(vaultsOutput).reduce((sum, v) => sum + v.events.length, 0);
    console.log(`[OK] Synced ${totalEvents} events across ${totalVaults} vault(s) to ${filePath}`);

  } catch (e) {
    console.error(`[ERROR] Sync failed: ${e.toString()}`);
  }
}

// ============================================================
// 3. Extract Meeting URL (Zoom/Google Meet/Teams)
// ============================================================
function extractMeetingUrl(advEvent) {
  const links = new Set();

  // 1. Extract from conferenceData (Google Meet, etc.)
  if (advEvent && advEvent.conferenceData && advEvent.conferenceData.entryPoints) {
    advEvent.conferenceData.entryPoints.forEach(ep => {
      if (ep.entryPointType === 'video' && ep.uri) {
        links.add(ep.uri);
      }
    });
  }

  // 2. Extract from location + description using regex
  const text = `${advEvent && advEvent.location ? advEvent.location : ''} ${advEvent && advEvent.description ? advEvent.description : ''}`;
  const cleanText = stripHtml(text);

  const linkRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)\/[-a-zA-Z0-9()@:%_\+.~#?&//=]*/gi;
  const matches = cleanText.match(linkRegex);

  if (matches) {
    matches.forEach(link => {
      const cleanLink = link.split(/[">]/)[0];
      links.add(cleanLink);
    });
  }

  // Return first link or empty string
  return links.size > 0 ? Array.from(links)[0] : '';
}

// ============================================================
// 4. Strip HTML Tags
// ============================================================
function stripHtml(text) {
  return String(text || '')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// 5. Save to Google Drive
// ============================================================
function saveToDrive(filePath, content) {
  // Parse path: separate folder path and filename
  const lastSlash = filePath.lastIndexOf('/');
  const folderPath = lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
  const fileName = lastSlash > 0 ? filePath.substring(lastSlash + 1) : filePath;

  // Get or create folder
  let folder = DriveApp.getRootFolder();
  if (folderPath) {
    folder = getOrCreateFolderFromPath(folderPath);
  }

  // Create or update file
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    const file = files.next();
    file.setContent(content);
    console.log(`[OK] Updated file: ${filePath}`);
  } else {
    folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    console.log(`[OK] Created new file: ${filePath}`);
  }
}

// ============================================================
// 6. Get or Create Folder from Path
// ============================================================
function getOrCreateFolderFromPath(path) {
  const parts = path.split('/').filter(p => p);
  let folder = DriveApp.getRootFolder();

  parts.forEach(folderName => {
    const folders = folder.getFoldersByName(folderName);
    folder = folders.hasNext() ? folders.next() : folder.createFolder(folderName);
  });

  return folder;
}

// ============================================================
// 7. Save Settings (Called from Settings.html)
// ============================================================
function saveSettings(calendarIds) {
  if (!calendarIds || calendarIds.length === 0) {
    return { success: false, message: 'Please select at least one calendar.' };
  }

  const cache = CacheService.getUserCache();
  const filePath = cache.get('INIT_FILE_PATH');
  const interval = parseInt(cache.get('INIT_INTERVAL'));
  const vaultName = cache.get('INIT_VAULT_NAME');

  if (!filePath || !interval || !vaultName) {
    return { success: false, message: 'Missing initialization parameters. Please reload the page from Summar.' };
  }

  // Collect calendar names along with IDs
  const calendarInfo = calendarIds.map(calId => {
    const calendar = CalendarApp.getCalendarById(calId);
    return {
      id: calId,
      name: calendar ? calendar.getName() : 'Unknown'
    };
  });

  // Update VAULT_CALENDARS and VAULT_CALENDARS_INFO (merge with existing vaults)
  const props = PropertiesService.getUserProperties();
  const vaultCalendars = JSON.parse(props.getProperty('VAULT_CALENDARS') || '{}');
  const vaultCalendarsInfo = JSON.parse(props.getProperty('VAULT_CALENDARS_INFO') || '{}');

  vaultCalendars[vaultName] = calendarIds;
  vaultCalendarsInfo[vaultName] = calendarInfo;

  const userPropsData = {
    'VAULT_CALENDARS': JSON.stringify(vaultCalendars),
    'VAULT_CALENDARS_INFO': JSON.stringify(vaultCalendarsInfo),
    'LAST_FILE_PATH': filePath,
    'LAST_INTERVAL': String(interval)
  };

  props.setProperties(userPropsData);

  // Log user properties
  console.log('[SAVE SETTINGS] User Properties saved:');
  console.log(JSON.stringify(userPropsData, null, 2));

  try {
    // Immediate first sync
    syncEventsToDrive();

    // Setup triggers using union of all vaults' calendars (deduplicated)
    const allCalendarIds = [...new Set(Object.values(vaultCalendars).flat())];
    ensureSyncTrigger(interval);
    ensureCalendarTriggers(allCalendarIds);

    return {
      success: true,
      message: `Settings saved! Syncing ${calendarIds.length} calendar(s) for vault "${vaultName}" every ${interval} minutes to ${filePath}.`
    };
  } catch (e) {
    return {
      success: false,
      message: `Settings saved, but trigger setup failed: ${e.message}`
    };
  }
}

// ============================================================
// 8. Ensure Sync Trigger (N-minute polling)
// ============================================================
function ensureSyncTrigger(intervalMinutes) {
  const props = PropertiesService.getUserProperties();
  const existingId = props.getProperty('SYNC_TRIGGER_ID');

  // Delete existing trigger if any
  if (existingId) {
    ScriptApp.getProjectTriggers()
      .filter(t => t.getUniqueId && t.getUniqueId() === existingId)
      .forEach(t => ScriptApp.deleteTrigger(t));
  }

  // Create new trigger
  const trigger = ScriptApp.newTrigger('syncEventsToDrive')
    .timeBased()
    .everyMinutes(intervalMinutes)
    .create();

  props.setProperty('SYNC_TRIGGER_ID', trigger.getUniqueId());
  console.log(`[TRIGGER] Created sync trigger: every ${intervalMinutes} minutes`);
}

// ============================================================
// 9. Ensure Calendar Update Triggers
// ============================================================
function ensureCalendarTriggers(calendarIds) {
  const props = PropertiesService.getUserProperties();
  const existingIds = JSON.parse(props.getProperty('CALENDAR_TRIGGER_IDS') || '[]');

  // Delete all existing calendar triggers
  const triggers = ScriptApp.getProjectTriggers();
  existingIds.forEach(id => {
    triggers
      .filter(t => t.getUniqueId && t.getUniqueId() === id)
      .forEach(t => ScriptApp.deleteTrigger(t));
  });

  // Create new triggers for each unique calendar
  const newIds = [];
  const errors = [];

  calendarIds.forEach(calId => {
    try {
      const trigger = ScriptApp.newTrigger('syncEventsToDrive')
        .forUserCalendar(calId)
        .onEventUpdated()
        .create();
      newIds.push(trigger.getUniqueId());
    } catch (e) {
      errors.push({ calendarId: calId, error: e.message });
      console.warn(`[WARN] Failed to create calendar trigger for ${calId}: ${e.message}`);
    }
  });

  props.setProperty('CALENDAR_TRIGGER_IDS', JSON.stringify(newIds));
  console.log(`[TRIGGER] Created ${newIds.length} calendar update triggers (${errors.length} failed)`);
}

// ============================================================
// 10. Get Initial Settings (For Settings.html)
// ============================================================
function getInitialSettings() {
  const cache = CacheService.getUserCache();
  const props = PropertiesService.getUserProperties();

  return {
    filePath: cache.get('INIT_FILE_PATH') || props.getProperty('LAST_FILE_PATH') || '(not set)',
    interval: parseInt(cache.get('INIT_INTERVAL') || props.getProperty('LAST_INTERVAL')) || 15,
    vaultName: cache.get('INIT_VAULT_NAME') || '(not set)'
  };
}

// ============================================================
// 11. Get Calendar List (For Settings.html)
// ============================================================
function getCalendarList() {
  const calendars = CalendarApp.getAllCalendars();

  // Get the vault name from cache to show correct pre-checked state per vault
  const vaultName = CacheService.getUserCache().get('INIT_VAULT_NAME') || '';
  const vaultCalendars = JSON.parse(PropertiesService.getUserProperties().getProperty('VAULT_CALENDARS') || '{}');
  const selectedIds = vaultName && vaultCalendars[vaultName] ? vaultCalendars[vaultName] : [];

  return calendars.map(cal => ({
    id: cal.getId(),
    name: cal.getName(),
    selected: selectedIds.includes(cal.getId())
  }));
}

// ============================================================
// 12. Get My Participant Status (For Summar format)
// ============================================================
function getMyParticipantStatus(advEvent) {
  if (!advEvent) return '';

  // 1. Find myself in attendees list (self: true)
  if (advEvent.attendees && Array.isArray(advEvent.attendees)) {
    const myAttendee = advEvent.attendees.find(a => a.self === true);
    if (myAttendee && myAttendee.responseStatus) {
      return myAttendee.responseStatus;
    }
  }

  // 2. If I'm the organizer
  if (advEvent.organizer && advEvent.organizer.self === true) {
    return 'accepted';
  }

  // 3. Not in attendee list (viewer-only or public calendar)
  return '';
}
