
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database, UpdateTables } from '../lib/database.types';
import AddUserModal from '../components/AddUserModal';
import EditUserModal from '../components/EditUserModal';
import { ROLE_DB_VALUES, ROLE_LABELS } from '../lib/constants';

type User = Database['public']['Tables']['users']['Row'];


// Fallback static data in case DB is empty or connection fails
const STATIC_USERS = [
  { id: '1', name: 'Admin Principal', role: 'Super Admin', email: 'admin@system.com', avatar_url: 'https://i.pravatar.cc/150?u=admin', last_login_at: 'Agora mesmo' },
  { id: '2', name: 'Beatriz Santos', role: 'Gestor RH', email: 'beatriz.s@company.com', avatar_url: 'https://i.pravatar.cc/150?u=beatriz', last_login_at: 'Há 1 hour' },
  { id: '3', name: 'Carlos Eduardo', role: 'Supervisor', email: 'cadu.edu@company.com', avatar_url: 'https://i.pravatar.cc/150?u=carlos', last_login_at: 'Ontem' },
  { id: '4', name: 'Fernanda Lima', role: 'Analista', email: 'f.lima@company.com', avatar_url: 'https://i.pravatar.cc/150?u=fernanda', last_login_at: 'Há 3 dias' }
];

const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState('Todos');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching users:', error);
        // Fallback to static if empty or error (optional, mostly for demo purposes)
        // setUsers(STATIC_USERS as any); 
      } else {
        if (data && data.length > 0) {
          setUsers(data);
        } else {
          // If no users in DB yet, maybe show static ones or empty?
          // Let's mix them or just show nothing? 
          // The prompt implies functionality, so let's stick to DB + local optimistic update
          setUsers([]);
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (newUser: {
    name: string;
    role: string;
    email: string;
    password?: string;
    supervisor_geral_id?: string;
    supervisor_area_id?: string;
  }) => {
    console.log('Adding user:', newUser);

    if (!newUser.password) {
      alert('Senha é obrigatória para criar usuário.');
      return;
    }

    try {
      // Chamar Edge Function para criar usuário com autenticação
      const response = await fetch('https://kcfhpgviahnycusjlonj.supabase.co/functions/v1/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          name: newUser.name,
          role: newUser.role,
          supervisor_geral_id: newUser.supervisor_geral_id || null,
          supervisor_area_id: newUser.supervisor_area_id || null
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error adding user:', result.error);
        alert('Erro ao adicionar usuário: ' + result.error);
        return;
      }

      if (result.user) {
        setUsers(prev => [result.user, ...prev]);
        alert('Usuário adicionado com sucesso! Agora ele pode fazer login.');
      }
    } catch (err) {
      console.error('Unexpected error adding user:', err);
      alert('Erro inesperado ao adicionar usuário.');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir usuário.');
    }
  };

  const handleUpdateUser = async (updatedUser: User) => {
    try {
      const updatePayload: UpdateTables<'users'> = {
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        supervisor_geral_id: updatedUser.supervisor_geral_id,
        supervisor_area_id: updatedUser.supervisor_area_id,
        avatar_url: updatedUser.avatar_url
      };

      const { error } = await (supabase.from('users') as any)
        .update(updatePayload)
        .eq('id', updatedUser.id);

      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      setEditingUser(null);
      alert('Usuário atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao atualizar:', err);
      alert('Erro ao atualizar usuário.');
    }
  };

  const filteredUsers = users.filter(user => {
    if (selectedRole === 'Todos') return true;
    // selectedRole is the Label (e.g. "Coordenação") if selected from chips
    // user.role is DB Value (e.g. "admin")
    // So we need to match user.role to the DB value corresponding to selectedRole
    const targetDbRole = ROLE_DB_VALUES[selectedRole];
    return user.role === targetDbRole;
  });

  return (
    <div className="flex flex-col min-h-full pb-6">
      <header className="sticky top-0 z-10 bg-background-dark/95 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Gestão de Usuários</h1>
        <button
          onClick={() => setIsAddUserModalOpen(true)}
          className="size-10 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined">person_add</span>
        </button>
      </header>

      <div className="p-4 space-y-6">
        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
              <span className="material-symbols-outlined text-xl">search</span>
            </span>
            <input
              type="text"
              className="w-full bg-[#1c2127] border-gray-800 rounded-xl pl-10 text-sm focus:ring-primary focus:border-primary placeholder-slate-600"
              placeholder="Pesquisar usuários..."
            />
          </div>
          <button className="bg-[#1c2127] border border-gray-800 rounded-xl px-3 flex items-center justify-center text-slate-400">
            <span className="material-symbols-outlined">filter_list</span>
          </button>
        </div>

        {/* User Roles Chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          {['Todos', 'Administrador', 'Supervisor Geral', 'Supervisor de Área', 'Servidor'].map((role, i) => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`shrink-0 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all ${selectedRole === role ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-[#1c2127] border-gray-800 text-slate-500 hover:text-white'}`}
            >
              {role}
            </button>
          ))}
        </div>

        {/* User List */}
        <div className="space-y-3">
          {/* Show loading state or users */}
          {loading ? (
            <div className="text-center py-10 text-slate-500">Carregando usuários...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-10 text-slate-500">Nenhum usuário encontrado.</div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user.id} className="bg-[#1c2127] rounded-2xl p-4 border border-gray-800 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={user.avatar_url || 'https://i.pravatar.cc/150?u=default'}
                    className="size-12 rounded-full border-2 border-primary/20"
                    alt={user.name}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-white truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <button className="size-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500">
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[9px] font-bold uppercase border border-blue-500/20">
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                    <span className="text-[10px] text-slate-600 font-medium">
                      {user.last_login_at
                        ? `Log: ${new Date(user.last_login_at).toLocaleDateString()}`
                        : 'Nunca acessou'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="p-1.5 rounded-lg bg-gray-800 text-slate-300 hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button
                      onClick={(e) => handleDelete(user.id, e)}
                      className="p-1.5 rounded-lg bg-gray-800 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        onSave={handleAddUser}
      />

      <EditUserModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        onSave={handleUpdateUser}
      />
    </div>
  );
};

export default Users;
