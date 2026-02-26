/**
 * Error Logger Module
 * Records Gateway startup failures with error details and failed config
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { getOpenClawConfigDir } from './paths';

const ERROR_LOG_DIR_NAME = 'error-logs';

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  error: string;
  configPath: string;
  stack?: string;
  recovery: 'auto-rollback' | 'manual' | 'none';
  backupUsed?: string;
  errorContext?: {
    position: number;
    line: number;
    column: number;
    lineContent: string;
    beforeContent: string;
    afterContent: string;
  };
}

/**
 * Get error log directory path
 */
function getErrorLogDir(): string {
  const dir = path.join(app.getPath('userData'), ERROR_LOG_DIR_NAME);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get config file path (user's config, not app bundled config)
 */
function getConfigPath(): string {
  return path.join(getOpenClawConfigDir(), 'openclaw.json');
}

/**
 * Log a Gateway startup failure
 * Returns the error log entry
 */
export function logGatewayError(
  error: string | Error,
  configContent: string,
  backupUsed?: string
): ErrorLogEntry {
  const errorLogDir = getErrorLogDir();

  // Extract error context for JSON parsing errors
  let errorContext: ErrorLogEntry['errorContext'] | undefined;
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  if (errorMessage.includes('JSON') || errorMessage.includes('position')) {
    // Try to extract position from error message
    const posMatch = errorMessage.match(/position\s+(\d+)/i);
    const lineColMatch = errorMessage.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    
    if (posMatch || lineColMatch) {
      const lines = configContent.split('\n');
      let line = 1, column = 1, position = 0;
      
      if (lineColMatch) {
        line = parseInt(lineColMatch[1], 10);
        column = parseInt(lineColMatch[2], 10);
      } else if (posMatch) {
        position = parseInt(posMatch[1], 10);
        // Calculate line and column from position
        for (let i = 0; i < position && i < configContent.length; i++) {
          if (configContent[i] === '\n') {
            line++;
            column = 1;
          } else {
            column++;
          }
        }
      }
      
      errorContext = {
        position,
        line,
        column,
        lineContent: lines[line - 1] || '',
        beforeContent: lines.slice(Math.max(0, line - 3), line - 1).join('\n'),
        afterContent: lines.slice(line, Math.min(lines.length, line + 2)).join('\n')
      };
    }
  }

  const entry: ErrorLogEntry = {
    id: `error-${Date.now()}`,
    timestamp: new Date().toISOString(),
    error: errorMessage,
    configPath: getConfigPath(),
    stack: error instanceof Error ? error.stack : undefined,
    recovery: 'none',
    backupUsed,
    errorContext
  };

  // Write error log entry
  const logFile = path.join(errorLogDir, `${entry.id}.json`);
  fs.writeFileSync(logFile, JSON.stringify(entry, null, 2));

  // Save failed config
  const failedConfigPath = path.join(errorLogDir, `${entry.id}-config.json`);
  fs.writeFileSync(failedConfigPath, configContent);

  console.log(`[ConfigGuardian] Error logged: ${entry.id}`);

  return entry;
}

/**
 * Update recovery status for an error log
 */
export function updateRecoveryStatus(
  id: string,
  recovery: ErrorLogEntry['recovery'],
  backupUsed?: string,
  invalidBackups?: Array<{ filename: string; error: string }>
): void {
  const logFile = path.join(getErrorLogDir(), `${id}.json`);
  
  if (!fs.existsSync(logFile)) {
    return;
  }

  try {
    const entry: ErrorLogEntry = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    entry.recovery = recovery;
    if (backupUsed) {
      entry.backupUsed = backupUsed;
    }
    if (invalidBackups && invalidBackups.length > 0) {
      entry.invalidBackups = invalidBackups;
      entry.rollbackAttempts = invalidBackups.length + 1;
    }
    fs.writeFileSync(logFile, JSON.stringify(entry, null, 2));
    console.log(`[ConfigGuardian] Recovery status updated: ${id} -> ${recovery}`);
  } catch (error) {
    console.error('[ConfigGuardian] Failed to update recovery status:', error);
  }
}

/**
 * Get all error logs
 */
export function getAllErrorLogs(): ErrorLogEntry[] {
  const errorLogDir = getErrorLogDir();
  
  if (!fs.existsSync(errorLogDir)) {
    return [];
  }

  try {
    return fs.readdirSync(errorLogDir)
      .filter(f => f.startsWith('error-') && f.endsWith('.json'))
      .map(f => {
        const content = fs.readFileSync(path.join(errorLogDir, f), 'utf-8');
        return JSON.parse(content);
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (error) {
    console.error('[ConfigGuardian] Failed to get error logs:', error);
    return [];
  }
}

/**
 * Get error details including failed config
 */
export function getErrorDetails(id: string): {
  entry: ErrorLogEntry | null;
  failedConfig: string | null;
} {
  const errorLogDir = getErrorLogDir();
  const logFile = path.join(errorLogDir, `${id}.json`);
  const configFile = path.join(errorLogDir, `${id}-config.json`);

  if (!fs.existsSync(logFile)) {
    return { entry: null, failedConfig: null };
  }

  try {
    const entry: ErrorLogEntry = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    const failedConfig = fs.existsSync(configFile)
      ? fs.readFileSync(configFile, 'utf-8')
      : null;

    return { entry, failedConfig };
  } catch (error) {
    console.error('[ConfigGuardian] Failed to get error details:', error);
    return { entry: null, failedConfig: null };
  }
}

/**
 * Delete an error log and its associated config
 */
export function deleteErrorLog(id: string): boolean {
  const errorLogDir = getErrorLogDir();
  const logFile = path.join(errorLogDir, `${id}.json`);
  const configFile = path.join(errorLogDir, `${id}-config.json`);

  try {
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
    return true;
  } catch (error) {
    console.error('[ConfigGuardian] Failed to delete error log:', error);
    return false;
  }
}

/**
 * Clear all error logs
 */
export function clearAllErrorLogs(): void {
  const errorLogDir = getErrorLogDir();
  
  if (!fs.existsSync(errorLogDir)) {
    return;
  }

  try {
    const files = fs.readdirSync(errorLogDir);
    for (const file of files) {
      fs.unlinkSync(path.join(errorLogDir, file));
    }
    console.log('[ConfigGuardian] All error logs cleared');
  } catch (error) {
    console.error('[ConfigGuardian] Failed to clear error logs:', error);
  }
}

// === 新增：启动检查机制 ===

const STATUS_MARKER_FILE = 'config-guardian-status.json';

export interface ConfigGuardianStatus {
  lastError: string | null;
  lastErrorTime: string | null;
  lastRecovery: 'auto-rollback' | 'manual' | 'none' | null;
  lastRecoveryTime: string | null;
  lastBackupUsed: string | null;
  lastSuccessfulStart: string | null;
  consecutiveFailures: number;
}

/**
 * Get status marker file path
 */
function getStatusMarkerPath(): string {
  return path.join(app.getPath('userData'), STATUS_MARKER_FILE);
}

/**
 * Read current ConfigGuardian status
 */
export function getConfigGuardianStatus(): ConfigGuardianStatus {
  const markerPath = getStatusMarkerPath();
  
  if (!fs.existsSync(markerPath)) {
    return {
      lastError: null,
      lastErrorTime: null,
      lastRecovery: null,
      lastRecoveryTime: null,
      lastBackupUsed: null,
      lastSuccessfulStart: null,
      consecutiveFailures: 0
    };
  }

  try {
    const content = fs.readFileSync(markerPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      lastError: null,
      lastErrorTime: null,
      lastRecovery: null,
      lastRecoveryTime: null,
      lastBackupUsed: null,
      lastSuccessfulStart: null,
      consecutiveFailures: 0
    };
  }
}

/**
 * Update ConfigGuardian status
 */
function updateConfigGuardianStatus(updates: Partial<ConfigGuardianStatus>): void {
  const markerPath = getStatusMarkerPath();
  const current = getConfigGuardianStatus();
  const updated = { ...current, ...updates };
  
  fs.writeFileSync(markerPath, JSON.stringify(updated, null, 2));
}

/**
 * Called when Gateway fails to start - record the error
 */
export function recordGatewayFailure(error: string): void {
  const status = getConfigGuardianStatus();
  updateConfigGuardianStatus({
    lastError: error,
    lastErrorTime: new Date().toISOString(),
    consecutiveFailures: status.consecutiveFailures + 1
  });
  console.log(`[ConfigGuardian] Gateway failure recorded. Consecutive failures: ${status.consecutiveFailures + 1}`);
}

/**
 * Called when Gateway starts successfully - record success
 */
export function recordGatewaySuccess(): void {
  updateConfigGuardianStatus({
    lastSuccessfulStart: new Date().toISOString(),
    consecutiveFailures: 0,
    lastError: null,
    lastErrorTime: null
  });
  console.log('[ConfigGuardian] Gateway started successfully, failure count reset');
}

/**
 * Called when auto-rollback is attempted
 * @param backupUsed - The backup that was used
 * @param errorId - ID of the error
 * @param invalidBackups - Optional: list of invalid backups that were tried
 */
export function recordAutoRollback(backupUsed: string, errorId: string, invalidBackups?: Array<{ filename: string; error: string }>): void {
  updateConfigGuardianStatus({
    lastRecovery: 'auto-rollback',
    lastRecoveryTime: new Date().toISOString(),
    lastBackupUsed: backupUsed
  });
  console.log(`[ConfigGuardian] Auto-rollback recorded: ${backupUsed}`);
}

/**
 * Check if there was a previous error that was recovered from
 * Returns status info to display to user
 */
export function checkPreviousIssues(): {
  hadError: boolean;
  errorMessage: string | null;
  errorTime: string | null;
  wasRecovered: boolean;
  recoveryType: 'auto-rollback' | 'manual' | null;
  recoveryTime: string | null;
  backupUsed: string | null;
  consecutiveFailures: number;
} {
  const status = getConfigGuardianStatus();
  
  return {
    hadError: status.lastError !== null,
    errorMessage: status.lastError,
    errorTime: status.lastErrorTime,
    wasRecovered: status.lastRecovery !== null && status.lastRecovery !== 'none',
    recoveryType: status.lastRecovery,
    recoveryTime: status.lastRecoveryTime,
    backupUsed: status.lastBackupUsed,
    consecutiveFailures: status.consecutiveFailures
  };
}

/**
 * Clear the status marker (after user acknowledges)
 */
export function clearConfigGuardianStatus(): void {
  const markerPath = getStatusMarkerPath();
  if (fs.existsSync(markerPath)) {
    fs.unlinkSync(markerPath);
  }
  console.log('[ConfigGuardian] Status marker cleared');
}
