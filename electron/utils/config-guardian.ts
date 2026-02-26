/**
 * Config Guardian - Backup and restore OpenClaw configuration
 * 
 * Backs up:
 * - openclaw.json (main config)
 * - memory/ (conversation memory)
 * - skills/ (installed skills)
 * - memory/skills.json (skill configurations)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { app } from 'electron';
import * as logger from './logger';

// Constants
const BACKUP_DIR = 'config-backups';
const MAX_BACKUPS = 10;

// Files and directories to backup
const FILES_TO_BACKUP = [
  'openclaw.json',
  'memory/',
  'memory/skills.json'
];

// Workspace directories to backup (skills, etc.)
const WORKSPACE_DIRS = [
  'workspace-dev',
  'workspace-main'
];

/**
 * Get the backup directory path
 * Can be customized in openclaw.json config
 */
function getBackupDir(): string {
  let backupDir = '';
  
  // Try to read custom backup path from config
  try {
    const configPath = getConfigDir();
    const openclawConfig = join(configPath, 'openclaw.json');
    if (existsSync(openclawConfig)) {
      const config = JSON.parse(readFileSync(openclawConfig, 'utf-8'));
      if (config.backup?.path && config.backup.path.trim()) {
        backupDir = join(config.backup.path.trim(), 'config-backups');
        console.log(`[ConfigGuardian] Using custom backup path: ${backupDir}`);
        // Ensure directory exists
        if (!existsSync(backupDir)) {
          mkdirSync(backupDir, { recursive: true });
          console.log(`[ConfigGuardian] Created backup directory: ${backupDir}`);
        }
        return backupDir;
      }
    }
  } catch (e) {
    // Ignore config read errors, use default
  }
  
  // Default: C: drive has highest priority, then Z:, then AppData
  if (process.platform === 'win32') {
    // Check C: drive first
    if (existsSync('C:\\Local\\Users\\songl\\.openclaw')) {
      backupDir = 'C:\\Local\\Users\\songl\\.openclaw\\config-backups';
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
        console.log(`[ConfigGuardian] Created backup directory: ${backupDir}`);
      }
      return backupDir;
    }
    // Check Z: drive
    if (existsSync('Z:\\Local\\Users\\songl\\.openclaw')) {
      backupDir = 'Z:\\Local\\Users\\songl\\.openclaw\\config-backups';
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
        console.log(`[ConfigGuardian] Created backup directory: ${backupDir}`);
      }
      return backupDir;
    }
  }
  
  // Fallback to AppData
  backupDir = join(app.getPath('userData'), 'config-backups');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
    console.log(`[ConfigGuardian] Created backup directory: ${backupDir}`);
  }
  return backupDir;
}

/**
 * Get the custom backup base path from config (if set)
 */
