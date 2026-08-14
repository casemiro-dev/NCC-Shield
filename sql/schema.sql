-- ============================================================================
-- NCC SHIELD — Script de Setup do Banco de Dados
-- Execute este script UMA vez no Supabase > SQL Editor (pode ser reexecutado
-- com segurança: as instruções usam IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELA DE PERFIS DE USUÁRIOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('operador', 'admin')) DEFAULT 'operador',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. TABELA DE ATENDIMENTOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atendimentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  nome_cliente TEXT NOT NULL,
  protocolo TEXT NOT NULL,
  status TEXT CHECK (status IN ('retido', 'cancelado')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ----------------------------------------------------------------------------
-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. POLÍTICAS RLS
-- ----------------------------------------------------------------------------
-- Operador lê apenas os PRÓPRIOS atendimentos (visão individual)
DROP POLICY IF EXISTS "Usuario le proprios atendimentos" ON public.atendimentos;
CREATE POLICY "Usuario le proprios atendimentos" ON public.atendimentos
  FOR SELECT USING (auth.uid() = user_id);

-- Operador insere apenas registros com o PRÓPRIO user_id
DROP POLICY IF EXISTS "Usuario cria proprios atendimentos" ON public.atendimentos;
CREATE POLICY "Usuario cria proprios atendimentos" ON public.atendimentos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Atualização/exclusão apenas dos próprios registros (prevenir abusos futuros)
DROP POLICY IF EXISTS "Usuario atualiza proprios atendimentos" ON public.atendimentos;
CREATE POLICY "Usuario atualiza proprios atendimentos" ON public.atendimentos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuario exclui proprios atendimentos" ON public.atendimentos;
CREATE POLICY "Usuario exclui proprios atendimentos" ON public.atendimentos
  FOR DELETE USING (auth.uid() = user_id);

-- Leitura de perfis (nomes para o ranking) permitida apenas a usuários logados
DROP POLICY IF EXISTS "Leitura de perfis autenticados" ON public.profiles;
CREATE POLICY "Leitura de perfis autenticados" ON public.profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 5. TRIGGER: PERFIL AUTOMÁTICO AO CRIAR USUÁRIO NO SUPABASE AUTH
--    Como criar um operador: Authentication > Users > Add user.
--    No campo "Custom User Metadata (JSON)" informe:
--      { "nome": "Nome do Operador" }
--    IMPORTANTE (segurança): o "role" NÃO deve vir de raw_user_meta_data,
--    pois o próprio usuário pode alterar o próprio metadata via API
--    (auth.updateUser). O role é lido de raw_app_meta_data, que só pode ser
--    alterado pela administração (dashboard / service role). Para definir o
--    role na criação, use o campo "App User Metadata" do dashboard do
--    Supabase, ex.: { "role": "admin" }.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'role', NEW.raw_user_meta_data->>'role', 'operador')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. FUNÇÃO RPC: RANKING AGREGADO (SECURITY DEFINER)
--    Retorna apenas estatísticas agregadas por operador — NÃO expõe os
--    atendimentos individuais (nomes de clientes/protocolos) de terceiros
--    e NÃO retorna comissão (valor é particular de cada operador; cada um
--    vê a própria comissão apenas no dashboard).
--    Chamada no frontend via: supabase.rpc('get_ranking', { p_inicio, p_fim })
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ranking(
  p_inicio TIMESTAMPTZ DEFAULT now() - interval '7 days',
  p_fim TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  posicao BIGINT,
  operador TEXT,
  total_atendimentos BIGINT,
  total_retidos BIGINT,
  total_cancelados BIGINT,
  taxa_retencao NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT
      p.id,
      p.nome AS nome_operador,
      COUNT(a.id)::BIGINT AS total,
      COUNT(a.id) FILTER (WHERE a.status = 'retido')::BIGINT AS retidos,
      COUNT(a.id) FILTER (WHERE a.status = 'cancelado')::BIGINT AS cancelados
    FROM public.profiles p
    LEFT JOIN public.atendimentos a
      ON a.user_id = p.id
      AND a.created_at >= p_inicio
      AND a.created_at < p_fim
    GROUP BY p.id, p.nome
  )
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY agg.retidos DESC,
        CASE WHEN agg.total = 0 THEN 0
             ELSE (agg.retidos::NUMERIC / agg.total) * 100 END DESC,
        agg.nome_operador ASC
    )::BIGINT AS posicao,
    agg.nome_operador,
    agg.total,
    agg.retidos,
    agg.cancelados,
    CASE WHEN agg.total = 0 THEN 0
         ELSE ROUND((agg.retidos::NUMERIC / agg.total) * 100, 1) END AS taxa_retencao
  FROM agg
  ORDER BY agg.retidos DESC,
    CASE WHEN agg.total = 0 THEN 0
         ELSE (agg.retidos::NUMERIC / agg.total) * 100 END DESC,
    agg.nome_operador ASC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. PERMISSÕES DE ACESSO
--    profiles: apenas id e nome são legíveis por usuários autenticados
--    (necessário para o ranking). E-mail e role de colegas NÃO são expostos.
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;

REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, nome) ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimentos TO authenticated;

REVOKE ALL ON FUNCTION public.get_ranking(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. FUNÇÃO RPC: PERFIL DO PRÓPRIO USUÁRIO (nome + role)
--    Como email/role de profiles não são mais legíveis via SELECT direto
--    (grants por coluna), o dashboard consulta o próprio perfil por aqui.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_meu_perfil()
RETURNS TABLE (nome TEXT, role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.nome, p.role
  FROM public.profiles p
  WHERE p.id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.get_meu_perfil() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meu_perfil() TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. MIGRAÇÃO: CRIAR PERFIS FALTANTES (INSTALAÇÕES EXISTENTES)
--    Se o trigger foi criado DEPOIS de alguns usuários do Auth, esses usuários
--    não têm linha em profiles — e não conseguiam nem salvar atendimentos
--    (FK user_id -> profiles.id) nem aparecer no ranking. Este bloco corrige:
--    cria o perfil de todo usuário do Auth que ainda não tem um.
-- ----------------------------------------------------------------------------
INSERT INTO public.profiles (id, nome, email, role)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)),
  u.email,
  COALESCE(u.raw_app_meta_data->>'role', u.raw_user_meta_data->>'role', 'operador')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;