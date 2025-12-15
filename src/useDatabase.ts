import { useState, useEffect, useCallback } from 'react';
import { database, SavedSession, LogEntry } from './database';

export function useDatabase() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveSession = useCallback(async (session: SavedSession) => {
    setIsLoading(true);
    setError(null);
    try {
      await database.saveSession(session);
      return true;
    } catch (err) {
      console.error('Error saving session:', err);
      setError(err instanceof Error ? err.message : 'Failed to save session');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSessions = useCallback(async (): Promise<SavedSession[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const sessions = await database.getSessions();
      return sessions;
    } catch (err) {
      console.error('Error loading sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteSession = useCallback(async (sessionCode: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await database.deleteSession(sessionCode);
      return true;
    } catch (err) {
      console.error('Error deleting session:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete session');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveLog = useCallback(async (log: LogEntry) => {
    try {
      await database.saveLog(log);
    } catch (err) {
      console.error('Error saving log:', err);
    }
  }, []);

  const getLogs = useCallback(async (): Promise<LogEntry[]> => {
    try {
      return await database.getLogs();
    } catch (err) {
      console.error('Error loading logs:', err);
      return [];
    }
  }, []);

  const saveDocument = useCallback(async (
    filename: string,
    mimeType: string,
    content: string,
    fileSize: number,
    sessionId?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      await database.saveDocument(filename, mimeType, content, fileSize, sessionId);
      return true;
    } catch (err) {
      console.error('Error saving document:', err);
      setError(err instanceof Error ? err.message : 'Failed to save document');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    saveSession,
    getSessions,
    deleteSession,
    saveLog,
    getLogs,
    saveDocument,
    isLoading,
    error,
  };
}
