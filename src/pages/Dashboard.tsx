
import React, { useState, useEffect } from 'react';
import SupervisorsModal from '../components/SupervisorsModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getEpidemiologicalWeek } from '../utils/dateUtils';

interface DashboardStats {
  serversCount: number;
  weeklyRecordsCount: number;
  totalProduction: number;
  vacationsCount: number;
  faltasCount: number;
  atestadosCount: number;
}

interface ServerWithStatus {
  id: string;
  name: string;
  matricula: string;
  status: string;
  week_number?: number;
  year?: number;
  month?: string;
  start_date?: string;
  end_date?: string;
  type?: string;
  days_count?: number;
  cid_code?: string;
}

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const Dashboard: React.FC = () => {
  const [isSupervisorsModalOpen, setIsSupervisorsModalOpen] = useState(false);
  const [isVacationsModalOpen, setIsVacationsModalOpen] = useState(false);
  const [isFaltasModalOpen, setIsFaltasModalOpen] = useState(false);
  const [isAtestadosModalOpen, setIsAtestadosModalOpen] = useState(false);

  const { userProfile, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    serversCount: 0,
    weeklyRecordsCount: 0,
    totalProduction: 0,
    vacationsCount: 0,
    faltasCount: 0,
    atestadosCount: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Dados para modais
  const [vacationServers, setVacationServers] = useState<ServerWithStatus[]>([]);
  const [faltasServers, setFaltasServers] = useState<ServerWithStatus[]>([]);
  const [atestadosServers, setAtestadosServers] = useState<ServerWithStatus[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (userProfile) {
      fetchDashboardStats();
    }
  }, [userProfile]);

  const fetchDashboardStats = async () => {
    if (!userProfile) return;

    try {
      // Construir query de servidores baseada no role do usuário
      let serversQuery = supabase.from('servers').select('id', { count: 'exact', head: true });

      // Filtrar baseado no role do usuário logado
      if (userProfile.role === 'supervisor_area') {
        serversQuery = serversQuery.eq('supervisor_area_id', userProfile.id);
      } else if (userProfile.role === 'supervisor_geral') {
        serversQuery = serversQuery.eq('supervisor_geral_id', userProfile.id);
      }

      const { count: serversCount } = await (serversQuery as any);

      // Buscar IDs dos servidores para filtrar registros
      let serverIdsQuery = supabase.from('servers').select('id');
      if (userProfile.role === 'supervisor_area') {
        serverIdsQuery = serverIdsQuery.eq('supervisor_area_id', userProfile.id);
      } else if (userProfile.role === 'supervisor_geral') {
        serverIdsQuery = serverIdsQuery.eq('supervisor_geral_id', userProfile.id);
      }

      const { data: serversData } = await (serverIdsQuery as any);
      const serverIds = serversData?.map((s: any) => s.id) || [];

      // Fetch weekly records count (current year)
      const currentYear = new Date().getFullYear();
      let weeklyQuery = supabase.from('weekly_records').select('*', { count: 'exact', head: true }).eq('year', currentYear);
      if (serverIds.length > 0 && userProfile.role !== 'super_admin') {
        weeklyQuery = weeklyQuery.in('server_id', serverIds);
      }
      const { count: weeklyRecordsCount } = await (weeklyQuery as any);

      // Fetch total production from daily_entries
      let productionQuery = supabase.from('weekly_records').select('id').eq('year', currentYear);
      if (serverIds.length > 0 && userProfile.role !== 'super_admin') {
        productionQuery = productionQuery.in('server_id', serverIds);
      }
      const { data: weeklyRecords } = await (productionQuery as any);
      const weeklyRecordIds = weeklyRecords?.map((w: any) => w.id) || [];

      let totalProduction = 0;
      if (weeklyRecordIds.length > 0) {
        const { data: productionData } = await (supabase
          .from('daily_entries') as any)
          .select('production')
          .in('weekly_record_id', weeklyRecordIds);
        totalProduction = productionData?.reduce((sum: number, entry: any) =>
          sum + (entry.production || 0), 0) || 0;
      }

      // Contar servidores em férias (baseado nos daily_entries com status 'Férias')
      let vacationsCount = 0;
      if (weeklyRecordIds.length > 0) {
        const { count } = await (supabase
          .from('daily_entries') as any)
          .select('*', { count: 'exact', head: true })
          .in('weekly_record_id', weeklyRecordIds)
          .eq('status', 'Férias');
        vacationsCount = count || 0;
      }

      // Contar faltas (justificadas e sem justificativa)
      let faltasCount = 0;
      if (weeklyRecordIds.length > 0) {
        const { count: faltaJust } = await (supabase
          .from('daily_entries') as any)
          .select('*', { count: 'exact', head: true })
          .in('weekly_record_id', weeklyRecordIds)
          .eq('status', 'Falta Justificada');

        const { count: faltaSem } = await (supabase
          .from('daily_entries') as any)
          .select('*', { count: 'exact', head: true })
          .in('weekly_record_id', weeklyRecordIds)
          .eq('status', 'Falta Sem Justificativa');

        faltasCount = (faltaJust || 0) + (faltaSem || 0);
      }

      // Contar atestados da tabela absences
      let atestadosCount = 0;
      let atestadosQuery = supabase.from('absences').select('*', { count: 'exact', head: true });
      if (serverIds.length > 0 && userProfile.role !== 'super_admin') {
        atestadosQuery = atestadosQuery.in('server_id', serverIds);
      }
      const { count: absCount } = await (atestadosQuery as any);
      atestadosCount = absCount || 0;

      setStats({
        serversCount: serversCount || 0,
        weeklyRecordsCount: weeklyRecordsCount || 0,
        totalProduction,
        vacationsCount,
        faltasCount,
        atestadosCount
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Buscar detalhes de férias
  const fetchVacationDetails = async () => {
    if (!userProfile) return;

    setLoadingDetails(true);
    try {
      let serverIdsQuery = supabase.from('servers').select('id, name, matricula');
      if (userProfile.role === 'supervisor_area') {
        serverIdsQuery = serverIdsQuery.eq('supervisor_area_id', userProfile.id);
      } else if (userProfile.role === 'supervisor_geral') {
        serverIdsQuery = serverIdsQuery.eq('supervisor_geral_id', userProfile.id);
      }

      const { data: serversData } = await (serverIdsQuery as any);
      const serverIds = serversData?.map((s: any) => s.id) || [];

      if (serverIds.length === 0) {
        setVacationServers([]);
        return;
      }

      // Buscar registros semanais com status Férias
      const currentYear = new Date().getFullYear();
      const { data: weeklyRecords } = await supabase
        .from('weekly_records')
        .select(`
          id,
          server_id,
          week_number,
          year,
          daily_entries!inner (
            status,
            day_of_week
          )
        `)
        .eq('year', currentYear)
        .in('server_id', serverIds);

      // Filtrar registros com férias
      const vacationData: ServerWithStatus[] = [];
      const processedServers = new Set<string>();

      (weeklyRecords || []).forEach((record: any) => {
        const hasVacation = record.daily_entries.some((e: any) => e.status === 'Férias');
        if (hasVacation && !processedServers.has(record.server_id)) {
          const server = serversData.find((s: any) => s.id === record.server_id);
          if (server) {
            // Calcular mês aproximado baseado na semana
            const weekStart = new Date(record.year, 0, 1);
            weekStart.setDate(weekStart.getDate() + (record.week_number - 1) * 7);
            const monthIndex = weekStart.getMonth();

            vacationData.push({
              id: server.id,
              name: server.name,
              matricula: server.matricula,
              status: 'Férias',
              week_number: record.week_number,
              year: record.year,
              month: monthNames[monthIndex]
            });
            processedServers.add(record.server_id);
          }
        }
      });

      setVacationServers(vacationData);
    } catch (error) {
      console.error('Error fetching vacation details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Buscar detalhes de faltas
  const fetchFaltasDetails = async () => {
    if (!userProfile) return;

    setLoadingDetails(true);
    try {
      let serverIdsQuery = supabase.from('servers').select('id, name, matricula');
      if (userProfile.role === 'supervisor_area') {
        serverIdsQuery = serverIdsQuery.eq('supervisor_area_id', userProfile.id);
      } else if (userProfile.role === 'supervisor_geral') {
        serverIdsQuery = serverIdsQuery.eq('supervisor_geral_id', userProfile.id);
      }

      const { data: serversData } = await (serverIdsQuery as any);
      const serverIds = serversData?.map((s: any) => s.id) || [];

      if (serverIds.length === 0) {
        setFaltasServers([]);
        return;
      }

      // Buscar registros semanais com faltas
      const currentYear = new Date().getFullYear();
      const { data: weeklyRecords } = await supabase
        .from('weekly_records')
        .select(`
          id,
          server_id,
          week_number,
          year,
          daily_entries!inner (
            status,
            day_of_week
          )
        `)
        .eq('year', currentYear)
        .in('server_id', serverIds);

      // Agrupar faltas por servidor e semana
      const faltasData: ServerWithStatus[] = [];

      (weeklyRecords || []).forEach((record: any) => {
        const faltas = record.daily_entries.filter((e: any) =>
          e.status === 'Falta Justificada' || e.status === 'Falta Sem Justificativa'
        );

        if (faltas.length > 0) {
          const server = serversData.find((s: any) => s.id === record.server_id);
          if (server) {
            faltas.forEach((falta: any) => {
              faltasData.push({
                id: `${server.id}-${record.week_number}-${falta.day_of_week}`,
                name: server.name,
                matricula: server.matricula,
                status: falta.status,
                week_number: record.week_number,
                year: record.year
              });
            });
          }
        }
      });

      // Ordenar por semana
      faltasData.sort((a, b) => (b.week_number || 0) - (a.week_number || 0));
      setFaltasServers(faltasData);
    } catch (error) {
      console.error('Error fetching faltas details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenVacationsModal = () => {
    fetchVacationDetails();
    setIsVacationsModalOpen(true);
  };

  const handleOpenFaltasModal = () => {
    fetchFaltasDetails();
    setIsFaltasModalOpen(true);
  };

  // Buscar detalhes de atestados
  const fetchAtestadosDetails = async () => {
    if (!userProfile) return;

    setLoadingDetails(true);
    try {
      let serverIdsQuery = supabase.from('servers').select('id, name, matricula');
      if (userProfile.role === 'supervisor_area') {
        serverIdsQuery = serverIdsQuery.eq('supervisor_area_id', userProfile.id);
      } else if (userProfile.role === 'supervisor_geral') {
        serverIdsQuery = serverIdsQuery.eq('supervisor_geral_id', userProfile.id);
      }

      const { data: serversData } = await (serverIdsQuery as any);
      const serverIds = serversData?.map((s: any) => s.id) || [];

      if (serverIds.length === 0) {
        setAtestadosServers([]);
        return;
      }

      // Buscar atestados da tabela absences
      let absencesQuery = supabase
        .from('absences')
        .select('*')
        .order('start_date', { ascending: false });

      if (userProfile.role !== 'super_admin') {
        absencesQuery = absencesQuery.in('server_id', serverIds);
      }

      const { data: absences } = await (absencesQuery as any);

      // Calcular semana epidemiológica para cada atestado
      const atestadosData: ServerWithStatus[] = (absences || []).map((absence: any) => {
        const server = serversData.find((s: any) => s.id === absence.server_id);
        const startDate = new Date(absence.start_date);



        // Calcular semana epidemiológica usando utilitário
        const weekNum = getEpidemiologicalWeek(startDate);

        return {
          id: absence.id,
          name: server?.name || 'Desconhecido',
          matricula: server?.matricula || '',
          status: absence.type,
          week_number: weekNum,
          year: startDate.getFullYear(),
          start_date: absence.start_date,
          end_date: absence.end_date,
          type: absence.type,
          days_count: absence.days_count,
          cid_code: absence.cid_code
        };
      });

      setAtestadosServers(atestadosData);
    } catch (error) {
      console.error('Error fetching atestados details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenAtestadosModal = () => {
    fetchAtestadosDetails();
    setIsAtestadosModalOpen(true);
  };



  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-6">
      <SupervisorsModal
        isOpen={isSupervisorsModalOpen}
        onClose={() => setIsSupervisorsModalOpen(false)}
      />

      {/* Modal de Férias */}
      {isVacationsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsVacationsModalOpen(false)}>
          <div
            className="bg-[#1c2127] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gradient-to-r from-blue-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/20">
                  <span className="material-symbols-outlined text-blue-400">beach_access</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Servidores em Férias</h2>
                  <p className="text-xs text-slate-400">Organizados por mês</p>
                </div>
              </div>
              <button onClick={() => setIsVacationsModalOpen(false)} className="size-9 flex items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : vacationServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <span className="material-symbols-outlined text-4xl text-slate-500">event_available</span>
                  <p className="text-sm text-slate-500">Nenhum servidor em férias no momento</p>
                </div>
              ) : (
                // Agrupar por mês
                (Object.entries(
                  vacationServers.reduce((acc: Record<string, ServerWithStatus[]>, server) => {
                    const month = server.month || 'Indefinido';
                    if (!acc[month]) acc[month] = [];
                    acc[month].push(server);
                    return acc;
                  }, {} as Record<string, ServerWithStatus[]>)
                ) as [string, ServerWithStatus[]][]).map(([month, servers]) => (
                  <div key={month} className="rounded-xl border border-blue-500/20 bg-blue-500/5 overflow-hidden">
                    <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-400 uppercase">{month}</span>
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold">
                        {servers.length} servidor(es)
                      </span>
                    </div>
                    <div className="p-2 space-y-2">
                      {servers.map((server) => (
                        <div key={server.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#101922]">
                          <div
                            className="size-9 rounded-full bg-cover bg-center ring-1 ring-gray-700"
                            style={{ backgroundImage: `url('https://ui-avatars.com/api/?name=${encodeURIComponent(server.name)}&background=3b82f6&color=fff&size=72')` }}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{server.name}</p>
                            <p className="text-[10px] text-slate-500">Mat: {server.matricula} • Semana {server.week_number}</p>
                          </div>
                          <span className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[9px] font-bold">
                            FÉRIAS
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Faltas */}
      {isFaltasModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsFaltasModalOpen(false)}>
          <div
            className="bg-[#1c2127] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gradient-to-r from-red-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-500/20">
                  <span className="material-symbols-outlined text-red-400">medical_information</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Faltas Registradas</h2>
                  <p className="text-xs text-slate-400">Organizadas por semana epidemiológica</p>
                </div>
              </div>
              <button onClick={() => setIsFaltasModalOpen(false)} className="size-9 flex items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : faltasServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <span className="material-symbols-outlined text-4xl text-slate-500">check_circle</span>
                  <p className="text-sm text-slate-500">Nenhuma falta registrada</p>
                </div>
              ) : (
                // Agrupar por semana
                (Object.entries(
                  faltasServers.reduce((acc: Record<string, ServerWithStatus[]>, server) => {
                    const week = `Semana ${String(server.week_number).padStart(2, '0')}`;
                    if (!acc[week]) acc[week] = [];
                    acc[week].push(server);
                    return acc;
                  }, {} as Record<string, ServerWithStatus[]>)
                ) as [string, ServerWithStatus[]][]).sort(([a], [b]) => b.localeCompare(a)).map(([week, servers]) => (
                  <div key={week} className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
                    <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
                      <span className="text-xs font-bold text-red-400 uppercase">{week} • {new Date().getFullYear()}</span>
                      <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold">
                        {servers.length} falta(s)
                      </span>
                    </div>
                    <div className="p-2 space-y-2">
                      {servers.map((server, idx) => (
                        <div key={`${server.id}-${idx}`} className="flex items-center gap-3 p-2 rounded-lg bg-[#101922]">
                          <div
                            className="size-9 rounded-full bg-cover bg-center ring-1 ring-gray-700"
                            style={{ backgroundImage: `url('https://ui-avatars.com/api/?name=${encodeURIComponent(server.name)}&background=ef4444&color=fff&size=72')` }}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{server.name}</p>
                            <p className="text-[10px] text-slate-500">Mat: {server.matricula}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-lg text-[9px] font-bold ${server.status === 'Falta Justificada'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-red-500/20 text-red-400'
                            }`}>
                            {server.status === 'Falta Justificada' ? 'JUSTIFICADA' : 'S/ JUSTIF.'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Atestados */}
      {isAtestadosModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsAtestadosModalOpen(false)}>
          <div
            className="bg-[#1c2127] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gradient-to-r from-amber-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20">
                  <span className="material-symbols-outlined text-amber-400">healing</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Atestados Médicos</h2>
                  <p className="text-xs text-slate-400">Organizados por semana epidemiológica</p>
                </div>
              </div>
              <button onClick={() => setIsAtestadosModalOpen(false)} className="size-9 flex items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : atestadosServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <span className="material-symbols-outlined text-4xl text-slate-500">check_circle</span>
                  <p className="text-sm text-slate-500">Nenhum atestado registrado</p>
                </div>
              ) : (
                // Agrupar por semana
                (Object.entries(
                  atestadosServers.reduce((acc: Record<string, ServerWithStatus[]>, server) => {
                    const week = `Semana ${String(server.week_number).padStart(2, '0')}`;
                    if (!acc[week]) acc[week] = [];
                    acc[week].push(server);
                    return acc;
                  }, {} as Record<string, ServerWithStatus[]>)
                ) as [string, ServerWithStatus[]][]).sort(([a], [b]) => b.localeCompare(a)).map(([week, servers]) => (
                  <div key={week} className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                    <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400 uppercase">{week} • {new Date().getFullYear()}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                        {servers.length} atestado(s)
                      </span>
                    </div>
                    <div className="p-2 space-y-2">
                      {servers.map((server, idx) => (
                        <div key={`${server.id}-${idx}`} className="flex items-center gap-3 p-2 rounded-lg bg-[#101922]">
                          <div
                            className="size-9 rounded-full bg-cover bg-center ring-1 ring-gray-700"
                            style={{ backgroundImage: `url('https://ui-avatars.com/api/?name=${encodeURIComponent(server.name)}&background=f59e0b&color=fff&size=72')` }}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{server.name}</p>
                            <p className="text-[10px] text-slate-500">
                              Mat: {server.matricula} • {server.days_count} dia(s)
                              {server.cid_code && ` • CID: ${server.cid_code}`}
                            </p>
                          </div>
                          <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-[9px] font-bold">
                            {server.type || 'ATESTADO'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <header className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0">
            <div
              className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 ring-2 ring-primary/20"
              style={{ backgroundImage: `url("${userProfile?.avatar_url || (userProfile?.name ? 'https://ui-avatars.com/api/?name=' + userProfile.name : 'https://ui-avatars.com/api/?name=User')}")` }}
            />
            <div className="absolute bottom-0 right-0 size-3 rounded-full bg-green-500 border-2 border-[#101922]"></div>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-white tracking-tight">Painel</h1>
            <p className="text-xs text-slate-400 font-medium">Bem-vindo, {userProfile?.name || 'Usuário'}</p>
          </div>
        </div>
        <button className="flex size-10 items-center justify-center rounded-full bg-[#1c2127] relative border border-gray-800 hover:bg-gray-800 transition-colors">
          <span className="material-symbols-outlined text-slate-300">notifications</span>
          <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-red-500 ring-2 ring-[#1c2127]"></span>
        </button>
      </header>


      {/* Seção de Resumo Geral */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Nº Servidores */}
        <div className="flex flex-col p-4 rounded-2xl bg-[#1c2127] border border-gray-800 shadow-sm transition-all hover:border-primary/30">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 w-fit mb-3">
            <span className="material-symbols-outlined text-2xl">groups</span>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nº Servidores</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-white">
              {loadingStats ? '...' : stats.serversCount}
            </p>
          </div>
        </div>

        {/* Registros Semanais */}
        <div className="flex flex-col p-4 rounded-2xl bg-[#1c2127] border border-gray-800 shadow-sm transition-all hover:border-primary/30">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 w-fit mb-3">
            <span className="material-symbols-outlined text-2xl">monitoring</span>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Registros</p>
          <p className="text-2xl font-bold text-white">
            {loadingStats ? '...' : stats.weeklyRecordsCount}
          </p>
        </div>

        {/* Produção Total */}
        <div className="flex flex-col p-4 rounded-2xl bg-[#1c2127] border border-gray-800 shadow-sm transition-all hover:border-primary/30">
          <div className="p-2 rounded-xl bg-green-500/10 text-green-500 w-fit mb-3">
            <span className="material-symbols-outlined text-2xl">work_history</span>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Produção Total</p>
          <p className="text-2xl font-bold text-white">
            {loadingStats ? '...' : stats.totalProduction.toLocaleString('pt-BR')}
          </p>
        </div>

        {/* Resumo */}
        <div className="flex flex-col p-4 rounded-2xl bg-[#1c2127] border border-gray-800 shadow-sm transition-all hover:border-primary/30">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 w-fit mb-3">
            <span className="material-symbols-outlined text-2xl">summarize</span>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Semana Atual</p>
          <p className="text-2xl font-bold text-white">Sem. {getEpidemiologicalWeek()}</p>
        </div>
      </section>

      {/* Indicadores de Servidores - Cards Clicáveis */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xl font-bold text-white">Indicadores</h3>
          <span className="text-[10px] text-slate-500">Clique para detalhes</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {/* Card Férias */}
          <button
            onClick={handleOpenVacationsModal}
            className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 hover:border-blue-500/50 transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center justify-center size-12 rounded-xl bg-blue-500/20 text-blue-400 shrink-0 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-2xl">beach_access</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Em Férias</p>
              <p className="text-lg font-bold text-white">{loadingStats ? '...' : stats.vacationsCount} registro(s)</p>
              <p className="text-[10px] text-slate-500">Clique para ver por mês</p>
            </div>
            <div className="size-8 flex items-center justify-center rounded-full text-blue-400 group-hover:bg-blue-500/20 transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </div>
          </button>

          {/* Card Faltas */}
          <button
            onClick={handleOpenFaltasModal}
            className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 hover:border-red-500/50 transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center justify-center size-12 rounded-xl bg-red-500/20 text-red-400 shrink-0 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-2xl">event_busy</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Faltas</p>
              <p className="text-lg font-bold text-white">{loadingStats ? '...' : stats.faltasCount} registro(s)</p>
              <p className="text-[10px] text-slate-500">Clique para ver por semana</p>
            </div>
            <div className="size-8 flex items-center justify-center rounded-full text-red-400 group-hover:bg-red-500/20 transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </div>
          </button>

          {/* Card Atestados */}
          <button
            onClick={handleOpenAtestadosModal}
            className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 hover:border-amber-500/50 transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center justify-center size-12 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-2xl">healing</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Atestados</p>
              <p className="text-lg font-bold text-white">{loadingStats ? '...' : stats.atestadosCount} registro(s)</p>
              <p className="text-[10px] text-slate-500">Clique para ver por semana</p>
            </div>
            <div className="size-8 flex items-center justify-center rounded-full text-amber-400 group-hover:bg-amber-500/20 transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