export function getCustomBackupPath(): string | null {
  try {
    const configPath = getConfigDir();
    const openclawConfig = join(configPath, 'openclaw.json');
    if (existsSync(openclawConfig)) {
      const config = JSON.parse(readFileSync(openclawConfig, 'utf-8'));
      if (config.backup?.path && config.backup.path.trim()) {
        return config.backup.path.trim();
      }
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

/**
 * Get the default backup full path (when not customized)
 */
export function getDefaultBackupPath(): string {
  // Default: C: drive has highest priority, then Z:, then AppData
  if (process.platform === 'win32') {
    // Check C: drive first
    if (existsSync('C:\\Local\\Users\\songl\\.openclaw')) {
      return 'C:\\Local\\Users\\songl\\.openclaw\\config-backups';
    }
    // Check Z: drive
    if (existsSync('Z:\\Local\\Users\\songl\\.openclaw')) {
      return 'Z:\\Local\\Users\\songl\\.openclaw\\config-backups';
    }
  }
  // Fallback to AppData
  return join(app.getPath('userData'), 'config-backups');
}

/**
 * Set the custom backup path in config
 * If switching to a new path, copies files from old path to new path
 */
export function setCustomBackupPath(path: string): boolean {
  try {
    const configPath = getConfigDir();
    const openclawConfig = join(configPath, 'openclaw.json');
    let config: any = {};
    
    // Get old backup path before changing
    const oldBackupPath = getBackupDir();
    const newBackupPath = join(path.trim(), 'config-backups');
    
    // Copy files from old path to new path if different
    if (oldBackupPath !== newBackupPath && existsSync(oldBackupPath)) {
      console.log(`[ConfigGuardian] Copying backups from ${oldBackupPath} to ${newBackupPath}`);
      
      // Ensure new directory exists
      if (!existsSync(newBackupPath)) {
        mkdirSync(newBackupPath, { recursive: true });
      }
      
      // Copy all backup directories
      try {
        const oldBackups = readdirSync(oldBackupPath);
        for (const backup of oldBackups) {
          const src = join(oldBackupPath, backup);
          const dest = join(newBackupPath, backup);
          if (statSync(src).isDirectory()) {
            copyItem(src, dest);
            console.log(`[ConfigGuardian] Copied backup: ${backup}`);
          }
        }
        console.log(`[ConfigGuardian] All backups copied successfully`);
      } catch (copyError) {
        console.error('[ConfigGuardian] Failed to copy backups:', copyError);
      }
    }
    
    // Save new path to config
    if (existsSync(openclawConfig)) {
      config = JSON.parse(readFileSync(openclawConfig, 'utf-8'));
    }
    
    config.backup = config.backup || {};
    config.backup.path = path.trim();
    
    writeFileSync(openclawConfig, JSON.stringify(config, null, 2));
    console.log(`[ConfigGuardian] Custom backup path set to: ${path}`);
    return true;
  } catch (e) {
    console.error('[ConfigGuardian] Failed to set custom backup path:', e);
    return false;
  }
}

/**
 * Get the source config directory
 */
function getConfigDir(): string {
  // Try Z: drive first for development
  if (process.platform === 'win32') {
    const zDrivePath = 'Z:\\Local\\Users\\songl\\.openclaw';
    if (existsSync(zDrivePath)) {
      return zDrivePath;
    }
  }
  // Fallback to AppData
  return join(app.getPath('userData'));
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(): void {
  const backupDir = getBackupDir();
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
}

/**
 * Copy file or directory
 */
function copyItem(src: string, dest: string): void {
  const srcStat = statSync(src);
  
  if (srcStat.isDirectory()) {
    // Create destination directory
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
    }
    // Copy all contents
    const entries = readdirSync(src);
    for (const entry of entries) {
      copyItem(join(src, entry), join(dest, entry));
    }
  } else {
    // Copy file
    const destDir = dest.replace(/[/\\][^/\\]+$/, '');
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    copyFileSync(src, dest);
  }
}

/**
 * Create a timestamp-based backup filename
 */
function generateBackupFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19) + 'Z';
  return `openclaw-backup-${timestamp}`;
}

/**
 * Create config backup
 */
export async function createConfigBackup(): Promise<{ filename: string; path: string; createdAt: Date } | null> {
  try {
    const configDir = getConfigDir();
    const backupDir = getBackupDir();
    
    // Ensure backup directory exists
    ensureBackupDir();
    
    // Generate backup filename
    const backupFilename = generateBackupFilename();
    const backupPath = join(backupDir, backupFilename);
    
    // Create backup directory
    mkdirSync(backupPath, { recursive: true });
    
    // Backup each item
    for (const item of FILES_TO_BACKUP) {
      const srcPath = join(configDir, item);
      const destPath = join(backupPath, item);
      
      if (existsSync(srcPath)) {
        copyItem(srcPath, destPath);
        console.log(`[ConfigGuardian] Backed up: ${item}`);
      }
    }
    
    // Backup workspace directories (skills, etc.)
    for (const workspace of WORKSPACE_DIRS) {
      const srcPath = join(configDir, workspace);
      const destPath = join(backupPath, workspace);
      
      if (existsSync(srcPath)) {
        copyItem(srcPath, destPath);
        console.log(`[ConfigGuardian] Backed up workspace: ${workspace}`);
      }
    }
    
    // Clean up old backups
    cleanOldBackups();
    
    const createdAt = new Date();
    console.log(`[ConfigGuardian] Backup created: ${backupFilename}`);
    logger.info(`[ConfigGuardian] Backup created: ${backupFilename}`);
    
    return {
      filename: backupFilename,
      path: backupPath,
      createdAt
    };
  } catch (error) {
    console.error('[ConfigGuardian] Failed to create backup:', error);
    logger.error('[ConfigGuardian] Failed to create backup:', error);
    return null;
  }
}

/**
 * Clean up old backups, keeping only MAX_BACKUPS
 */
function cleanOldBackups(): void {
  try {
    const backupDir = getBackupDir();
    if (!existsSync(backupDir)) return;
    
    // Get all backup directories
    const backups = readdirSync(backupDir)
      .map(name => ({
        name,
        path: join(backupDir, name),
        time: statSync(join(backupDir, name)).mtime.getTime()
      }))
      .filter(backup => statSync(backup.path).isDirectory())
      .sort((a, b) => b.time - a.time); // Sort by time, newest first
    
    // Remove old backups
    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);
      for (const backup of toDelete) {
        rmSync(backup.path, { recursive: true, force: true });
        console.log(`[ConfigGuardian] Removed old backup: ${backup.name}`);
      }
    }
  } catch (error) {
    console.error('[ConfigGuardian] Failed to clean old backups:', error);
  }
}

