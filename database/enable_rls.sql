-- Habilitar Row Level Security (RLS) para todas as tabelas
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_records ENABLE ROW LEVEL SECURITY;

-- Criar políticas para permitir acesso a usuários autenticados
-- (Isso bloqueia o acesso anônimo público, resolvendo a vulnerabilidade,
--  mas mantém o app funcionando para quem estiver logado)

-- absences
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.absences FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- daily_entries
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.daily_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- notifications
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- servers
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.servers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- supervisors
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.supervisors FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- users
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- vacations
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.vacations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- weekly_records
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.weekly_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
