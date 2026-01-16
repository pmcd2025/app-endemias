
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Tables, InsertTables } from '../lib/database.types';
import { useAuth } from '../contexts/AuthContext';

type Server = Tables<'servers'>;

type WeeklyRecordWithEntries = Tables<'weekly_records'> & {
  daily_entries: Pick<Tables<'daily_entries'>, 'day_of_week' | 'worked_days' | 'production' | 'status'>[]
}

interface DiaRegistro {
  worked_days: string | number;
  producao: string;
  status: string;
}

interface RegistroSemanalMap {
  [key: number]: DiaRegistro;
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

const statusOptions = [
  'Normal', 'Férias', 'Falta Justificada', 'Falta Sem Justificativa',
  'Feriado', 'Facultativo', 'Folga de Aniversário'
];

const initialDayState: DiaRegistro = { worked_days: 1, producao: '', status: 'Normal' };

// Componente DayRow movido para fora do componente Ponto para evitar re-criação
interface DayRowProps {
  dayNum: number;
  label: string;
  isActive?: boolean;
  data: DiaRegistro;
  onDayChange: (day: number, field: keyof DiaRegistro, value: any) => void;
  disabled?: boolean;
}

const DayRow: React.FC<DayRowProps> = ({ dayNum, label, isActive = true, data, onDayChange, disabled = false }) => {
  const handleProductionStep = (step: number) => {
    if (disabled) return;
    const current = parseFloat(data.producao) || 0;
    const next = Math.max(0, current + step);
    onDayChange(dayNum, 'producao', next.toString());
  };

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-xl border border-gray-800 bg-background-dark/50 ${(!isActive || disabled) ? 'opacity-60' : ''} ${!isActive ? 'pointer-events-none' : ''}`}>
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-primary uppercase">{label}</span>
      </div>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
        <div className="flex flex-col gap-1 items-center justify-center min-w-[60px]">
          <label className="text-[10px] text-slate-500 font-bold uppercase">Trabalhou?</label>
          <input
            type="checkbox"
            disabled={disabled || data.status !== 'Normal'}
            checked={Number(data.worked_days) > 0}
            onChange={(e) => onDayChange(dayNum, 'worked_days', e.target.checked ? 1 : 0)}
            className={`size-5 rounded border-gray-700 bg-[#1c2127] text-primary focus:ring-primary transition-all ${(disabled || data.status !== 'Normal') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase text-center">Produção</label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleProductionStep(-1)}
              className={`size-8 flex items-center justify-center rounded-lg bg-gray-700 text-white transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600 active:scale-95'}`}
            >
              <span className="material-symbols-outlined text-sm">remove</span>
            </button>
            <input
              type="number"
              disabled={disabled}
              placeholder="0"
              value={data.producao}
              onChange={(e) => onDayChange(dayNum, 'producao', e.target.value)}
              className="w-full bg-[#1c2127] border-gray-700 rounded-lg text-xs p-2 text-white focus:ring-primary text-center appearance-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleProductionStep(1)}
              className={`size-8 flex items-center justify-center rounded-lg bg-gray-700 text-white transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600 active:scale-95'}`}
            >
              <span className="material-symbols-outlined text-sm">add</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase">Status</label>
          <select
            value={data.status}
            disabled={disabled}
            onChange={(e) => onDayChange(dayNum, 'status', e.target.value)}
            className="w-full h-[34px] bg-[#1c2127] border-gray-700 rounded-lg text-[10px] px-2 text-white focus:ring-primary appearance-none disabled:opacity-50"
          >
            {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};

const Ponto: React.FC = () => {
  const { userProfile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaturdayActive, setIsSaturdayActive] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'hierarchy'>('hierarchy');

  // States for data
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(true);
  const [hierarchyData, setHierarchyData] = useState<SupervisorGeralWithArea[]>([]);

  // Estados para controle de expansão dos cards hierárquicos
  const [expandedGerais, setExpandedGerais] = useState<Set<string>>(new Set());
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  // States for Send Week functionality
  const [weeklyRecordsCount, setWeeklyRecordsCount] = useState(0);
  const [isWeekSubmitted, setIsWeekSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalSelectedYear, setGlobalSelectedYear] = useState(new Date().getFullYear());
  const [globalSelectedWeek, setGlobalSelectedWeek] = useState(getCurrentWeekNumber());

  // States for Modal
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeekNumber());
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [weekData, setWeekData] = useState<RegistroSemanalMap>({
    1: { ...initialDayState },
    2: { ...initialDayState },
    3: { ...initialDayState },
    4: { ...initialDayState },
    5: { ...initialDayState },
    6: { ...initialDayState },
  });
  const [weeklyRecordId, setWeeklyRecordId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [isRecordLocked, setIsRecordLocked] = useState(false); // New state to lock the modal inputs

  const years = Array.from({ length: 6 }, (_, i) => (2025 + i));
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1);

  function getCurrentWeekNumber() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  // Fetch servers on mount - filtrado por supervisor logado
  useEffect(() => {
    if (userProfile) {
      fetchServers();
    }
  }, [userProfile]);

  // Verificar status da semana quando servidores ou semana global mudar
  useEffect(() => {
    if (userProfile && servers.length > 0) {
      checkWeeklyCompleteness();
    }
  }, [userProfile, servers, globalSelectedYear, globalSelectedWeek]);

  const fetchServers = async () => {
    if (!userProfile) return;

    try {
      let query = supabase
        .from('servers')
        .select('*')
        .order('name');

      // Filtrar baseado no role do usuário logado
      if (userProfile.role === 'supervisor_area') {
        query = query.eq('supervisor_area_id', userProfile.id);
      } else if (userProfile.role === 'supervisor_geral') {
        query = query.eq('supervisor_geral_id', userProfile.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setServers(data || []);
      await buildHierarchyData(data || []);
    } catch (error) {
      console.error('Error fetching servers:', error);
    } finally {
      setIsLoadingServers(false);
    }
  };

  // Construir dados hierárquicos
  const buildHierarchyData = async (serversList: Server[]) => {
    if (!userProfile) return;

    try {
      const supervisorGeralIds = [...new Set(serversList.map(s => s.supervisor_geral_id).filter(Boolean))];
      const supervisorAreaIds = [...new Set(serversList.map(s => s.supervisor_area_id).filter(Boolean))];

      const { data: supervisoresGeraisData } = await (supabase.from('users') as any)
        .select('id, name')
        .in('id', supervisorGeralIds);

      const { data: supervisoresAreaData } = await (supabase.from('users') as any)
        .select('id, name, supervisor_geral_id')
        .in('id', supervisorAreaIds);

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

  // Verificar quantos servidores têm registro na semana selecionada e se já foi enviada
  const checkWeeklyCompleteness = async () => {
    if (!userProfile || servers.length === 0) return;

    try {
      const serverIds = servers.map(s => s.id);

      // Buscar registros da semana
      const { data: records, error } = await supabase
        .from('weekly_records')
        .select('id, server_id, status')
        .eq('year', globalSelectedYear)
        .eq('week_number', globalSelectedWeek)
        .in('server_id', serverIds);

      if (error) {
        console.error('Erro ao verificar registros:', error);
        return;
      }

      setWeeklyRecordsCount(records?.length || 0);

      // Verificar se algum registro já foi enviado (status = 'submitted')
      const anySubmitted = records?.some((r: any) => r.status === 'submitted');
      setIsWeekSubmitted(anySubmitted || false);
    } catch (err) {
      console.error('Erro:', err);
    }
  };

  // Enviar semana - atualiza status de todos os registros
  const handleSubmitWeek = async () => {
    if (!userProfile || servers.length === 0) return;
    if (weeklyRecordsCount < servers.length) {
      alert('Preencha todos os registros antes de enviar.');
      return;
    }

    if (!window.confirm(`Confirma o envio da Semana ${globalSelectedWeek}/${globalSelectedYear}?\n\nApós o envio, os registros não poderão mais ser editados.`)) {
      return;
    }

    setIsSubmitting(true);

    try {
      const serverIds = servers.map(s => s.id);

      // Atualizar status para 'submitted' em todos os registros da semana
      const { error } = await (supabase
        .from('weekly_records') as any)
        .update({ status: 'submitted' })
        .eq('year', globalSelectedYear)
        .eq('week_number', globalSelectedWeek)
        .in('server_id', serverIds);

      if (error) throw error;

      alert('Semana enviada com sucesso!');
      setIsWeekSubmitted(true);
    } catch (err) {
      console.error('Erro ao enviar semana:', err);
      alert('Erro ao enviar semana. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verificar se a semana atual está bloqueada para edição
  const isCurrentWeekLocked = () => {
    return isWeekSubmitted &&
      selectedYear === globalSelectedYear &&
      selectedWeek === globalSelectedWeek;
  };

  // Fetch weekly record when modal opens or year/week changes
  useEffect(() => {
    if (isModalOpen && selectedServer) {
      fetchWeeklyRecord();
    }
  }, [isModalOpen, selectedServer, selectedYear, selectedWeek]);

  const fetchWeeklyRecord = async () => {
    if (!selectedServer) return;

    setIsLoadingRecord(true);
    setWeekData({
      1: { ...initialDayState },
      2: { ...initialDayState },
      3: { ...initialDayState },
      4: { ...initialDayState },
      5: { ...initialDayState },
      6: { ...initialDayState },
    });
    setWeeklyRecordId(null);
    setIsSaturdayActive(false);
    setObservacao('');

    try {
      const { data: record, error } = await supabase
        .from('weekly_records')
        .select(`
          id,
          saturday_active,
          notes,
          daily_entries (
            day_of_week,
            worked_days,
            production,
            status
          )
        `)
        .eq('server_id', selectedServer.id)
        .eq('year', selectedYear)
        .eq('week_number', selectedWeek)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching record:', error);
        return;
      }

      if (record) {
        const typedRecord = record as unknown as WeeklyRecordWithEntries;
        setWeeklyRecordId(typedRecord.id);
        setIsSaturdayActive(typedRecord.saturday_active || false);
        setObservacao((record as any).notes || '');

        const newWeekData = { ...weekData };
        if (typedRecord.daily_entries) {
          typedRecord.daily_entries.forEach((entry: any) => {
            if (entry.day_of_week >= 1 && entry.day_of_week <= 6) {
              newWeekData[entry.day_of_week] = {
                worked_days: entry.worked_days ?? 0,
                producao: entry.production?.toString() || '',
                status: entry.status || 'Normal'
              };
            }
          });
        }
        setWeekData(newWeekData);
        setIsRecordLocked((record as any).status === 'submitted');
      } else {
        setIsRecordLocked(isWeekSubmitted && selectedYear === globalSelectedYear && selectedWeek === globalSelectedWeek);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingRecord(false);
    }
  };

  const handleOpenModal = (server: Server) => {
    setSelectedServer(server);
    setSelectedYear(globalSelectedYear);
    setSelectedWeek(globalSelectedWeek);
    setIsModalOpen(true);
  };

  const handleDayChange = (day: number, field: keyof DiaRegistro, value: any) => {
    setWeekData(prev => {
      const currentDay = prev[day];
      let newData = { ...currentDay, [field]: value };

      if (field === 'status') {
        if (value === 'Normal') {
          newData.worked_days = 1;
        } else {
          newData.worked_days = 0;
        }
      }

      return {
        ...prev,
        [day]: newData
      };
    });
  };

  const handleSave = async () => {
    if (!selectedServer) return;

    try {
      const weeklyPayload: InsertTables<'weekly_records'> = {
        server_id: selectedServer.id,
        year: selectedYear,
        week_number: selectedWeek,
        saturday_active: isSaturdayActive,
        notes: observacao.slice(0, 800), // Limite de 800 caracteres
        updated_at: new Date().toISOString()
      };

      let currentRecordId = weeklyRecordId;

      if (!currentRecordId) {
        const { data: newRecord, error } = await (supabase
          .from('weekly_records') as any)
          .insert(weeklyPayload)
          .select()
          .single();

        if (error) throw error;
        if (!newRecord) throw new Error('Falha ao criar registro');
        currentRecordId = newRecord.id;
      } else {
        const { error } = await (supabase
          .from('weekly_records') as any)
          .update(weeklyPayload)
          .eq('id', currentRecordId);

        if (error) throw error;
      }

      const daysToSave = [1, 2, 3, 4, 5];
      if (isSaturdayActive) daysToSave.push(6);

      const entriesPromises = daysToSave.map(async (day) => {
        const dayData = weekData[day];

        const { data: existing } = await supabase
          .from('daily_entries')
          .select('id')
          .eq('weekly_record_id', currentRecordId)
          .eq('day_of_week', day)
          .single();

        const payload: InsertTables<'daily_entries'> = {
          weekly_record_id: currentRecordId!,
          day_of_week: day,
          worked_days: Number(dayData.worked_days),
          production: dayData.producao ? parseFloat(dayData.producao) : 0,
          status: dayData.status,
          updated_at: new Date().toISOString()
        };

        if (existing) {
          return (supabase
            .from('daily_entries') as any)
            .update(payload)
            .eq('id', (existing as any).id);
        } else {
          return (supabase
            .from('daily_entries') as any)
            .insert(payload);
        }
      });

      await Promise.all(entriesPromises);
      setIsModalOpen(false);

    } catch (err) {
      console.error('Error saving:', err);
      alert('Erro ao salvar registro.');
    }
  };

  const getAvatarUrl = (server: Server) => {
    if (server.avatar_url) return server.avatar_url;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(server.name)}&background=3b82f6&color=fff&size=100`;
  };

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

  // Filtrar servidores por busca
  const filteredServers = servers.filter(server =>
    server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.matricula.includes(searchTerm)
  );

  // Funções de toggle para expandir/colapsar cards hierárquicos
  const toggleGeralExpanded = (id: string) => {
    setExpandedGerais(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAreaExpanded = (id: string) => {
    setExpandedAreas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Verificar se deve expandir automaticamente (quando há busca)
  const shouldAutoExpand = searchTerm.length > 0;

  // Componente do card de servidor para registro
  const ServerCard = ({ server }: { server: Server }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1c2127] border border-gray-800 hover:border-primary/50 transition-all group">
      <div className="relative">
        <div
          className={`h-11 w-11 rounded-full bg-cover bg-center ${server.status === 'inactive' ? 'grayscale' : ''}`}
          style={{ backgroundImage: `url('${getAvatarUrl(server)}')` }}
        />
        <div className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#1c2127] ${getStatusColor(server.status)}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{server.name}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[10px] text-slate-500">Mat: {server.matricula}</p>
          {server.vinculo && (
            <span className={`px-1 py-0.5 rounded text-[7px] font-bold uppercase border ${server.vinculo === 'Efetivo'
              ? 'bg-emerald-400/10 text-emerald-500 border-emerald-400/20'
              : 'bg-blue-400/10 text-blue-400 border-blue-400/20'
              }`}>
              {server.vinculo}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => handleOpenModal(server)}
        className={`px-3 py-2 rounded-lg text-xs font-bold shadow-lg transition-all flex items-center gap-1.5 ${isWeekSubmitted
          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20'
          : 'bg-gradient-to-r from-primary to-blue-600 text-white shadow-primary/20 hover:shadow-primary/40 hover:scale-105'
          }`}
        title={isWeekSubmitted ? 'Visualizar registro (Enviado)' : 'Registrar ponto'}
      >
        <span className="material-symbols-outlined text-sm">{isWeekSubmitted ? 'visibility' : 'edit_calendar'}</span>
        {isWeekSubmitted ? 'Ver' : 'Registrar'}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full pb-6 bg-background-dark">
      {/* Header Premium */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-[#101922] via-[#1c2127] to-[#101922] border-b border-gray-800/50 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-blue-600/20 border border-primary/30">
              <span className="material-symbols-outlined text-primary">schedule</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Registro de Ponto</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Semana {globalSelectedWeek} • {globalSelectedYear}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
              {filteredServers.length} servidores
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {/* Painel de Controle da Semana */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#1c2127] to-[#252b33] border border-gray-800 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletores de Período */}
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">calendar_month</span>
              <select
                value={globalSelectedYear}
                onChange={(e) => setGlobalSelectedYear(parseInt(e.target.value))}
                className="bg-[#101922] border border-gray-700 rounded-lg text-sm px-3 py-2 text-white focus:ring-primary"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={globalSelectedWeek}
                onChange={(e) => setGlobalSelectedWeek(parseInt(e.target.value))}
                className="bg-[#101922] border border-gray-700 rounded-lg text-sm px-3 py-2 text-white focus:ring-primary"
              >
                {weeks.map(w => <option key={w} value={w}>Semana {w.toString().padStart(2, '0')}</option>)}
              </select>
            </div>

            {/* Indicador de Progresso */}
            <div className="flex-1 flex items-center justify-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#101922] border border-gray-700">
                <span className="material-symbols-outlined text-sm text-slate-400">group</span>
                <span className={`text-sm font-bold ${weeklyRecordsCount >= servers.length ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {weeklyRecordsCount}/{servers.length}
                </span>
                <span className="text-xs text-slate-500">preenchidos</span>
              </div>
            </div>

            {/* Botão Enviar Semana */}
            <button
              onClick={handleSubmitWeek}
              disabled={isSubmitting || weeklyRecordsCount < servers.length || isWeekSubmitted}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${isWeekSubmitted
                ? 'bg-emerald-500 text-white cursor-not-allowed shadow-emerald-500/30'
                : weeklyRecordsCount >= servers.length
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-amber-500/40 active:scale-[0.98]'
                  : 'bg-gray-700 text-slate-400 cursor-not-allowed'
                }`}
            >
              {isSubmitting ? (
                <>
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enviando...</span>
                </>
              ) : isWeekSubmitted ? (
                <>
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  <span>Semana Enviada</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">send</span>
                  <span>Enviar Semana</span>
                </>
              )}
            </button>
          </div>

          {/* Barra de Progresso Visual */}
          <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isWeekSubmitted
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                : weeklyRecordsCount >= servers.length
                  ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                  : 'bg-gradient-to-r from-blue-400 to-primary'
                }`}
              style={{ width: `${servers.length > 0 ? (weeklyRecordsCount / servers.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Barra de Busca e Toggle */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
              <span className="material-symbols-outlined text-xl">search</span>
            </span>
            <input
              className="block w-full rounded-xl border border-gray-800 bg-[#1c2127] py-3 pl-10 pr-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-primary focus:border-primary shadow-sm transition-all"
              placeholder="Buscar por nome ou matrícula..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {/* Toggle de Visualização */}
          <div className="flex rounded-xl bg-[#1c2127] p-1 border border-gray-800">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              title="Lista"
            >
              <span className="material-symbols-outlined text-lg">view_list</span>
            </button>
            <button
              onClick={() => setViewMode('hierarchy')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'hierarchy' ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              title="Hierarquia"
            >
              <span className="material-symbols-outlined text-lg">account_tree</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoadingServers && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="size-10 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-slate-500 font-medium">Carregando servidores...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoadingServers && filteredServers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="p-4 rounded-2xl bg-[#1c2127] border border-gray-800">
              <span className="material-symbols-outlined text-4xl text-slate-500">group_off</span>
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-white">Nenhum servidor encontrado</p>
              <p className="text-sm text-slate-500">Tente ajustar sua busca</p>
            </div>
          </div>
        )}

        {/* Visualização em Lista */}
        {!isLoadingServers && filteredServers.length > 0 && viewMode === 'list' && (
          <div className="flex flex-col gap-3">
            {filteredServers.map((server) => (
              <div key={server.id}>
                <ServerCard server={server} />
              </div>
            ))}
          </div>
        )}

        {/* Visualização Hierárquica com Cards Colapsáveis */}
        {!isLoadingServers && filteredServers.length > 0 && viewMode === 'hierarchy' && (
          <div className="flex flex-col gap-4">
            {hierarchyData.map((supGeral) => {
              const isGeralExpanded = shouldAutoExpand || expandedGerais.has(supGeral.id);
              const totalServidores = supGeral.supervisoresArea.reduce((acc, area) => acc + area.servidores.length, 0);

              return (
                <div key={supGeral.id} className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent overflow-hidden shadow-lg">
                  {/* Header Supervisor Geral - Clicável */}
                  <button
                    onClick={() => toggleGeralExpanded(supGeral.id)}
                    className="w-full px-4 py-3 bg-gradient-to-r from-blue-500/15 to-transparent border-b border-blue-500/20 flex items-center gap-3 hover:from-blue-500/25 transition-all cursor-pointer"
                  >
                    <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/30">
                      <span className="material-symbols-outlined text-blue-400">supervisor_account</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Supervisor Geral</p>
                      <p className="text-sm font-bold text-white">{supGeral.name}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/30">
                      {totalServidores} servidores
                    </span>
                    <span className={`material-symbols-outlined text-blue-400 transition-transform duration-300 ${isGeralExpanded ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </button>

                  {/* Supervisores de Área - Colapsável */}
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isGeralExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="p-3 space-y-3">
                      {supGeral.supervisoresArea.map((supArea) => {
                        const areaKey = `${supGeral.id}-${supArea.id}`;
                        const isAreaExpanded = shouldAutoExpand || expandedAreas.has(areaKey);
                        const filteredAreaServers = supArea.servidores.filter(server =>
                          server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          server.matricula.includes(searchTerm)
                        );

                        return (
                          <div key={supArea.id} className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent overflow-hidden">
                            {/* Header Supervisor de Área - Clicável */}
                            <button
                              onClick={() => toggleAreaExpanded(areaKey)}
                              className="w-full px-3 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2 hover:bg-emerald-500/15 transition-all cursor-pointer"
                            >
                              <div className="p-1.5 rounded-lg bg-emerald-500/20">
                                <span className="material-symbols-outlined text-emerald-400 text-lg">person</span>
                              </div>
                              <div className="flex-1 text-left">
                                <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest">Supervisor de Área</p>
                                <p className="text-xs font-bold text-white">{supArea.name}</p>
                              </div>
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                                {supArea.servidores.length}
                              </span>
                              <span className={`material-symbols-outlined text-emerald-400 text-lg transition-transform duration-300 ${isAreaExpanded ? 'rotate-180' : ''}`}>
                                expand_more
                              </span>
                            </button>

                            {/* Lista de Servidores - Colapsável */}
                            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isAreaExpanded ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                              <div className="p-2 space-y-2">
                                {filteredAreaServers.map((server) => (
                                  <div key={server.id}>
                                    <ServerCard server={server} />
                                  </div>
                                ))}
                                {filteredAreaServers.length === 0 && (
                                  <p className="text-[10px] text-slate-500 text-center py-3">Nenhum servidor encontrado</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal de Registro */}
      {isModalOpen && selectedServer && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-md bg-[#101922] rounded-t-3xl sm:rounded-3xl border-t sm:border border-gray-800 max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Header do Modal */}
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gradient-to-r from-[#1c2127] to-[#252b33] rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full bg-cover bg-center ring-2 ring-primary/30"
                  style={{ backgroundImage: `url('${getAvatarUrl(selectedServer)}')` }}
                />
                <div>
                  <h2 className="text-base font-bold text-white">{selectedServer.name}</h2>
                  <p className="text-[10px] text-slate-400">Mat: {selectedServer.matricula}</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="size-9 flex items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide">
              {/* Seleção de Período */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-primary/10 to-blue-600/10 border border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-lg">date_range</span>
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Período de Referência</p>
                  {isLoadingRecord && <div className="size-3 border border-primary border-t-transparent rounded-full animate-spin"></div>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Ano</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="bg-[#1c2127] border border-gray-700 rounded-lg text-sm p-2.5 text-white focus:ring-primary"
                    >
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Semana Epidemiológica</label>
                    <select
                      value={selectedWeek}
                      onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                      className="bg-[#1c2127] border border-gray-700 rounded-lg text-sm p-2.5 text-white focus:ring-primary"
                    >
                      {weeks.map(w => <option key={w} value={w}>Semana {w.toString().padStart(2, '0')}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Dias da Semana */}
              <div className="space-y-3">
                <DayRow dayNum={1} label="Segunda-feira" data={weekData[1]} onDayChange={handleDayChange} disabled={isRecordLocked} />
                <DayRow dayNum={2} label="Terça-feira" data={weekData[2]} onDayChange={handleDayChange} disabled={isRecordLocked} />
                <DayRow dayNum={3} label="Quarta-feira" data={weekData[3]} onDayChange={handleDayChange} disabled={isRecordLocked} />
                <DayRow dayNum={4} label="Quinta-feira" data={weekData[4]} onDayChange={handleDayChange} disabled={isRecordLocked} />
                <DayRow dayNum={5} label="Sexta-feira" data={weekData[5]} onDayChange={handleDayChange} disabled={isRecordLocked} />

                {/* Sábado Opcional */}
                <div className="pt-3 border-t border-gray-800">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-500">calendar_month</span>
                      <span className="text-sm font-bold text-white">Sábado (Opcional)</span>
                    </div>
                    <button
                      disabled={isRecordLocked}
                      onClick={() => setIsSaturdayActive(!isSaturdayActive)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isSaturdayActive ? 'bg-primary' : 'bg-gray-700'} ${isRecordLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isSaturdayActive ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <DayRow dayNum={6} label="Sábado" isActive={isSaturdayActive} data={weekData[6]} onDayChange={handleDayChange} disabled={isRecordLocked} />
                </div>
              </div>

              {/* Campo de Observação */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-slate-800/50 to-slate-700/30 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-lg">notes</span>
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Observação</p>
                  </div>
                  <span className={`text-xs font-bold ${observacao.length > 750 ? 'text-amber-400' : observacao.length >= 800 ? 'text-red-400' : 'text-slate-500'}`}>
                    {observacao.length}/800
                  </span>
                </div>
                <textarea
                  disabled={isRecordLocked}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value.slice(0, 800))}
                  placeholder={isRecordLocked ? "Sem observações." : "Digite observações sobre o registro desta semana (opcional)..."}
                  maxLength={800}
                  rows={3}
                  className="w-full bg-[#1c2127] border border-gray-700 rounded-lg text-sm p-3 text-white placeholder:text-slate-500 focus:ring-primary focus:border-primary resize-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="p-4 border-t border-gray-800 bg-[#1c2127] rounded-b-3xl">
              <div className="flex gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-700 text-white font-bold text-sm hover:bg-white/5 transition-all"
                >
                  {isRecordLocked ? 'Fechar' : 'Cancelar'}
                </button>
                {!isRecordLocked && (
                  <button
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-white font-bold text-sm shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">save</span>
                    Salvar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ponto;
