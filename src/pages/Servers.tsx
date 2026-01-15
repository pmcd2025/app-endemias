
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Tables, InsertTables, UpdateTables } from '../lib/database.types';
import EditServerModal from '../components/EditServerModal';
import { useAuth } from '../contexts/AuthContext';

type Server = Tables<'servers'>;

interface NewServerForm {
  nome: string;
  funcao: string;
  vinculo: string;
  matricula: string;
}

// Interface para dados hierárquicos
interface SupervisorGeralWithArea {
  id: string;
  name: string;
  supervisoresArea: {
    id: string;
    name: string;
    servidores: Server[];
  }[];
}

const Servers: React.FC = () => {
  const { userProfile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'hierarchy'>('hierarchy');
  const [hierarchyData, setHierarchyData] = useState<SupervisorGeralWithArea[]>([]);

  const [formData, setFormData] = useState<NewServerForm>({
    nome: '',
    funcao: '',
    vinculo: '',
    matricula: ''
  });

  // Hierarquia
  const [supervisoresGerais, setSupervisoresGerais] = useState<{ id: string; name: string }[]>([]);
  const [supervisoresArea, setSupervisoresArea] = useState<{ id: string; name: string }[]>([]);
  const [selectedSupervisorGeral, setSelectedSupervisorGeral] = useState('');
  const [selectedSupervisorArea, setSelectedSupervisorArea] = useState('');

  const funcaoOptions = ['Téc. Endemias', 'Supervisor de Área', 'Supervisor Geral'];
  const vinculoOptions = ['Efetivo', 'Contrato'];

  // Map display labels to DB status values
  const filterMap: Record<string, string> = {
    'Todos': 'Todos',
    'Ativos': 'active',
    'Inativos': 'inactive',
    'Férias': 'vacation',
    'Afastados': 'leave'
  };

  // Carregar servidores do Supabase - filtrado por supervisor logado
  const fetchServers = async () => {
    if (!userProfile) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('servers')
        .select('*')
        .order('name', { ascending: true });

      // Filtrar baseado no role do usuário logado
      if (userProfile.role === 'supervisor_area') {
        // Supervisor de Área vê apenas servidores vinculados a ele
        query = query.eq('supervisor_area_id', userProfile.id);
      } else if (userProfile.role === 'supervisor_geral') {
        // Supervisor Geral vê servidores vinculados a ele
        query = query.eq('supervisor_geral_id', userProfile.id);
      }
      // Admin/outros roles veem todos os servidores

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao carregar servidores:', error);
      } else {
        setServers(data || []);
        // Carregar dados hierárquicos
        await buildHierarchyData(data || []);
      }
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Construir dados hierárquicos para visualização em cards agrupados
  const buildHierarchyData = async (serversList: Server[]) => {
    if (!userProfile) return;

    try {
      // Buscar supervisores gerais únicos dos servidores
      const supervisorGeralIds = [...new Set(serversList.map(s => s.supervisor_geral_id).filter(Boolean))];
      const supervisorAreaIds = [...new Set(serversList.map(s => s.supervisor_area_id).filter(Boolean))];

      // Buscar nomes dos supervisores gerais
      const { data: supervisoresGeraisData } = await (supabase.from('users') as any)
        .select('id, name')
        .in('id', supervisorGeralIds);

      // Buscar nomes dos supervisores de área
      const { data: supervisoresAreaData } = await (supabase.from('users') as any)
        .select('id, name, supervisor_geral_id')
        .in('id', supervisorAreaIds);

      // Construir estrutura hierárquica
      const hierarchy: SupervisorGeralWithArea[] = [];

      (supervisoresGeraisData || []).forEach((supGeral: any) => {
        const areasDoGeral = (supervisoresAreaData || []).filter(
          (supArea: any) => supArea.supervisor_geral_id === supGeral.id
        );

        const supervisoresArea = areasDoGeral.map((supArea: any) => ({
          id: supArea.id,
          name: supArea.name,
          servidores: serversList.filter(s => s.supervisor_area_id === supArea.id)
        }));

        // Incluir servidores sem supervisor de área mas com supervisor geral
        const servidoresSemArea = serversList.filter(
          s => s.supervisor_geral_id === supGeral.id && !s.supervisor_area_id
        );

        if (servidoresSemArea.length > 0) {
          supervisoresArea.push({
            id: 'sem-area',
            name: 'Sem Supervisor de Área',
            servidores: servidoresSemArea
          });
        }

        hierarchy.push({
          id: supGeral.id,
          name: supGeral.name,
          supervisoresArea
        });
      });

      // Servidores sem supervisor geral
      const servidoresSemGeral = serversList.filter(s => !s.supervisor_geral_id);
      if (servidoresSemGeral.length > 0) {
        hierarchy.push({
          id: 'sem-geral',
          name: 'Sem Supervisor Geral',
          supervisoresArea: [{
            id: 'sem-area',
            name: 'Sem Supervisor de Área',
            servidores: servidoresSemGeral
          }]
        });
      }

      setHierarchyData(hierarchy);
    } catch (err) {
      console.error('Erro ao construir hierarquia:', err);
    }
  };

  useEffect(() => {
    if (userProfile) {
      fetchServers();
    }
  }, [userProfile]);

  const handleOpenModal = () => {
    setFormData({ nome: '', funcao: '', vinculo: '', matricula: '' });
    setSelectedSupervisorGeral('');
    setSelectedSupervisorArea('');
    fetchSupervisoresGerais();
    setIsModalOpen(true);
  };

  const fetchSupervisoresGerais = async () => {
    try {
      const { data } = await (supabase.from('users') as any)
        .select('id, name')
        .eq('role', 'supervisor_geral')
        .order('name');
      setSupervisoresGerais(data || []);
    } catch (err) {
      console.error('Erro ao buscar supervisores gerais:', err);
    }
  };

  const fetchSupervisoresArea = async (supervisorGeralId: string) => {
    try {
      const { data } = await (supabase.from('users') as any)
        .select('id, name')
        .eq('role', 'supervisor_area')
        .eq('supervisor_geral_id', supervisorGeralId)
        .order('name');
      setSupervisoresArea(data || []);
    } catch (err) {
      console.error('Erro ao buscar supervisores de área:', err);
    }
  };

  const handleSupervisorGeralChange = (id: string) => {
    setSelectedSupervisorGeral(id);
    setSelectedSupervisorArea('');
    if (id) fetchSupervisoresArea(id);
    else setSupervisoresArea([]);
  };


  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Gerar matrícula única
  const generateMatricula = () => {
    return Math.floor(10000 + Math.random() * 90000).toString();
  };

  // Salvar servidor no Supabase
  const handleSave = async () => {
    if (!formData.nome || !formData.funcao || !formData.vinculo || !formData.matricula) {
      alert('Preencha todos os campos obrigatórios (Nome, Função, Vínculo e Matrícula).');
      return;
    }

    if (!selectedSupervisorGeral || !selectedSupervisorArea) {
      alert('Selecione o Supervisor Geral e o Supervisor de Área.');
      return;
    }

    setIsSaving(true);
    try {
      const newServer: InsertTables<'servers'> = {
        name: formData.nome,
        role: formData.funcao,
        vinculo: formData.vinculo,
        matricula: formData.matricula,
        status: 'active',
        supervisor_geral_id: selectedSupervisorGeral,
        supervisor_area_id: selectedSupervisorArea
      };

      const { data, error } = await supabase
        .from('servers')
        .insert(newServer as any)
        .select()
        .single();

      if (error) {
        console.error('Erro ao salvar servidor:', error);
        alert('Erro ao salvar servidor. Tente novamente.');
      } else {
        setServers(prev => [data, ...prev]);
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error('Erro:', err);
      alert('Erro ao salvar servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este servidor? Esta ação não pode ser desfeita.')) return;

    try {
      const { error } = await supabase.from('servers').delete().eq('id', id);

      if (error) {
        if (error.code === '23503') { // Foreign key violation
          alert('Não é possível excluir este servidor pois existem registros vinculados a ele (pontos, faltas, etc).\n\nConsidere inativar o servidor alterando seu status.');
        } else {
          throw error;
        }
        return;
      }

      // Sucesso
      alert('Servidor excluído com sucesso!');

      // Recarregar os dados para atualizar tanto a lista quanto a hierarquia
      fetchServers();

    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Ocorreu um erro ao excluir o servidor. Tente novamente.');
    }
  };

  const handleUpdateServer = async (updatedServer: Server) => {
    try {
      // Ensure empty strings are converted to null to avoid UUID syntax errors
      const updatePayload: UpdateTables<'servers'> = {
        name: updatedServer.name,
        matricula: updatedServer.matricula,
        role: updatedServer.role,
        status: updatedServer.status,
        vinculo: updatedServer.vinculo,
        supervisor_geral_id: updatedServer.supervisor_geral_id || null,
        supervisor_area_id: updatedServer.supervisor_area_id || null
      };

      console.log('Updating server ID:', updatedServer.id);
      console.log('Updating server with payload:', updatePayload);

      const { data, error } = await (supabase.from('servers') as any)
        .update(updatePayload)
        .eq('id', updatedServer.id)
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (!data) {
        console.error('No data returned from update - row may not exist or RLS blocked');
        throw new Error('Nenhum dado retornado. O servidor pode não existir ou você não tem permissão para editá-lo.');
      }

      console.log('Update successful, returned data:', data);

      // Recarregar os dados para atualizar tanto a lista quanto a hierarquia
      await fetchServers();
      setEditingServer(null);
      alert('Servidor atualizado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao atualizar:', err);
      alert(`Erro ao atualizar servidor: ${err.message || 'Erro desconhecido'}`);
    }
  };

  const handleEditClick = (server: Server) => {
    fetchSupervisoresGerais();
    setEditingServer(server);
  };




  // Função para obter cor de status
  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'active': return 'bg-emerald-500';
      case 'vacation': return 'bg-amber-400';
      case 'inactive': return 'bg-gray-400';
      case 'leave':
      case 'medical_leave': return 'bg-red-400';
      default: return 'bg-slate-400';
    }
  };

  // Função para obter avatar placeholder
  const getAvatarUrl = (server: Server) => {
    if (server.avatar_url) return server.avatar_url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(server.name)}&background=3b82f6&color=fff&size=100`;
  };

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      server.matricula.includes(searchTerm);
    const targetStatus = filterMap[statusFilter];
    const matchesStatus = statusFilter === 'Todos' || server.status === targetStatus;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col min-h-full">
      <header className="sticky top-0 z-10 bg-background-dark/95 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <button className="size-10 flex items-center justify-center rounded-full hover:bg-white/10">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold tracking-tight">Gestão de Servidores</h1>
        <button className="size-10 flex items-center justify-center rounded-full hover:bg-white/10">
          <span className="material-symbols-outlined">tune</span>
        </button>
      </header>

      <main className="flex-1 p-4 space-y-4">
        <button
          onClick={handleOpenModal}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-white font-bold shadow-lg shadow-primary/25 hover:bg-blue-600 transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined">person_add</span>
          <span>Adicionar Novo Servidor</span>
        </button>

        <div className="relative">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
            <span className="material-symbols-outlined">search</span>
          </span>
          <input
            className="block w-full rounded-xl border-none bg-[#1c2127] py-3.5 pl-10 pr-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-primary shadow-sm"
            placeholder="Buscar por nome ou matrícula..."
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          {Object.keys(filterMap).map((label, i) => (
            <button
              key={label}
              onClick={() => setStatusFilter(label)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${statusFilter === label ? 'bg-primary text-white' : 'bg-[#1c2127] text-slate-400 border border-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Lista de Servidores</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 bg-[#1c2127] px-2 py-1 rounded">Total: {filteredServers.length}</span>
            {/* Toggle de Visualização */}
            <div className="flex rounded-lg bg-[#1c2127] p-0.5 border border-gray-700">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}
                title="Lista"
              >
                <span className="material-symbols-outlined text-sm">view_list</span>
              </button>
              <button
                onClick={() => setViewMode('hierarchy')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'hierarchy' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}
                title="Hierarquia"
              >
                <span className="material-symbols-outlined text-sm">account_tree</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-slate-500">Carregando servidores...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredServers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="p-4 rounded-full bg-[#1c2127]">
              <span className="material-symbols-outlined text-3xl text-slate-500">group_off</span>
            </div>
            <p className="text-sm text-slate-500">Nenhum servidor encontrado</p>
          </div>
        )}

        {/* Server List - Visualização em Lista */}
        {!isLoading && filteredServers.length > 0 && viewMode === 'list' && (
          <div className="flex flex-col gap-3">
            {filteredServers.map((server) => (
              <div key={server.id} className="group flex items-center justify-between rounded-2xl bg-[#1c2127] p-3 border border-gray-800 hover:border-primary transition-all">
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative">
                    <div
                      className={`h-12 w-12 rounded-full bg-cover bg-center ${server.status === 'inactive' ? 'grayscale' : ''}`}
                      style={{ backgroundImage: `url('${getAvatarUrl(server)}')` }}
                    />
                    <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-[#1c2127] ${getStatusColor(server.status)}`} />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-base font-bold text-white leading-tight">{server.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">{server.role} • Mat: {server.matricula}</p>
                      {/* Status Badges */}
                      {server.status === 'vacation' && <span className="px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-500 text-[8px] font-bold uppercase border border-amber-400/20">Férias</span>}
                      {server.status === 'leave' && <span className="px-1.5 py-0.5 rounded bg-red-400/10 text-red-500 text-[8px] font-bold uppercase border border-red-400/20">Afastado</span>}
                      {server.status === 'inactive' && <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-[8px] font-bold uppercase border border-gray-400/20">Inativo</span>}

                      {server.vinculo && (
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${server.vinculo === 'Efetivo'
                          ? 'bg-emerald-400/10 text-emerald-500 border-emerald-400/20'
                          : 'bg-blue-400/10 text-blue-400 border-blue-400/20'
                          }`}>
                          {server.vinculo}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditClick(server)}
                    className="p-2 rounded-lg text-slate-500 hover:bg-primary/20 hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">edit</span>
                  </button>
                  <button
                    onClick={(e) => handleDelete(server.id, e)}
                    className="p-2 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Server List - Visualização Hierárquica em Cards Agrupados */}
        {!isLoading && filteredServers.length > 0 && viewMode === 'hierarchy' && (
          <div className="flex flex-col gap-4">
            {hierarchyData.map((supGeral) => (
              <div key={supGeral.id} className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-transparent overflow-hidden">
                {/* Header Supervisor Geral */}
                <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-500/20">
                    <span className="material-symbols-outlined text-blue-400">supervisor_account</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Supervisor Geral</p>
                    <p className="text-sm font-bold text-white">{supGeral.name}</p>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-bold">
                    {supGeral.supervisoresArea.reduce((acc, area) => acc + area.servidores.length, 0)} servidores
                  </span>
                </div>

                {/* Supervisores de Área */}
                <div className="p-3 space-y-3">
                  {supGeral.supervisoresArea.map((supArea) => (
                    <div key={supArea.id} className="rounded-xl border border-green-500/20 bg-green-500/5 overflow-hidden">
                      {/* Header Supervisor de Área */}
                      <div className="px-3 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2">
                        <span className="material-symbols-outlined text-green-400 text-lg">person</span>
                        <div className="flex-1">
                          <p className="text-[9px] text-green-400 font-bold uppercase tracking-wider">Supervisor de Área</p>
                          <p className="text-xs font-bold text-white">{supArea.name}</p>
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[9px] font-bold">
                          {supArea.servidores.length}
                        </span>
                      </div>

                      {/* Lista de Servidores */}
                      <div className="p-2 space-y-2">
                        {supArea.servidores
                          .filter(server => {
                            const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              server.matricula.includes(searchTerm);
                            const targetStatus = filterMap[statusFilter];
                            const matchesStatus = statusFilter === 'Todos' || server.status === targetStatus;
                            return matchesSearch && matchesStatus;
                          })
                          .map((server) => (
                            <div key={server.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#1c2127] border border-gray-800 hover:border-primary/50 transition-all">
                              <div className="relative">
                                <div
                                  className={`h-10 w-10 rounded-full bg-cover bg-center ${server.status === 'inactive' ? 'grayscale' : ''}`}
                                  style={{ backgroundImage: `url('${getAvatarUrl(server)}')` }}
                                />
                                <div className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#1c2127] ${getStatusColor(server.status)}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{server.name}</p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-[10px] text-slate-500">{server.role} • Mat: {server.matricula}</p>
                                  {server.vinculo && (
                                    <span className={`px-1 py-0.5 rounded text-[7px] font-bold uppercase border ${server.vinculo === 'Efetivo'
                                      ? 'bg-emerald-400/10 text-emerald-500 border-emerald-400/20'
                                      : 'bg-blue-400/10 text-blue-400 border-blue-400/20'
                                      }`}>
                                      {server.vinculo}
                                    </span>
                                  )}
                                  {server.status === 'vacation' && <span className="px-1 py-0.5 rounded bg-amber-400/10 text-amber-500 text-[7px] font-bold uppercase border border-amber-400/20">Férias</span>}
                                  {server.status === 'leave' && <span className="px-1 py-0.5 rounded bg-red-400/10 text-red-500 text-[7px] font-bold uppercase border border-red-400/20">Afastado</span>}
                                </div>
                              </div>
                              <div className="flex gap-0.5">
                                <button
                                  onClick={() => handleEditClick(server)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:bg-primary/20 hover:text-primary transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">edit</span>
                                </button>
                                <button
                                  onClick={(e) => handleDelete(server.id, e)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-500 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">delete</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        {supArea.servidores.filter(server => {
                          const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            server.matricula.includes(searchTerm);
                          const targetStatus = filterMap[statusFilter];
                          const matchesStatus = statusFilter === 'Todos' || server.status === targetStatus;
                          return matchesSearch && matchesStatus;
                        }).length === 0 && (
                            <p className="text-[10px] text-slate-500 text-center py-2">Nenhum servidor neste filtro</p>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Adicionar Novo Servidor */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full bg-[#101922] rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Header do Modal - Compacto */}
            <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center bg-[#1c2127] rounded-t-3xl">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-lg">person_add</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Novo Servidor</h2>
                  <p className="text-[10px] text-slate-400">Preencha os dados</p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="size-8 flex items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Corpo do Modal - Scroll otimizado */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Campo Nome */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-0.5">
                  Nome Completo
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
                    <span className="material-symbols-outlined text-lg">person</span>
                  </span>
                  <input
                    type="text"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Digite o nome do servidor"
                    className="w-full bg-[#1c2127] border border-gray-700 rounded-xl py-3 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Campo Matrícula */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-0.5">
                  Matrícula
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
                    <span className="material-symbols-outlined text-lg">badge</span>
                  </span>
                  <input
                    type="text"
                    value={formData.matricula}
                    onChange={(e) => setFormData({ ...formData, matricula: e.target.value })}
                    placeholder="Digite a matrícula do servidor"
                    className="w-full bg-[#1c2127] border border-gray-700 rounded-xl py-3 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-0.5">
                  Função
                </label>
                <div className="flex flex-col gap-1.5">
                  {funcaoOptions.map((opcao) => (
                    <button
                      key={opcao}
                      type="button"
                      onClick={() => setFormData({ ...formData, funcao: opcao })}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${formData.funcao === opcao
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-[#1c2127] border-gray-700 text-slate-300 active:bg-gray-700'
                        }`}
                    >
                      <div className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 ${formData.funcao === opcao ? 'border-primary bg-primary' : 'border-gray-600'
                        }`}>
                        {formData.funcao === opcao && (
                          <span className="material-symbols-outlined text-white text-[10px]">check</span>
                        )}
                      </div>
                      <span className="text-sm font-medium">{opcao}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Campo Vínculo */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-0.5">
                  Vínculo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {vinculoOptions.map((opcao) => (
                    <button
                      key={opcao}
                      type="button"
                      onClick={() => setFormData({ ...formData, vinculo: opcao })}
                      className={`flex items-center justify-center gap-1.5 py-3 rounded-xl border transition-all ${formData.vinculo === opcao
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-[#1c2127] border-gray-700 text-slate-300 active:bg-gray-700'
                        }`}
                    >
                      <span className="material-symbols-outlined text-base">
                        {opcao === 'Efetivo' ? 'verified' : 'description'}
                      </span>
                      <span className="text-sm font-bold">{opcao}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Seleção de Supervisor Geral */}
              <div className="flex flex-col gap-1.5 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <label className="text-[10px] font-bold text-blue-400 uppercase tracking-wider px-0.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">account_tree</span>
                  Supervisor Geral (Obrigatório)
                </label>
                <select
                  value={selectedSupervisorGeral}
                  onChange={(e) => handleSupervisorGeralChange(e.target.value)}
                  className="w-full bg-[#1c2127] border border-gray-700 rounded-xl py-3 px-3 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all [&>option]:bg-[#1c2127]"
                >
                  <option value="">Selecione o Supervisor Geral...</option>
                  {supervisoresGerais.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </select>
                {supervisoresGerais.length === 0 && (
                  <p className="text-[10px] text-amber-500">Nenhum Supervisor Geral cadastrado.</p>
                )}
              </div>

              {/* Seleção de Supervisor de Área */}
              {selectedSupervisorGeral && (
                <div className="flex flex-col gap-1.5 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                  <label className="text-[10px] font-bold text-green-400 uppercase tracking-wider px-0.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">person</span>
                    Supervisor de Área (Obrigatório)
                  </label>
                  <select
                    value={selectedSupervisorArea}
                    onChange={(e) => setSelectedSupervisorArea(e.target.value)}
                    className="w-full bg-[#1c2127] border border-gray-700 rounded-xl py-3 px-3 text-sm text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all [&>option]:bg-[#1c2127]"
                  >
                    <option value="">Selecione o Supervisor de Área...</option>
                    {supervisoresArea.map(sup => (
                      <option key={sup.id} value={sup.id}>{sup.name}</option>
                    ))}
                  </select>
                  {supervisoresArea.length === 0 && (
                    <p className="text-[10px] text-amber-500">Nenhum Supervisor de Área vinculado a este Supervisor Geral.</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer do Modal - Fixo no fundo */}
            <div className="px-4 py-3 border-t border-gray-800 bg-[#1c2127] safe-area-bottom">
              <div className="flex gap-2">
                <button
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="flex-1 py-3 rounded-xl border border-gray-700 text-white font-bold text-sm active:bg-gray-700 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.nome || !formData.funcao || !formData.vinculo || !selectedSupervisorGeral || !selectedSupervisorArea || isSaving}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 active:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <EditServerModal
        isOpen={!!editingServer}
        onClose={() => setEditingServer(null)}
        server={editingServer}
        onSave={handleUpdateServer}
        supervisoresGerais={supervisoresGerais}
      />
    </div>
  );
};

export default Servers;
