/**
 * 功能中心页面
 * 显示网关运行日志和回滚日志
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  AlertTriangle, 
  Info,
  Download, 
  RefreshCw, 
  Search,
  Terminal,
  ArrowLeft,
  Clock,
  History,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FolderOpen
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';

interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

interface ErrorLog {
  id: string;
  timestamp: string;
  type: 'error' | 'rollback';
  error?: string;
  backupUsed?: string;
  recovery?: string;
  errorId?: string;
  stack?: string;
  configPath?: string;
  invalidBackups?: Array<{ filename: string; error: string }>;
  rollbackAttempts?: number;
}

interface LastRollbackInfo {
  timestamp: string;
  backupUsed: string;
  errorMessage?: string;
  recoveryType?: string;
  stack?: string;
  configPath?: string;
}

type TabType = 'gateway' | 'rollback';

export function Logs() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('gateway');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [lastRollback, setLastRollback] = useState<LastRollbackInfo | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | ErrorLog | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [backupPath, setBackupPath] = useState<string>('');
  const [defaultBackupPath, setDefaultBackupPath] = useState<string>('');
  const [isEditingBackupPath, setIsEditingBackupPath] = useState(false);
  const [backupList, setBackupList] = useState<Array<{ name: string; path: string; time: number; createdAt: string; size?: number }>>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch backup paths
  const fetchBackupPath = useCallback(async () => {
    try {
      const [customPath, defaultPath] = await Promise.all([
        window.electron.ipcRenderer.invoke('log:getBackupPath') as Promise<string | null>,
        window.electron.ipcRenderer.invoke('log:getDefaultBackupPath') as Promise<string>
      ]);
      // customPath is base path, defaultPath is full path with config-backups
      setBackupPath(customPath ? `${customPath}\\config-backups` : defaultPath);
      setDefaultBackupPath(defaultPath);
    } catch (error) {
      console.error('Failed to fetch backup path:', error);
    }
  }, []);

  // Fetch backup list
  const fetchBackupList = useCallback(async () => {
    try {
      const list = await window.electron.ipcRenderer.invoke('log:getBackupList') as Array<{ name: string; path: string; time: number; createdAt: string; size?: number }>;
      setBackupList(list || []);
    } catch (error) {
      console.error('Failed to fetch backup list:', error);
    }
  }, []);

  // Restore from specific backup
  const restoreFromBackup = useCallback(async (backupName: string) => {
    try {
      setIsRestoring(true);
      
      // First stop the gateway
      await window.electron.ipcRenderer.invoke('gateway:stop');
      
      // Restore the backup
      const success = await window.electron.ipcRenderer.invoke('log:restoreFromBackup', backupName) as boolean;
      
      if (success) {
        alert(`已从备份 "${backupName}" 恢复配置，正在重启网关...`);
        
        // Restart gateway
        await window.electron.ipcRenderer.invoke('gateway:start');
        
        // Refresh data
        fetchBackupList();
      } else {
        alert('恢复失败');
        // Try to restart gateway anyway
        await window.electron.ipcRenderer.invoke('gateway:start');
      }
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      alert('恢复失败');
      // Try to restart gateway anyway
      try {
        await window.electron.ipcRenderer.invoke('gateway:start');
      } catch (e) {
        console.error('Failed to restart gateway:', e);
      }
    } finally {
      setIsRestoring(false);
    }
  }, [fetchBackupList]);

  // Save backup path
  const saveBackupPath = useCallback(async (newPath: string) => {
    try {
      const success = await window.electron.ipcRenderer.invoke('log:setBackupPath', newPath) as boolean;
      if (success) {
        setBackupPath(newPath);
        setIsEditingBackupPath(false);
      }
      return success;
    } catch (error) {
      console.error('Failed to save backup path:', error);
      return false;
    }
  }, []);

  // Fetch gateway logs
  const fetchGatewayLogs = useCallback(async () => {
    try {
      const logData = await window.electron.ipcRenderer.invoke('log:getRecent', 500) as string[];
      
      if (Array.isArray(logData)) {
        const parsed: LogEntry[] = [];
        for (const line of logData) {
          const match = line.match(/^\[(.+?)\] \[(\w+)\] (.+)$/);
          if (match) {
            parsed.push({
              timestamp: match[1],
              level: match[2] as LogEntry['level'],
              message: match[3],
            });
          } else if (line.trim()) {
            parsed.push({
              timestamp: '',
              level: 'INFO',
              message: line,
            });
          }
        }
        setLogs(parsed);
      }
    } catch (error) {
      console.error('Failed to fetch gateway logs:', error);
      setLogs([]);
    }
  }, []);

  // Fetch all error/rollback logs
  const fetchErrorLogs = useCallback(async () => {
    try {
      const data = await window.electron.ipcRenderer.invoke('log:getAllErrorLogs') as ErrorLog[];
      setErrorLogs(data || []);
      
      // Find last rollback
      const rollback = data?.find(e => e.type === 'rollback');
      if (rollback) {
        setLastRollback({
          timestamp: rollback.timestamp,
          backupUsed: rollback.backupUsed || '',
          errorMessage: rollback.error,
          recoveryType: rollback.recovery,
          stack: rollback.stack,
          configPath: rollback.configPath
        });
      }
    } catch (error) {
      console.error('Failed to fetch error logs:', error);
      setErrorLogs([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchErrorLogs();
    fetchGatewayLogs();
    fetchBackupPath();
    fetchBackupList();
  }, [fetchErrorLogs, fetchGatewayLogs, fetchBackupPath, fetchBackupList]);

  // Auto refresh gateway logs
  useEffect(() => {
    if (autoRefresh && activeTab === 'gateway') {
      refreshTimerRef.current = setInterval(() => {
        fetchGatewayLogs();
      }, 3000);
    }
    
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, activeTab, fetchGatewayLogs]);

  // Filter logs
  const filteredLogs = (logs || []).filter(log => {
    if (filterLevel !== 'all' && log.level.toLowerCase() !== filterLevel) {
      return false;
    }
    if (searchQuery) {
      return log.message.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  // Format timestamp
  const formatTimestamp = (ts: string) => {
    if (!ts) return '';
    try {
      const date = new Date(ts);
      return date.toLocaleString('zh-CN', { 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return ts;
    }
  };

  // Get level badge
  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
        return <Badge variant="destructive">ERROR</Badge>;
      case 'WARN':
        return <Badge variant="warning" className="bg-yellow-500/20 text-yellow-500">WARN</Badge>;
      case 'INFO':
        return <Badge variant="secondary">INFO</Badge>;
      case 'DEBUG':
        return <Badge variant="outline">DEBUG</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {t('logs', { defaultValue: '备份与恢复' })}
            </h1>
            <p className="text-muted-foreground">
              {t('logsDescription', { defaultValue: '网关运行日志、回滚历史与备份记录' })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={autoRefresh ? "default" : "outline"} 
            size="sm" 
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? '实时' : '暂停'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            fetchGatewayLogs();
            fetchErrorLogs();
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('refresh', { defaultValue: '刷新' })}
          </Button>
        </div>
      </div>

      {/* Backup Path Setting */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">备份存放路径</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditingBackupPath ? (
            <div className="flex gap-2">
              <Input
                value={backupPath}
                onChange={(e) => setBackupPath(e.target.value)}
                placeholder="输入备份基础路径..."
                className="flex-1"
              />
              <Button size="sm" onClick={() => saveBackupPath(backupPath)}>保存</Button>
              <Button size="sm" variant="outline" onClick={() => {
                setIsEditingBackupPath(false);
                fetchBackupPath();
              }}>取消</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground flex-1 truncate" title={backupPath}>
                {backupPath}
              </span>
              <Button size="sm" variant="outline" onClick={() => setIsEditingBackupPath(true)}>
                修改
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">备份文件列表</CardTitle>
          <CardDescription>点击选择备份进行回滚</CardDescription>
        </CardHeader>
        <CardContent>
          {backupList.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无备份文件</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {backupList.map((backup) => (
                <div
                  key={backup.name}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => restoreFromBackup(backup.name)}
                >
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{backup.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(backup.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    disabled={isRestoring}
                    onClick={(e) => {
                      e.stopPropagation();
                      restoreFromBackup(backup.name);
                    }}
                  >
                    回滚
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last Rollback Info Card */}
      {lastRollback && (
        <Card className="border-orange-500/50 bg-orange-500/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              最近一次回滚
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatTimestamp(lastRollback.timestamp)}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>备份: {lastRollback.backupUsed}</span>
              </div>
              {lastRollback.recoveryType && (
                <Badge variant="outline">{lastRollback.recoveryType}</Badge>
              )}
            </div>
            {lastRollback.relatedError && (
              <p className="mt-2 text-xs text-orange-600 flex items-start gap-1">
                <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                触发回滚: {lastRollback.relatedError.error?.substring(0, 60)}...
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats - Compact row */}
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 rounded-lg">
          <span className="text-red-500 font-medium">ERROR:</span>
          <span className="font-bold text-red-500">{(logs || []).filter(l => l.level === 'ERROR').length}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 rounded-lg">
          <span className="text-yellow-500 font-medium">WARN:</span>
          <span className="font-bold text-yellow-500">{(logs || []).filter(l => l.level === 'WARN').length}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 rounded-lg">
          <span className="text-orange-500 font-medium">回滚:</span>
          <span className="font-bold text-orange-500">{errorLogs.filter(l => l.type === 'rollback').length}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
          <span className="text-muted-foreground font-medium">错误:</span>
          <span className="font-bold">{errorLogs.filter(l => l.type === 'error').length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'gateway' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('gateway')}
        >
          <Terminal className="h-4 w-4 mr-2" />
          网关日志
        </Button>
        <Button
          variant={activeTab === 'rollback' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('rollback')}
        >
          <History className="h-4 w-4 mr-2" />
          回滚历史
        </Button>
      </div>

      {/* Filters (only for gateway logs) */}
      {activeTab === 'gateway' && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4">
              <select 
                value={filterLevel} 
                onChange={(e) => setFilterLevel(e.target.value)}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')] pr-10 w-[150px]"
              >
                <option value="all">全部级别</option>
                <option value="error">ERROR</option>
                <option value="warn">WARN</option>
                <option value="info">INFO</option>
                <option value="debug">DEBUG</option>
              </select>

              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索日志..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gateway Logs */}
      {activeTab === 'gateway' && (
        <Card>
          <CardHeader>
            <CardTitle>网关运行日志</CardTitle>
            <CardDescription>
              共 {filteredLogs.length} 条日志 {autoRefresh && <span className="text-green-500">● 实时</span>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[500px] overflow-auto" ref={logContainerRef}>
              <div className="space-y-1">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>暂无日志</p>
                  </div>
                ) : (
                  filteredLogs.map((log, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                        log.level === 'ERROR' ? 'bg-red-500/10' : ''
                      } ${log.level === 'WARN' ? 'bg-yellow-500/10' : ''}`}
                      onClick={() => {
                        setSelectedLog(log);
                        setShowDetailDialog(true);
                      }}
                    >
                      <span className="text-xs text-muted-foreground font-mono w-24 shrink-0">
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <div className="w-16 shrink-0">
                        {getLevelBadge(log.level)}
                      </div>
                      <span className={`font-mono text-sm flex-1 ${
                        log.level === 'ERROR' ? 'text-red-500' :
                        log.level === 'WARN' ? 'text-yellow-500' :
                        'text-foreground'
                      }`}>
                        {(log.message || '').length > 120 
                          ? log.message.substring(0, 120) + '...'
                          : log.message
                        }
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rollback History */}
      {activeTab === 'rollback' && (
        <Card>
          <CardHeader>
            <CardTitle>回滚历史</CardTitle>
            <CardDescription>
              共 {errorLogs.length} 条记录
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {errorLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无回滚记录</p>
                </div>
              ) : (
                errorLogs.map((log, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                      log.type === 'rollback' ? 'bg-orange-500/10 border-l-4 border-orange-500' : 'bg-red-500/10 border-l-4 border-red-500'
                    }`}
                    onClick={() => {
                      setSelectedLog(log);
                      setShowDetailDialog(true);
                    }}
                  >
                    {log.type === 'rollback' ? (
                      <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={log.type === 'rollback' ? 'default' : 'destructive'}>
                          {log.type === 'rollback' ? '回滚' : '错误'}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      {log.type === 'rollback' && log.backupUsed && (
                        <p className="text-sm mt-1 flex items-center gap-2">
                          <FileText className="h-3 w-3" />
                          备份: <span className="font-medium">{log.backupUsed}</span>
                        </p>
                      )}
                      {log.type === 'rollback' && log.relatedError && (
                        <p className="text-xs mt-1 text-muted-foreground flex items-start gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                          触发回滚的错误: {log.relatedError.error?.substring(0, 60)}...
                        </p>
                      )}
                      {log.type === 'error' && log.error && (
                        <p className="text-sm mt-1 text-red-500">错误: {log.error?.substring(0, 100)}...</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      {showDetailDialog && selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50" 
            onClick={() => setShowDetailDialog(false)}
          />
          <div className="relative z-10 bg-background border rounded-lg shadow-lg p-6 max-w-3xl w-full max-h-[80vh] overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {'level' in selectedLog && selectedLog.level === 'ERROR' && <AlertTriangle className="h-5 w-5 text-red-500" />}
                {'level' in selectedLog && selectedLog.level === 'WARN' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                {'type' in selectedLog && selectedLog.type === 'rollback' && <History className="h-5 w-5 text-orange-500" />}
                {'type' in selectedLog && selectedLog.type === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
                {'level' in selectedLog ? '日志详情' : '事件详情'}
              </h2>
              <span className="text-sm text-muted-foreground">
                {'timestamp' in selectedLog && formatTimestamp(selectedLog.timestamp)}
              </span>
            </div>

            {/* Level/Type */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-muted-foreground">类型:</span>
              {'level' in selectedLog && getLevelBadge(selectedLog.level)}
              {'type' in selectedLog && (
                <Badge variant={selectedLog.type === 'rollback' ? 'default' : 'destructive'}>
                  {selectedLog.type === 'rollback' ? '回滚' : '错误'}
                </Badge>
              )}
            </div>
            
            {/* Message */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">
                {'message' in selectedLog ? '消息' : '内容'}
              </label>
              <div className="bg-muted p-4 rounded-lg font-mono text-sm max-h-[300px] overflow-auto whitespace-pre-wrap">
                {'message' in selectedLog ? selectedLog.message : JSON.stringify(selectedLog, null, 2)}
              </div>
            </div>

            {/* Invalid Backups Warning */}
            {'type' in selectedLog && selectedLog.type === 'rollback' && selectedLog.invalidBackups && selectedLog.invalidBackups.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium text-yellow-500">
                    跳过无效备份 ({selectedLog.invalidBackups.length} 个)
                  </span>
                </div>
                <div className="space-y-1">
                  {selectedLog.invalidBackups.map((invalid, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground">
                      - {invalid.filename}: {invalid.error.substring(0, 60)}...
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Raw Data */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">原始数据</label>
              <div className="bg-muted p-4 rounded-lg font-mono text-xs max-h-[200px] overflow-auto">
                {JSON.stringify(selectedLog, null, 2)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                关闭
              </Button>
              <Button 
                variant="default"
                onClick={() => {
                  const text = 'message' in selectedLog ? selectedLog.message : JSON.stringify(selectedLog, null, 2);
                  navigator.clipboard.writeText(text);
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                复制
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Logs;
