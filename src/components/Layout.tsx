
import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ProfileModal from './ProfileModal';

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, userProfile } = useAuth();

  const allNavItems = [
    { label: 'Início', icon: 'dashboard', path: '/' },
    { label: 'Ponto', icon: 'schedule', path: '/ponto' },
    { label: 'Servidores', icon: 'dns', path: '/servers' },
    { label: 'Relatórios', icon: 'analytics', path: '/reports' },
    { label: 'Usuários', icon: 'group', path: '/users', adminOnly: true }
  ];

  // Filtrar itens de navegação baseado no role do usuário
  const navItems = allNavItems.filter(item => {
    if (item.adminOnly && userProfile?.role !== 'super_admin') {
      return false;
    }
    return true;
  });

  const NavContent = () => (
    <>
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex md:flex-row flex-col items-center md:justify-start justify-center gap-3 md:px-4 md:py-3 md:rounded-xl transition-colors ${isActive
              ? 'text-primary md:bg-primary/10'
              : 'text-gray-500 hover:text-gray-300 md:hover:bg-white/5'
              }`}
          >
            <span className={`material-symbols-outlined ${isActive ? 'fill-1' : ''}`}>
              {item.icon}
            </span>
            <span className={`text-[10px] md:text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </>
  );

  // State for Profile Modal
  const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background-dark text-white flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-[#1c2127] border-r border-gray-800 p-4 shrink-0 transition-all">
        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-white">schedule</span>
          </div>
          <h1 className="font-bold text-lg tracking-tight">Divisão de Endemias</h1>
        </div>

        {/* User Profile Summary */}
        <div
          onClick={() => setIsProfileModalOpen(true)}
          className="mx-2 mb-6 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-gray-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-gray-700 shrink-0 overflow-hidden ring-2 ring-transparent group-hover:ring-primary/50 transition-all">
              <img
                src={userProfile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.name || 'User')}&background=3b82f6&color=fff`}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{userProfile?.name || 'Usuário'}</p>
              <p className="text-xs text-gray-400 truncate capitalize">{userProfile?.role?.replace('_', ' ') || 'Cargo'}</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          <NavContent />
        </nav>

        <div className="mt-auto pt-8 border-t border-gray-800">
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Header with Profile */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#1c2127] border-b border-gray-800 sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-lg">schedule</span>
            </div>
            <span className="font-semibold text-sm">Divisão de Endemias</span>
          </div>
          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-2 py-1.5 px-2 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 border border-gray-700/50 transition-all"
          >
            <div className="size-7 rounded-full overflow-hidden ring-2 ring-primary/30">
              <img
                src={userProfile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.name || 'User')}&background=3b82f6&color=fff`}
                alt="Perfil"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="material-symbols-outlined text-gray-400 text-lg">expand_more</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide pb-24 md:pb-0">
          <div className="w-full max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 z-50 w-full bg-[#1c2127]/95 backdrop-blur-md border-t border-gray-800 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
        <div className={`grid h-16 ${navItems.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <NavContent />
        </div>
      </nav>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  );
};

export default Layout;
