ALTER TABLE public.servidores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir acesso total para usuários autenticados" ON public.servidores FOR ALL TO authenticated USING (true) WITH CHECK (true);
