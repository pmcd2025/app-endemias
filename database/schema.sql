-- Criação da tabela de servidores/férias
CREATE TABLE IF NOT EXISTS public.servidores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    matricula VARCHAR(20) UNIQUE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    admissao DATE NOT NULL,
    ferias_vencidas INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para otimizar as buscas por matrícula e nome (usados na pesquisa da tela)
CREATE INDEX IF NOT EXISTS idx_servidores_matricula ON public.servidores(matricula);
CREATE INDEX IF NOT EXISTS idx_servidores_nome ON public.servidores(nome);

-- Função para atualizar o updated_at automaticamente (Opcional, útil para PostgreSQL)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para atualizar o campo updated_at
DROP TRIGGER IF EXISTS update_servidores_updated_at ON public.servidores;
CREATE TRIGGER update_servidores_updated_at
    BEFORE UPDATE ON public.servidores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
