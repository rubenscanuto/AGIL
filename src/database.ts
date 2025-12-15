import { supabase } from './supabaseClient';

export interface Party {
  role: string;
  name: string;
  advogado?: string;
}

export interface SessionMetadata {
  id?: string;
  createdAt?: number;
  orgao: string;
  relator: string;
  data: string;
  tipo: string;
  hora: string;
  total_processos: string;
}

export interface NoteData {
  id: string;
  text: string;
  createdAt: number;
}

export interface VoteData {
  id: string;
  type: string;
  timestamp: number;
}

export interface CaseData {
  internalId: string;
  contentHash?: string;
  chamada: number;
  numero_processo: string;
  classe: string;
  partes: Party[];
  juiz_sentenciante?: string;
  ementa: string;
  resumo_estruturado: string;
  tags?: string[];
  observacao?: string;
  notes?: NoteData;
  status?: 'pending' | 'reviewed';
  voto?: VoteData;
}

export interface SavedSession {
  id: string;
  metadata: SessionMetadata;
  cases: CaseData[];
  dateSaved: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  action: string;
  details: string;
  targetId?: string;
}

export const database = {
  async saveSession(session: SavedSession) {
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .upsert({
        session_code: session.id,
        orgao: session.metadata.orgao,
        relator: session.metadata.relator,
        data: session.metadata.data,
        tipo: session.metadata.tipo,
        hora: session.metadata.hora,
        total_processos: session.metadata.total_processos,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_code' })
      .select()
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!sessionData) throw new Error('Failed to save session');

    for (const caseItem of session.cases) {
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .upsert({
          session_id: sessionData.id,
          case_code: caseItem.internalId,
          content_hash: caseItem.contentHash,
          chamada: caseItem.chamada,
          numero_processo: caseItem.numero_processo,
          classe: caseItem.classe,
          partes: caseItem.partes,
          juiz_sentenciante: caseItem.juiz_sentenciante || '',
          ementa: caseItem.ementa,
          resumo_estruturado: caseItem.resumo_estruturado,
          tags: caseItem.tags || [],
          observacao: caseItem.observacao || '',
          status: caseItem.status || 'pending',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'case_code' })
        .select()
        .maybeSingle();

      if (caseError) throw caseError;
      if (!caseData) continue;

      if (caseItem.notes) {
        await supabase
          .from('notes')
          .delete()
          .eq('case_id', caseData.id);

        await supabase
          .from('notes')
          .insert({
            case_id: caseData.id,
            note_code: caseItem.notes.id,
            text: caseItem.notes.text,
            created_at: new Date(caseItem.notes.createdAt).toISOString(),
          });
      }

      if (caseItem.voto) {
        await supabase
          .from('votes')
          .delete()
          .eq('case_id', caseData.id);

        await supabase
          .from('votes')
          .insert({
            case_id: caseData.id,
            vote_code: caseItem.voto.id,
            type: caseItem.voto.type,
            created_at: new Date(caseItem.voto.timestamp).toISOString(),
          });
      }
    }

    return sessionData;
  },

  async getSessions(): Promise<SavedSession[]> {
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (sessionsError) throw sessionsError;
    if (!sessions) return [];

    const result: SavedSession[] = [];

    for (const session of sessions) {
      const { data: cases, error: casesError } = await supabase
        .from('cases')
        .select(`
          *,
          notes(*),
          votes(*)
        `)
        .eq('session_id', session.id)
        .order('chamada', { ascending: true });

      if (casesError) throw casesError;

      const formattedCases: CaseData[] = (cases || []).map((c: any) => ({
        internalId: c.case_code,
        contentHash: c.content_hash,
        chamada: c.chamada,
        numero_processo: c.numero_processo,
        classe: c.classe,
        partes: c.partes,
        juiz_sentenciante: c.juiz_sentenciante,
        ementa: c.ementa,
        resumo_estruturado: c.resumo_estruturado,
        tags: c.tags || [],
        observacao: c.observacao,
        status: c.status,
        notes: c.notes && c.notes.length > 0 ? {
          id: c.notes[0].note_code,
          text: c.notes[0].text,
          createdAt: new Date(c.notes[0].created_at).getTime(),
        } : undefined,
        voto: c.votes && c.votes.length > 0 ? {
          id: c.votes[0].vote_code,
          type: c.votes[0].type,
          timestamp: new Date(c.votes[0].created_at).getTime(),
        } : undefined,
      }));

      result.push({
        id: session.session_code,
        metadata: {
          id: session.session_code,
          createdAt: new Date(session.created_at).getTime(),
          orgao: session.orgao,
          relator: session.relator,
          data: session.data,
          tipo: session.tipo,
          hora: session.hora,
          total_processos: session.total_processos,
        },
        cases: formattedCases,
        dateSaved: new Date(session.created_at).getTime(),
      });
    }

    return result;
  },

  async deleteSession(sessionCode: string) {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('session_code', sessionCode);

    if (error) throw error;
  },

  async saveLog(log: LogEntry) {
    const { error } = await supabase
      .from('logs')
      .insert({
        log_code: log.id,
        action: log.action,
        details: log.details,
        target_id: log.targetId || '',
        created_at: new Date(log.timestamp).toISOString(),
      });

    if (error) throw error;
  },

  async getLogs(): Promise<LogEntry[]> {
    const { data, error } = await supabase
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw error;
    if (!data) return [];

    return data.map(log => ({
      id: log.log_code,
      timestamp: new Date(log.created_at).getTime(),
      action: log.action,
      details: log.details,
      targetId: log.target_id,
    }));
  },

  async saveDocument(filename: string, mimeType: string, content: string, fileSize: number, sessionId?: string) {
    const sessionUuid = sessionId ? await this.getSessionUuid(sessionId) : null;

    const { data, error } = await supabase
      .from('documents')
      .insert({
        session_id: sessionUuid,
        filename,
        mime_type: mimeType,
        content,
        file_size: fileSize,
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getSessionUuid(sessionCode: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('session_code', sessionCode)
      .maybeSingle();

    if (error) throw error;
    return data?.id || null;
  },
};
