
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else if (data.user) {
        navigate('/');
      }
    } catch (err) {
      setError('Ocorreu um erro inesperado. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col justify-center bg-background-dark px-5 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-[400px]">
        {/* Cabeçalho */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <span className="material-symbols-outlined text-[40px] text-primary">dns</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Bem-vindo de volta</h1>
          <p className="text-base font-normal text-slate-400">Entre para acessar seu painel</p>
        </div>

        {/* Mensagem de Erro */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error === 'Invalid login credentials' ? 'Credenciais inválidas. Verifique seu e-mail e senha.' : error}
          </div>
        )}

        {/* Formulário */}
        <form className="flex flex-col gap-5" onSubmit={handleLogin}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium leading-none text-white">E-mail</label>
            <div className="relative flex items-center">
              <span className="absolute left-4 flex items-center text-slate-400">
                <span className="material-symbols-outlined text-[20px]">person</span>
              </span>
              <input
                className="flex h-14 w-full rounded-lg border border-[#3b4754] bg-[#1c2127] px-4 pl-11 text-base text-white placeholder:text-[#9dabb9] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Digite seu email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium leading-none text-white">Senha</label>
            <div className="relative flex items-center">
              <span className="absolute left-4 flex items-center text-slate-400">
                <span className="material-symbols-outlined text-[20px]">lock</span>
              </span>
              <input
                className="flex h-14 w-full rounded-lg border border-[#3b4754] bg-[#1c2127] px-4 pl-11 pr-12 text-base text-white placeholder:text-[#9dabb9] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                className="absolute right-4 flex items-center text-slate-400 hover:text-white transition-colors"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
            <div className="mt-1 flex justify-end">
              <button type="button" className="text-sm font-medium text-primary hover:text-blue-500">
                Esqueceu a senha?
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 flex h-14 w-full items-center justify-center rounded-lg bg-primary text-base font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-sm text-slate-400">
            Precisa de ajuda? <button className="font-medium text-primary hover:text-blue-500">Contate o Suporte</button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

