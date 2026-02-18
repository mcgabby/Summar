import { Platform } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const exec = promisify(require('child_process').exec);
const access = promisify(fs.access);
const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export interface GoogleDriveStatus {
  installed: boolean;
  loggedIn: boolean;
  drivePath: string | null;
  platformSupported: boolean;
  multipleAccounts: boolean;
  availablePaths: string[];
}

export interface CalendarJsonData {
  selectedCalendars: Array<{ id: string; name: string }>;
  events: any[];
  localFileTime: Date;
}

/**
 * Known "My Drive" folder names across different languages
 * Used for language-independent Google Drive folder detection
 */
const MY_DRIVE_FOLDER_NAMES = [
  'My Drive',          // English
  '내 드라이브',         // Korean
  'マイドライブ',        // Japanese
  '我的云端硬盘',       // Chinese (Simplified - 中国大陆)
  '我的雲端硬碟',       // Chinese (Traditional - 台湾/香港)
  'Mi unidad',         // Spanish
  'Meu Drive',         // Portuguese
  'Mon Drive',         // French
  'Mein Drive'         // German
];

/**
 * Check Google Drive Desktop installation and login status
 */
export async function checkGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  // Platform check
  if (!Platform.isMacOS) {
    return {
      installed: false,
      loggedIn: false,
      drivePath: null,
      platformSupported: false,
      multipleAccounts: false,
      availablePaths: []
    };
  }

  // Check if Google Drive app is installed
  const installed = await checkGoogleDriveInstallation();

  if (!installed) {
    return {
      installed: false,
      loggedIn: false,
      drivePath: null,
      platformSupported: true,
      multipleAccounts: false,
      availablePaths: []
    };
  }

  // Check login status by finding Google Drive folder
  const drivePaths = await findGoogleDriveFolders();

  if (drivePaths.length === 0) {
    return {
      installed: true,
      loggedIn: false,
      drivePath: null,
      platformSupported: true,
      multipleAccounts: false,
      availablePaths: []
    };
  }

  return {
    installed: true,
    loggedIn: true,
    drivePath: drivePaths[0], // Use first path by default
    platformSupported: true,
    multipleAccounts: drivePaths.length > 1,
    availablePaths: drivePaths
  };
}

/**
 * Check if Google Drive Desktop is installed on macOS
 */
async function checkGoogleDriveInstallation(): Promise<boolean> {
  try {
    await exec('test -d "/Applications/Google Drive.app"');
    return true;
  } catch {
    return false;
  }
}

/**
 * Find all Google Drive folders (supports multiple accounts)
 */
async function findGoogleDriveFolders(): Promise<string[]> {
  const homedir = require('os').homedir();
  const foundPaths: string[] = [];

  // 1. Check CloudStorage paths (Google Drive Desktop uses this on macOS)
  const cloudStoragePath = path.join(homedir, 'Library', 'CloudStorage');
  try {
    const files = await readdir(cloudStoragePath);
    const drivePattern = /^GoogleDrive-(.+)$/;

    for (const file of files) {
      if (drivePattern.test(file)) {
        const basePath = path.join(cloudStoragePath, file);

        // Find "My Drive" folder with priority-based selection
        try {
          const subfolders = await readdir(basePath);

          // First, try to find exact match from priority list
          // Note: macOS uses NFD normalization, so we need to normalize for comparison
          for (const candidate of MY_DRIVE_FOLDER_NAMES) {
            const matchedFolder = subfolders.find(
              folder => folder.normalize('NFC') === candidate.normalize('NFC')
            );

            if (matchedFolder) {
              const drivePath = path.join(basePath, matchedFolder);
              try {
                await access(drivePath, fs.constants.R_OK);
                const stats = await stat(drivePath);
                if (stats.isDirectory()) {
                  foundPaths.push(drivePath);
                  break; // Found "My Drive"
                }
              } catch {
                // Not accessible, try next
              }
            }
          }

          // If not found, fall back to first non-system, non-special folder
          if (foundPaths.length === 0) {
            const excludedKeywords = ['공유', 'Shared', '共有', '共享', '다른', 'Computers', 'コンピュータ', '计算机'];

            for (const subfolder of subfolders) {
              // Skip system folders
              if (subfolder.startsWith('.')) {
                continue;
              }

              // Skip folders with excluded keywords
              if (excludedKeywords.some(keyword => subfolder.includes(keyword))) {
                continue;
              }

              const drivePath = path.join(basePath, subfolder);
              try {
                const stats = await stat(drivePath);
                if (stats.isDirectory()) {
                  await access(drivePath, fs.constants.R_OK);
                  foundPaths.push(drivePath);
                  break;
                }
              } catch {
                // Folder not accessible, try next
              }
            }
          }
        } catch {
          // Could not read subfolders
        }
      }
    }
  } catch {
    // CloudStorage path doesn't exist or not accessible
  }

  // 2. Check standard paths (legacy or symlink paths)
  const standardPaths = [
    path.join(homedir, 'Google Drive'),
    path.join(homedir, 'GoogleDrive'),
    ...MY_DRIVE_FOLDER_NAMES.map(name => path.join(homedir, name)),
    '/Volumes/GoogleDrive'
  ];

  for (const drivePath of standardPaths) {
    try {
      await access(drivePath, fs.constants.R_OK);
      const stats = await stat(drivePath);
      if (stats.isDirectory()) {
        // Avoid duplicates
        if (!foundPaths.includes(drivePath)) {
          foundPaths.push(drivePath);
        }
      }
    } catch {
      // Path doesn't exist or not accessible
    }
  }

  // 3. Check for multiple account folders (e.g., "Google Drive (user@gmail.com)")
  try {
    const files = await readdir(homedir);
    const drivePattern = /^Google Drive \(.+@.+\)$/;

    for (const file of files) {
      if (drivePattern.test(file)) {
        const fullPath = path.join(homedir, file);
        try {
          const stats = await stat(fullPath);
          if (stats.isDirectory()) {
            // Avoid duplicates
            if (!foundPaths.includes(fullPath)) {
              foundPaths.push(fullPath);
            }
          }
        } catch {
          // Skip inaccessible folders
        }
      }
    }
  } catch {
    // Could not read home directory
  }

  return foundPaths;
}

