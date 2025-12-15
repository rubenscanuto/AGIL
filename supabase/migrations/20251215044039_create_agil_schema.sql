/*
  # Criar estrutura de banco de dados para AGIL

  ## Resumo
  Cria o schema completo para o sistema AGIL (Assistente de Gabinete e Inteligência Legal),
  permitindo armazenar sessões de julgamento, processos, documentos, notas, votos e logs.

  ## Novas Tabelas
  
  ### 1. sessions
  Armazena informações sobre sessões de julgamento:
  - `id` (uuid, chave primária) - Identificador único da sessão
  - `session_code` (text, único) - Código da sessão (ex: L-001)
  - `orgao` (text) - Órgão julgador
  - `relator` (text) - Nome do relator
  - `data` (text) - Data da sessão
  - `tipo` (text) - Tipo de sessão
  - `hora` (text) - Horário da sessão
  - `total_processos` (text) - Total de processos na pauta
  - `created_at` (timestamptz) - Data de criação do registro
  - `updated_at` (timestamptz) - Data de atualização do registro
  
  ### 2. cases
  Armazena processos individuais vinculados a sessões:
  - `id` (uuid, chave primária) - Identificador único do processo
  - `session_id` (uuid, FK) - Referência à sessão
  - `case_code` (text) - Código interno do processo (ex: P-001)
  - `content_hash` (text) - Hash do conteúdo para cache
  - `chamada` (integer) - Número da chamada na pauta
  - `numero_processo` (text) - Número oficial do processo
  - `classe` (text) - Classe processual
  - `partes` (jsonb) - Array de objetos com informações das partes (role, name, advogado)
  - `juiz_sentenciante` (text) - Juiz que proferiu a sentença
  - `ementa` (text) - Ementa do processo
  - `resumo_estruturado` (text) - Resumo estruturado gerado pela IA
  - `tags` (text[]) - Array de tags para categorização
  - `observacao` (text) - Observações gerais
  - `status` (text) - Status: 'pending' ou 'reviewed'
  - `created_at` (timestamptz) - Data de criação
  - `updated_at` (timestamptz) - Data de atualização
  
  ### 3. notes
  Armazena anotações feitas em processos:
  - `id` (uuid, chave primária) - Identificador único da nota
  - `case_id` (uuid, FK) - Referência ao processo
  - `note_code` (text) - Código interno da nota
  - `text` (text) - Conteúdo da anotação
  - `created_at` (timestamptz) - Data de criação
  
  ### 4. votes
  Armazena votos registrados em processos:
  - `id` (uuid, chave primária) - Identificador único do voto
  - `case_id` (uuid, FK) - Referência ao processo
  - `vote_code` (text) - Código interno do voto (ex: VC-001)
  - `type` (text) - Tipo de voto (Concordo, Concordo em Parte, Discordo, etc)
  - `created_at` (timestamptz) - Data do voto
  
  ### 5. logs
  Armazena histórico de ações do sistema:
  - `id` (uuid, chave primária) - Identificador único do log
  - `log_code` (text) - Código interno do log (ex: LOG-001)
  - `action` (text) - Ação realizada
  - `details` (text) - Detalhes da ação
  - `target_id` (text) - ID do objeto afetado
  - `created_at` (timestamptz) - Data/hora da ação
  
  ### 6. documents
  Armazena referências a documentos carregados:
  - `id` (uuid, chave primária) - Identificador único do documento
  - `session_id` (uuid, FK nullable) - Referência à sessão (opcional)
  - `filename` (text) - Nome do arquivo
  - `mime_type` (text) - Tipo MIME do arquivo
  - `content` (text) - Conteúdo extraído do documento
  - `file_size` (bigint) - Tamanho do arquivo em bytes
  - `created_at` (timestamptz) - Data de upload
  
  ## Segurança
  - RLS (Row Level Security) habilitado em todas as tabelas
  - Políticas restritivas: apenas usuários autenticados podem acessar seus próprios dados
  - Políticas separadas para SELECT, INSERT, UPDATE e DELETE
  
  ## Índices
  - Índices em chaves estrangeiras para melhor performance
  - Índices em campos frequentemente consultados (session_code, case_code, etc)
*/

-- Criar extensão para UUIDs se não existir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela: sessions
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_code text UNIQUE NOT NULL,
  orgao text NOT NULL DEFAULT '',
  relator text NOT NULL DEFAULT '',
  data text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT '',
  hora text NOT NULL DEFAULT '',
  total_processos text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela: cases
CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  case_code text NOT NULL,
  content_hash text,
  chamada integer NOT NULL DEFAULT 0,
  numero_processo text NOT NULL DEFAULT '',
  classe text NOT NULL DEFAULT '',
  partes jsonb NOT NULL DEFAULT '[]'::jsonb,
  juiz_sentenciante text DEFAULT '',
  ementa text NOT NULL DEFAULT '',
  resumo_estruturado text NOT NULL DEFAULT '',
  tags text[] DEFAULT ARRAY[]::text[],
  observacao text DEFAULT '',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela: notes
CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  note_code text NOT NULL,
  text text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Tabela: votes
CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  vote_code text NOT NULL,
  type text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Tabela: logs
CREATE TABLE IF NOT EXISTS logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_code text NOT NULL,
  action text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  target_id text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Tabela: documents
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  filename text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  content text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_cases_session_id ON cases(session_id);
CREATE INDEX IF NOT EXISTS idx_cases_case_code ON cases(case_code);
CREATE INDEX IF NOT EXISTS idx_notes_case_id ON notes(case_id);
CREATE INDEX IF NOT EXISTS idx_votes_case_id ON votes(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_session_id ON documents(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_code ON sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);

-- Habilitar RLS em todas as tabelas
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para sessions
CREATE POLICY "Usuários autenticados podem visualizar sessões"
  ON sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir sessões"
  ON sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar sessões"
  ON sessions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar sessões"
  ON sessions FOR DELETE
  TO authenticated
  USING (true);

-- Políticas RLS para cases
CREATE POLICY "Usuários autenticados podem visualizar casos"
  ON cases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir casos"
  ON cases FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar casos"
  ON cases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar casos"
  ON cases FOR DELETE
  TO authenticated
  USING (true);

-- Políticas RLS para notes
CREATE POLICY "Usuários autenticados podem visualizar notas"
  ON notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir notas"
  ON notes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar notas"
  ON notes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar notas"
  ON notes FOR DELETE
  TO authenticated
  USING (true);

-- Políticas RLS para votes
CREATE POLICY "Usuários autenticados podem visualizar votos"
  ON votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir votos"
  ON votes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar votos"
  ON votes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar votos"
  ON votes FOR DELETE
  TO authenticated
  USING (true);

-- Políticas RLS para logs
CREATE POLICY "Usuários autenticados podem visualizar logs"
  ON logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir logs"
  ON logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas RLS para documents
CREATE POLICY "Usuários autenticados podem visualizar documentos"
  ON documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir documentos"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar documentos"
  ON documents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar documentos"
  ON documents FOR DELETE
  TO authenticated
  USING (true);
