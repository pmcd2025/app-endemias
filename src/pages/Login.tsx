
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

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

  const getErrorMessage = (msg: string) => {
    if (msg === 'Invalid login credentials') return 'Credenciais inválidas. Verifique seu e-mail e senha.';
    if (msg.includes('Email not confirmed')) return 'E-mail não confirmado. Verifique sua caixa de entrada.';
    return msg;
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0a0a0c]">
      {/* Ambient Background Effects */}
      <div className="pointer-events-none absolute inset-0">
        {/* Primary gradient orb */}
        <div
          className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.07]"
          style={{
            background: 'radial-gradient(circle, #007AFF 0%, transparent 70%)',
          }}
        />
        {/* Secondary gradient orb */}
        <div
          className="absolute bottom-[-30%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.05]"
          style={{
            background: 'radial-gradient(circle, #5856D6 0%, transparent 70%)',
          }}
        />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), 
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* Main Card */}
      <div
        className={`relative z-10 w-full max-w-[420px] mx-4 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
      >
        {/* Glass Card */}
        <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 sm:p-10 backdrop-blur-2xl shadow-[0_32px_80px_rgba(0,0,0,0.5)]">
          {/* Top glow accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          {/* Logo & Branding */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined text-[30px] text-white fill-1">schedule</span>
              </div>
              {/* Subtle pulse ring */}
              <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Divisão de Endemias
            </h1>
            <p className="mt-1.5 text-sm text-text-secondary">
              Sistema de Controle de Ponto
            </p>
          </div>

          {/* Divider */}
          <div className="mb-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Error Alert */}
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-danger/10 border border-danger/20 p-3.5 animate-[shake_0.3s_ease-in-out]">
              <span className="material-symbols-outlined text-danger text-lg mt-0.5 shrink-0">error</span>
              <p className="text-sm text-danger/90 leading-snug">{getErrorMessage(error)}</p>
            </div>
          )}

          {/* Form */}
          <form className="flex flex-col gap-4" onSubmit={handleLogin}>
            {/* Email Field */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary pl-0.5">
                E-mail
              </label>
              <input
                className="h-[52px] w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-[15px] text-white placeholder:text-text-tertiary/50 focus:border-primary/50 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                placeholder="Digite seu e-mail"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                required
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                data-form-type="other"
              />
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary pl-0.5">
                Senha
              </label>
              <div className="relative">
                <input
                  className="h-[52px] w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-4 pr-14 text-[15px] text-white placeholder:text-text-tertiary/50 focus:border-primary/50 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all duration-200"
                  placeholder="Digite sua senha"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  required
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore
                  data-form-type="other"
                />
                <button
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-lg text-text-tertiary hover:text-white hover:bg-white/[0.06] active:bg-white/[0.1] focus:text-white transition-all duration-200"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="group relative mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-[15px] text-white transition-all duration-200 hover:brightness-110 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-none overflow-hidden"
            >
              {/* Button shimmer effect */}
              {!loading && (
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              )}

              {loading ? (
                <div className="flex items-center gap-2.5">
                  <svg className="animate-spin h-4.5 w-4.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Autenticando...</span>
                </div>
              ) : (
                <>
                  <span>Entrar</span>
                  <span className="material-symbols-outlined text-lg transition-transform duration-200 group-hover:translate-x-0.5">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Bottom Divider */}
          <div className="mt-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Footer */}
          <div className="mt-5 text-center">
            <p className="text-xs text-text-tertiary leading-relaxed">
              Acesso restrito a servidores autorizados
            </p>
          </div>
        </div>

        {/* Version / Copyright below the card */}
        <p className="mt-6 text-center text-[11px] text-text-tertiary/60 tracking-wide">
          PMCD Itabúna · v2.0
        </p>
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};

export default Login;