/**
 * Get Google Drive folder path (first available)
 */
export async function getGoogleDriveFolderPath(): Promise<string | null> {
  const status = await checkGoogleDriveStatus();
  return status.drivePath;
}

/**
 * Read calendar JSON file from Google Drive
 * @param vaultName - Obsidian vault name to read vault-specific data from the multi-vault JSON structure
 */
export async function readCalendarJson(
  relativeFilePath: string,
  drivePath?: string,
  vaultName?: string
): Promise<CalendarJsonData | null> {
  try {
    // Get Google Drive path if not provided
    if (!drivePath) {
      const foundPath = await getGoogleDriveFolderPath();
      if (!foundPath) {
        return null;
      }
      drivePath = foundPath;
    }

    const fullPath = path.join(drivePath, relativeFilePath);

    // Check if file exists and get mtime
    let fileStat: fs.Stats;
    try {
      fileStat = await stat(fullPath);
    } catch {
      // File doesn't exist yet (normal during initial setup)
      return null;
    }

    // Read and parse JSON
    const content = await readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);

    // Determine the source object based on vault name
    let source: any;
    if (vaultName) {
      // Multi-vault schema: { vaults: { [vaultName]: { selectedCalendars, events } } }
      if (!data.vaults || typeof data.vaults !== 'object') {
        console.error('[Calendar JSON] Invalid schema: vaults section missing');
        return null;
      }
      source = data.vaults[vaultName];
      if (!source) {
        // Vault not yet configured in this JSON file
        return null;
      }
    } else {
      source = data;
    }

    // Validate schema
    if (!source.selectedCalendars || !Array.isArray(source.selectedCalendars)) {
      console.error('[Calendar JSON] Invalid schema: selectedCalendars missing or not an array');
      return null;
    }

    // Validate each calendar object
    const validCalendars = source.selectedCalendars.filter((cal: any) =>
      cal &&
      typeof cal.id === 'string' &&
      typeof cal.name === 'string'
    );

    if (validCalendars.length !== source.selectedCalendars.length) {
      console.warn('[Calendar JSON] Some calendars have invalid format');
    }

    return {
      selectedCalendars: validCalendars,
      events: Array.isArray(source.events) ? source.events : [],
      localFileTime: fileStat.mtime
    };

  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // File not found (normal)
      return null;
    }

    console.error('[Calendar JSON] Failed to read/parse:', err);
    return null;
  }
}

/**
 * Check if calendar JSON file exists
 */
export async function checkCalendarJsonExists(
  relativeFilePath: string,
  drivePath?: string
): Promise<boolean> {
  try {
    if (!drivePath) {
      const foundPath = await getGoogleDriveFolderPath();
      if (!foundPath) {
        return false;
      }
      drivePath = foundPath;
    }

    const fullPath = path.join(drivePath, relativeFilePath);
    await access(fullPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check network connectivity (simplified)
 */
export async function checkNetworkStatus(): Promise<boolean> {
  try {
    // Try to resolve Google's DNS
    const { exec } = require('child_process');
    await promisify(exec)('ping -c 1 -W 1000 8.8.8.8');
    return true;
  } catch {
    return false;
  }
}