/**
 * Get the latest backup
 */
export function getLatestBackup(): { filename: string; path: string } | null {
  try {
    const backupDir = getBackupDir();
    if (!existsSync(backupDir)) return null;
    
    const backups = readdirSync(backupDir)
      .map(name => ({
        name,
        path: join(backupDir, name),
        time: statSync(join(backupDir, name)).mtime.getTime()
      }))
      .filter(backup => statSync(backup.path).isDirectory())
      .sort((a, b) => b.time - a.time);
    
    if (backups.length === 0) return null;
    
    return {
      filename: backups[0].name,
      path: backups[0].path
    };
  } catch (error) {
    console.error('[ConfigGuardian] Failed to get latest backup:', error);
    return null;
  }
}

/**
 * Validate if a backup contains valid config
 */
function validateBackup(backupPath: string): { valid: boolean; error?: string } {
  try {
    const configPath = join(backupPath, 'openclaw.json');
    if (!existsSync(configPath)) {
      return { valid: false, error: 'openclaw.json not found in backup' };
    }
    
    const content = readFileSync(configPath, 'utf-8');
    JSON.parse(content); // Try to parse JSON
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

/**
 * Get all available backups sorted by time (newest first)
 */
export function getAllBackups(): Array<{ 
  filename: string; 
  path: string; 
  time: number;
  createdAt: string;
  size?: number;
}> {
  try {
    const backupDir = getBackupDir();
    if (!existsSync(backupDir)) return [];
    
    return readdirSync(backupDir)
      .map(name => {
        const backupPath = join(backupDir, name);
        const stats = statSync(backupPath);
        return {
          name,
          path: backupPath,
          time: stats.mtime.getTime(),
          createdAt: stats.mtime.toISOString(),
          size: stats.size
        };
      })
      .filter(backup => statSync(backup.path).isDirectory())
      .sort((a, b) => b.time - a.time); // Newest first
  } catch (error) {
    console.error('[ConfigGuardian] Failed to get all backups:', error);
    return [];
  }
}

/**
 * Restore from a specific backup file
 */
export function restoreFromSpecificBackup(backupFilename: string): boolean {
  try {
    const backupDir = getBackupDir();
    const backupPath = join(backupDir, backupFilename);
    
    if (!existsSync(backupPath)) {
      console.error(`[ConfigGuardian] Backup not found: ${backupFilename}`);
      return false;
    }
    
    // Validate backup first
    const validation = validateBackup(backupPath);
    if (!validation.valid) {
      console.error(`[ConfigGuardian] Backup is invalid: ${validation.error}`);
      return false;
    }
    
    // Restore config
    const configDir = getConfigDir();
    const configItems = ['openclaw.json'];
    
    for (const item of configItems) {
      const src = join(backupPath, item);
      const dest = join(configDir, item);
      if (existsSync(src)) {
        copyFileSync(src, dest);
      }
    }
    
    // Restore memory if exists
    const memSrc = join(backupPath, 'memory');
    const memDest = join(configDir, 'memory');
    if (existsSync(memSrc)) {
      if (existsSync(memDest)) {
        rmSync(memDest, { recursive: true });
      }
      copyItem(memSrc, memDest);
    }
    
    console.log(`[ConfigGuardian] Restored from specific backup: ${backupFilename}`);
    return true;
  } catch (error) {
    console.error('[ConfigGuardian] Failed to restore from specific backup:', error);
    return false;
  }
}

/**
 * Restore config from backup with validation
 * If backup is invalid, tries previous backups
 * Returns: { success, backupUsed, invalidBackups }
 */
export async function restoreConfigWithValidation(
  maxRetries: number = 5
): Promise<{ success: boolean; backupUsed?: string; invalidBackups: Array<{ filename: string; error: string }> }> {
  const invalidBackups: Array<{ filename: string; error: string }> = [];
  const backups = getAllBackups();
  
  if (backups.length === 0) {
    console.error('[ConfigGuardian] No backups available');
    return { success: false, invalidBackups };
  }
  
  // Try each backup, starting from the newest
  for (let i = 0; i < Math.min(backups.length, maxRetries); i++) {
    const backup = backups[i];
    const validation = validateBackup(backup.path);
    
    if (!validation.valid) {
      console.warn(`[ConfigGuardian] Backup ${backup.name} is invalid: ${validation.error}`);
      invalidBackups.push({ filename: backup.name, error: validation.error || 'Unknown error' });
      continue; // Try next backup
    }
    
    console.log(`[ConfigGuardian] Attempting to restore from valid backup: ${backup.name}`);
    
    try {
      const restoreSuccess = await restoreConfig(backup.path);
      if (restoreSuccess) {
        return {
          success: true,
          backupUsed: backup.name,
          invalidBackups
        };
      }
    } catch (error) {
      console.error(`[ConfigGuardian] Failed to restore from ${backup.name}:`, error);
      invalidBackups.push({ filename: backup.name, error: String(error) });
    }
  }
  
  console.error('[ConfigGuardian] All backups are invalid or restoration failed');
  return { success: false, invalidBackups };
}

/**
 * Restore config from backup (legacy function, kept for compatibility)
 */
export async function restoreConfig(backupPath: string): Promise<boolean> {
  try {
    const configDir = getConfigDir();
    
    if (!existsSync(backupPath)) {
      console.error('[ConfigGuardian] Backup not found:', backupPath);
      return false;
    }
    
    // Restore each item from backup
    for (const item of FILES_TO_BACKUP) {
      const srcPath = join(backupPath, item);
      const destPath = join(configDir, item);
      
      if (existsSync(srcPath)) {
        // Remove existing file/directory
        if (existsSync(destPath)) {
          rmSync(destPath, { recursive: true, force: true });
        }
        // Copy from backup
        copyItem(srcPath, destPath);
        console.log(`[ConfigGuardian] Restored: ${item}`);
      }
    }
    
    console.log('[ConfigGuardian] Config restored from backup');
    logger.info('[ConfigGuardian] Config restored from backup');
    return true;
  } catch (error) {
    console.error('[ConfigGuardian] Failed to restore config:', error);
    logger.error('[ConfigGuardian] Failed to restore config:', error);
    return false;
  }
}

/**
 * Record gateway failure
 */
export function recordGatewayFailure(errorMessage: string): string {
  try {
    const errorLogPath = join(app.getPath('userData'), 'error-logs');
    if (!existsSync(errorLogPath)) {
      mkdirSync(errorLogPath, { recursive: true });
    }
    
    const errorId = `error-${Date.now()}`;
    const errorData = {
      errorId,
      timestamp: new Date().toISOString(),
      error: errorMessage,
      type: 'gateway_failure'
    };
    
    // Keep all error files (don't delete old ones)
    writeFileSync(join(errorLogPath, `${errorId}.json`), JSON.stringify(errorData, null, 2));
    
    // Cleanup old error files (keep last 10)
    const errorFiles = readdirSync(errorLogPath)
      .filter(f => f.startsWith('error-') && f.endsWith('.json'))
      .sort()
      .reverse();
    for (let i = 10; i < errorFiles.length; i++) {
      unlinkSync(join(errorLogPath, errorFiles[i]));
    }
    
    return errorId;
  } catch (error) {
    console.error('[ConfigGuardian] Failed to record gateway failure:', error);
    return '';
  }
}

/**
 * Record auto-rollback event
 * @param backupUsed - The backup that was successfully used
 * @param errorId - ID of the error that triggered the rollback
 * @param invalidBackups - Optional: list of invalid backups that were tried before finding a valid one
 */
export function recordAutoRollback(
  backupUsed: string, 
  errorId: string,
  invalidBackups?: Array<{ filename: string; error: string }>
): void {
  try {
    const errorLogPath = join(app.getPath('userData'), 'error-logs');
    if (!existsSync(errorLogPath)) {
      mkdirSync(errorLogPath, { recursive: true });
    }
    
    const rollbackId = `rollback-${Date.now()}.json`;
    const rollbackData: any = {
      rollbackId,
      timestamp: new Date().toISOString(),
      backupUsed,
      errorId,
      type: 'auto_rollback',
      recovery: 'auto-rollback'
    };
    
    // Include invalid backups info if provided
    if (invalidBackups && invalidBackups.length > 0) {
      rollbackData.invalidBackups = invalidBackups;
      rollbackData.rollbackAttempts = invalidBackups.length + 1;
    }
    
    writeFileSync(join(errorLogPath, rollbackId), JSON.stringify(rollbackData, null, 2));
  } catch (error) {
    console.error('[ConfigGuardian] Failed to record rollback:', error);
  }
}

/**
 * Get rollback history
 */
export function getRollbackHistory(): Array<{
  rollbackId: string;
  timestamp: string;
  backupUsed: string;
  errorId: string;
  type: string;
  recovery: string;
}> {
  try {
    const errorLogPath = join(app.getPath('userData'), 'error-logs');
    if (!existsSync(errorLogPath)) {
      return [];
    }
    
    const files = readdirSync(errorLogPath)
      .filter(f => f.startsWith('rollback-') && f.endsWith('.json'))
      .map(f => {
        const content = readFileSync(join(errorLogPath, f), 'utf-8');
        return JSON.parse(content);
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return files;
  } catch (error) {
    console.error('[ConfigGuardian] Failed to get rollback history:', error);
    return [];
  }
}

/**
 * Get all error and rollback events
 * Each error log file can have recovery status. If recovery='auto-rollback', it's a rollback event.
 */
export function getAllErrorLogs(): Array<{
  id: string;
  timestamp: string;
  type: 'error' | 'rollback';
  error?: string;
  backupUsed?: string;
  recovery?: string;
  errorId?: string;
  relatedError?: {
    timestamp: string;
    error: string;
  };
}> {
  try {
    const errorLogPath = join(app.getPath('userData'), 'error-logs');
    if (!existsSync(errorLogPath)) {
      return [];
    }

    // Load all error log files
    const allFiles = readdirSync(errorLogPath)
      .filter(f => f.endsWith('.json') && !f.includes('-config.json'))
      .map(f => {
        try {
          const content = readFileSync(join(errorLogPath, f), 'utf-8');
          const data = JSON.parse(content);
          return {
            id: f.replace('.json', ''),
            timestamp: data.timestamp || '',
            // If recovery is auto-rollback, treat as rollback type
            type: data.recovery === 'auto-rollback' ? 'rollback' as const : 'error' as const,
            error: data.error,
            backupUsed: data.backupUsed,
            recovery: data.recovery,
            errorId: data.errorId,
            stack: data.stack,
            configPath: data.configPath,
            invalidBackups: data.invalidBackups,
            rollbackAttempts: data.rollbackAttempts
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.timestamp).getTime() - new Date(a!.timestamp).getTime());
    
    return allFiles as any[];
  } catch (error) {
    console.error('[ConfigGuardian] Failed to get error logs:', error);
    return [];
  }
}

/**
 * Check for previous issues (for notifications)
 */
export function checkPreviousIssues(): { 
  hadError: boolean; 
  wasRecovered: boolean; 
  errorMessage?: string; 
  errorTime?: string;
  recoveryType?: string;
  recoveryTime?: string;
  backupUsed?: string;
} {
  try {
    const errorLogPath = join(app.getPath('userData'), 'error-logs');
    if (!existsSync(errorLogPath)) {
      return { hadError: false, wasRecovered: false };
    }
    
    // Find latest error and rollback
    const files = readdirSync(errorLogPath)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: join(errorLogPath, f),
        time: statSync(join(errorLogPath, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    if (files.length === 0) {
      return { hadError: false, wasRecovered: false };
    }
    
    // Check latest error
    const errorFile = files.find(f => f.name.startsWith('error-'));
    const rollbackFile = files.find(f => f.name.startsWith('rollback-'));
    
    if (errorFile && rollbackFile) {
      const errorData = JSON.parse(readFileSync(errorFile.path, 'utf-8'));
      const rollbackData = JSON.parse(readFileSync(rollbackFile.path, 'utf-8'));
      
      return {
        hadError: true,
        wasRecovered: true,
        errorMessage: errorData.error,
        errorTime: errorData.timestamp,
        recoveryType: rollbackData.recovery,
        recoveryTime: rollbackData.timestamp,
        backupUsed: rollbackData.backupUsed
      };
    }
    
    return { hadError: false, wasRecovered: false };
  } catch (error) {
    console.error('[ConfigGuardian] Failed to check previous issues:', error);
    return { hadError: false, wasRecovered: false };
  }
}
