
import React, { useState, useEffect } from 'react';
import SupervisorsModal from '../components/SupervisorsModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getEpidemiologicalWeek, getEpidemiologicalWeekRange, getCurrentMonthRange, formatShortDate } from '../utils/dateUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  faltasJustificadas?: number;
  faltasSemJustificativa?: number;
  atestadosCount?: number;
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

  // Estado para seletor de semana epidemiológica (0 = Todas as semanas)
  const [selectedWeek, setSelectedWeek] = useState<number>(getEpidemiologicalWeek());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isWeekSelectorOpen, setIsWeekSelectorOpen] = useState(false);
  const currentWeek = getEpidemiologicalWeek();

  // Estados para exportação PDF
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState<'faltas' | 'atestados'>('faltas');
  const [exportWeeks, setExportWeeks] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (userProfile) {
      fetchDashboardStats();
    }
  }, [userProfile, selectedWeek, selectedYear]);

  const fetchDashboardStats = async () => {
    if (!userProfile) return;

    try {
      setLoadingStats(true);

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

      // Buscar produção total (da semana selecionada ou do ano todo se selectedWeek === 0)
      let productionQuery = supabase.from('weekly_records').select('id')
        .eq('year', selectedYear);

      // Se selectedWeek > 0, filtrar por semana específica
      if (selectedWeek > 0) {
        productionQuery = productionQuery.eq('week_number', selectedWeek);
      }

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

      // Contar férias do MÊS ATUAL usando tabela vacations
      let vacationsCount = 0;
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
      const monthStartStr = monthStart.toISOString().split('T')[0];
      const monthEndStr = monthEnd.toISOString().split('T')[0];

      let vacationsQuery = supabase.from('vacations')
        .select('*', { count: 'exact', head: true })
        .lte('period_start', monthEndStr)
        .gte('period_end', monthStartStr);

      if (serverIds.length > 0 && userProfile.role !== 'super_admin') {
        vacationsQuery = vacationsQuery.in('server_id', serverIds);
      }
      const { count: vacCount } = await (vacationsQuery as any);
      vacationsCount = vacCount || 0;

      // Contar faltas DA SEMANA SELECIONADA
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

      // Contar atestados (tabela absences + status "Atestado Médico" em daily_entries)
      let atestadosCount = 0;

      // Contar da tabela absences - filtrar por semana ou ano
      let atestadosQuery = supabase.from('absences')
        .select('*', { count: 'exact', head: true });

      if (selectedWeek > 0) {
        const weekRange = getEpidemiologicalWeekRange(selectedYear, selectedWeek);
        const weekStartStr = weekRange.start.toISOString().split('T')[0];
        const weekEndStr = weekRange.end.toISOString().split('T')[0];
        atestadosQuery = atestadosQuery
          .lte('start_date', weekEndStr)
          .gte('end_date', weekStartStr);
      } else {
        // Todas as semanas do ano
        atestadosQuery = atestadosQuery
          .gte('start_date', `${selectedYear}-01-01`)
          .lte('start_date', `${selectedYear}-12-31`);
      }

      if (serverIds.length > 0 && userProfile.role !== 'super_admin') {
        atestadosQuery = atestadosQuery.in('server_id', serverIds);
      }
      const { count: absCount } = await (atestadosQuery as any);

      // Contar status "Atestado Médico" em daily_entries
      let atestadosDiarioCount = 0;
      if (weeklyRecordIds.length > 0) {
        const { count: atestadoDiario } = await (supabase
          .from('daily_entries') as any)
          .select('*', { count: 'exact', head: true })
          .in('weekly_record_id', weeklyRecordIds)
          .eq('status', 'Atestado Médico');
        atestadosDiarioCount = atestadoDiario || 0;
      }

      atestadosCount = (absCount || 0) + atestadosDiarioCount;

      setStats({
        serversCount: serversCount || 0,
        weeklyRecordsCount: 0, // Removido - não será usado
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

  // Buscar detalhes de férias do mês atual
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

      // Buscar férias do MÊS ATUAL da tabela vacations
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
      const monthStartStr = monthStart.toISOString().split('T')[0];
      const monthEndStr = monthEnd.toISOString().split('T')[0];
      const currentMonthName = monthNames[monthStart.getMonth()];

      let vacationsQuery = supabase
        .from('vacations')
        .select('*')
        .lte('period_start', monthEndStr)
        .gte('period_end', monthStartStr)
        .order('period_start', { ascending: true });

      if (userProfile.role !== 'super_admin') {
        vacationsQuery = vacationsQuery.in('server_id', serverIds);
      }

      const { data: vacationsData } = await (vacationsQuery as any);

      // Mapear para o formato esperado
      const vacationData: ServerWithStatus[] = (vacationsData || []).map((vacation: any) => {
        const server = serversData.find((s: any) => s.id === vacation.server_id);
        const startDate = new Date(vacation.period_start);
        const endDate = new Date(vacation.period_end);

        return {
          id: vacation.id,
          name: server?.name || 'Desconhecido',
          matricula: server?.matricula || '',
          status: 'Férias',
          start_date: vacation.period_start,
          end_date: vacation.period_end,
          days_count: vacation.days_count,
          month: currentMonthName,
          year: startDate.getFullYear()
        };
      });

      setVacationServers(vacationData);
    } catch (error) {
      console.error('Error fetching vacation details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Buscar detalhes de faltas (agrupado por servidor e semana)
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

      // Buscar registros semanais com faltas (filtrado pela semana selecionada)
      let weeklyQuery = supabase
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
        .eq('year', selectedYear)
        .in('server_id', serverIds);

      // Filtrar por semana específica se selectedWeek > 0
      if (selectedWeek > 0) {
        weeklyQuery = weeklyQuery.eq('week_number', selectedWeek);
      }

      const { data: weeklyRecords } = await weeklyQuery;

      // Agrupar por servidor e semana (chave: server_id-week_number)
      const faltasMap: Record<string, {
        serverId: string;
        serverName: string;
        matricula: string;
        weekNumber: number;
        year: number;
        faltasJustificadas: number;
        faltasSemJustificativa: number;
      }> = {};

      (weeklyRecords || []).forEach((record: any) => {
        const server = serversData.find((s: any) => s.id === record.server_id);
        if (!server) return;

        const key = `${record.server_id}-${record.week_number}`;

        if (!faltasMap[key]) {
          faltasMap[key] = {
            serverId: record.server_id,
            serverName: server.name,
            matricula: server.matricula,
            weekNumber: record.week_number,
            year: record.year,
            faltasJustificadas: 0,
            faltasSemJustificativa: 0
          };
        }

        record.daily_entries.forEach((entry: any) => {
          if (entry.status === 'Falta Justificada') {
            faltasMap[key].faltasJustificadas++;
          } else if (entry.status === 'Falta Sem Justificativa') {
            faltasMap[key].faltasSemJustificativa++;
          }
        });
      });

      // Converter para array e filtrar apenas quem tem faltas
      const faltasData: ServerWithStatus[] = Object.values(faltasMap)
        .filter(item => item.faltasJustificadas > 0 || item.faltasSemJustificativa > 0)
        .map(item => ({
          id: `${item.serverId}-${item.weekNumber}`,
          name: item.serverName,
          matricula: item.matricula,
          status: item.faltasJustificadas > 0 && item.faltasSemJustificativa > 0
            ? 'Ambas'
            : item.faltasJustificadas > 0
              ? 'Falta Justificada'
              : 'Falta Sem Justificativa',
          week_number: item.weekNumber,
          year: item.year,
          faltasJustificadas: item.faltasJustificadas,
          faltasSemJustificativa: item.faltasSemJustificativa,
          days_count: item.faltasJustificadas + item.faltasSemJustificativa
        }));

      // Ordenar por semana (mais recente primeiro)
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

  // Buscar detalhes de atestados (tabela absences + status "Atestado Médico" em daily_entries)
  // Agrupado por servidor e semana
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

      // Map para agrupar por servidor e semana
      const atestadosMap: Record<string, {
        serverId: string;
        serverName: string;
        matricula: string;
        weekNumber: number;
        year: number;
        atestadosCount: number;
        daysCount: number;
        cid_codes: string[];
      }> = {};

      // Buscar atestados da tabela absences (filtrado pela semana selecionada)
      let absencesQuery = supabase
        .from('absences')
        .select('*')
        .order('start_date', { ascending: false });

      // Filtrar por semana específica ou ano
      if (selectedWeek > 0) {
        const weekRange = getEpidemiologicalWeekRange(selectedYear, selectedWeek);
        const weekStartStr = weekRange.start.toISOString().split('T')[0];
        const weekEndStr = weekRange.end.toISOString().split('T')[0];
        absencesQuery = absencesQuery
          .lte('start_date', weekEndStr)
          .gte('end_date', weekStartStr);
      } else {
        // Todas as semanas do ano
        absencesQuery = absencesQuery
          .gte('start_date', `${selectedYear}-01-01`)
          .lte('start_date', `${selectedYear}-12-31`);
      }

      if (userProfile.role !== 'super_admin') {
        absencesQuery = absencesQuery.in('server_id', serverIds);
      }

      const { data: absences } = await (absencesQuery as any);

      // Processar absences
      (absences || []).forEach((absence: any) => {
        const server = serversData.find((s: any) => s.id === absence.server_id);
        if (!server) return;

        const startDate = new Date(absence.start_date);
        const weekNum = getEpidemiologicalWeek(startDate);
        const year = startDate.getFullYear();
        const key = `${absence.server_id}-${weekNum}-${year}`;

        if (!atestadosMap[key]) {
          atestadosMap[key] = {
            serverId: absence.server_id,
            serverName: server.name,
            matricula: server.matricula,
            weekNumber: weekNum,
            year: year,
            atestadosCount: 0,
            daysCount: 0,
            cid_codes: []
          };
        }

        atestadosMap[key].atestadosCount++;
        atestadosMap[key].daysCount += absence.days_count || 1;
        if (absence.cid_code && !atestadosMap[key].cid_codes.includes(absence.cid_code)) {
          atestadosMap[key].cid_codes.push(absence.cid_code);
        }
      });

      // Buscar também registros diários com status "Atestado Médico" (filtrado pela semana selecionada)
      let weeklyQuery = supabase
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
        .eq('year', selectedYear)
        .in('server_id', serverIds);

      // Filtrar por semana específica se selectedWeek > 0
      if (selectedWeek > 0) {
        weeklyQuery = weeklyQuery.eq('week_number', selectedWeek);
      }

      const { data: weeklyRecords } = await weeklyQuery;

      // Processar daily_entries com status "Atestado Médico"
      (weeklyRecords || []).forEach((record: any) => {
        const server = serversData.find((s: any) => s.id === record.server_id);
        if (!server) return;

        const atestados = record.daily_entries.filter((e: any) => e.status === 'Atestado Médico');
        if (atestados.length === 0) return;

        const key = `${record.server_id}-${record.week_number}-${record.year}`;

        if (!atestadosMap[key]) {
          atestadosMap[key] = {
            serverId: record.server_id,
            serverName: server.name,
            matricula: server.matricula,
            weekNumber: record.week_number,
            year: record.year,
            atestadosCount: 0,
            daysCount: 0,
            cid_codes: []
          };
        }

        atestadosMap[key].atestadosCount += atestados.length;
        atestadosMap[key].daysCount += atestados.length; // Cada entrada = 1 dia
      });

      // Converter para array
      const allAtestados: ServerWithStatus[] = Object.values(atestadosMap).map(item => ({
        id: `${item.serverId}-${item.weekNumber}-${item.year}`,
        name: item.serverName,
        matricula: item.matricula,
        status: 'Atestado Médico',
        week_number: item.weekNumber,
        year: item.year,
        type: 'Atestado Médico',
        days_count: item.daysCount,
        atestadosCount: item.atestadosCount,
        cid_code: item.cid_codes.join(', ')
      }));

      // Ordenar por semana (mais recente primeiro)
      allAtestados.sort((a, b) => (b.week_number || 0) - (a.week_number || 0));

      setAtestadosServers(allAtestados);
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

  // Função para exportar PDF de Faltas
  const handleExportFaltasPDF = () => {
    if (faltasServers.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    setIsExporting(true);
    try {
      const doc = new jsPDF();

      // Cabeçalho
      doc.setFontSize(16);
      doc.text('Relatório de Faltas - Endemias', 14, 20);

      doc.setFontSize(10);
      doc.text(`Período: ${selectedWeek === 0 ? `Ano ${selectedYear}` : `Semana ${selectedWeek}/${selectedYear}`}`, 14, 30);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 35);
      if (userProfile) {
        doc.text(`Emitido por: ${userProfile.name}`, 14, 40);
      }

      // Preparar dados da tabela
      const tableBody = faltasServers.map(server => [
        `Semana ${String(server.week_number).padStart(2, '0')}`,
        server.name,
        server.matricula,
        server.faltasJustificadas || 0,
        server.faltasSemJustificativa || 0,
        (server.faltasJustificadas || 0) + (server.faltasSemJustificativa || 0)
      ]);

      autoTable(doc, {
        startY: 50,
        head: [['Semana', 'Servidor', 'Matrícula', 'Justificadas', 'S/ Justif.', 'Total']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [239, 68, 68], textColor: 255 },
        styles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [250, 250, 250] }
      });

      // Totais
      const totalJust = faltasServers.reduce((sum, s) => sum + (s.faltasJustificadas || 0), 0);
      const totalSem = faltasServers.reduce((sum, s) => sum + (s.faltasSemJustificativa || 0), 0);
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.text(`Total Justificadas: ${totalJust} | S/ Justificativa: ${totalSem} | Total Geral: ${totalJust + totalSem}`, 14, finalY);

      doc.save(`relatorio_faltas_${selectedWeek === 0 ? 'ano' : 'sem' + selectedWeek}_${selectedYear}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  // Função para exportar PDF de Atestados
  const handleExportAtestadosPDF = () => {
    if (atestadosServers.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    setIsExporting(true);
    try {
      const doc = new jsPDF();

      // Cabeçalho
      doc.setFontSize(16);
      doc.text('Relatório de Atestados Médicos - Endemias', 14, 20);

      doc.setFontSize(10);
      doc.text(`Período: ${selectedWeek === 0 ? `Ano ${selectedYear}` : `Semana ${selectedWeek}/${selectedYear}`}`, 14, 30);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 35);
      if (userProfile) {
        doc.text(`Emitido por: ${userProfile.name}`, 14, 40);
      }

      // Preparar dados da tabela
      const tableBody = atestadosServers.map(server => [
        `Semana ${String(server.week_number).padStart(2, '0')}`,
        server.name,
        server.matricula,
        server.days_count || 0,
        server.cid_code || '-'
      ]);

      autoTable(doc, {
        startY: 50,
        head: [['Semana', 'Servidor', 'Matrícula', 'Dias', 'CID']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: 255 },
        styles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [250, 250, 250] }
      });

      // Total
      const totalDias = atestadosServers.reduce((sum, s) => sum + (s.days_count || 0), 0);
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.text(`Total de Servidores: ${atestadosServers.length} | Total de Dias: ${totalDias}`, 14, finalY);

      doc.save(`relatorio_atestados_${selectedWeek === 0 ? 'ano' : 'sem' + selectedWeek}_${selectedYear}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF.');
    } finally {
      setIsExporting(false);
    }
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
                  <p className="text-xs text-slate-400">{monthNames[new Date().getMonth()]} de {new Date().getFullYear()}</p>
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
                  <p className="text-sm text-slate-500">Nenhum servidor em férias neste mês</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vacationServers.map((server) => (
                    <div key={server.id} className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                      <div
                        className="size-10 rounded-full bg-cover bg-center ring-2 ring-blue-500/30"
                        style={{ backgroundImage: `url('https://ui-avatars.com/api/?name=${encodeURIComponent(server.name)}&background=3b82f6&color=fff&size=72')` }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">{server.name}</p>
                        <p className="text-[10px] text-slate-500">Mat: {server.matricula}</p>
                        {server.start_date && server.end_date && (
                          <p className="text-[10px] text-blue-400 mt-0.5">
                            {new Date(server.start_date).toLocaleDateString('pt-BR')} - {new Date(server.end_date).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[9px] font-bold">
                          FÉRIAS
                        </span>
                        {server.days_count && (
                          <span className="text-[10px] text-slate-500">{server.days_count} dias</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
                  <p className="text-xs text-slate-400">
                    {selectedWeek === 0 ? `Ano ${selectedYear}` : `Semana ${selectedWeek}/${selectedYear}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportFaltasPDF}
                  disabled={isExporting || faltasServers.length === 0}
                  className="px-3 py-2 flex items-center gap-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                  PDF
                </button>
                <button onClick={() => setIsFaltasModalOpen(false)} className="size-9 flex items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
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
                ) as [string, ServerWithStatus[]][]).sort(([a], [b]) => b.localeCompare(a)).map(([week, servers]) => {
                  // Calcular total de faltas na semana
                  const totalFaltas = servers.reduce((sum, s) => sum + (s.days_count || 0), 0);

                  return (
                    <div key={week} className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
                      <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
                        <span className="text-xs font-bold text-red-400 uppercase">{week} • {new Date().getFullYear()}</span>
                        <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold">
                          {servers.length} servidor(es) • {totalFaltas} falta(s)
                        </span>
                      </div>
                      <div className="p-2 space-y-2">
                        {servers.map((server) => (
                          <div key={server.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#101922]">
                            <div
                              className="size-9 rounded-full bg-cover bg-center ring-1 ring-gray-700"
                              style={{ backgroundImage: `url('https://ui-avatars.com/api/?name=${encodeURIComponent(server.name)}&background=ef4444&color=fff&size=72')` }}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-bold text-white">{server.name}</p>
                              <p className="text-[10px] text-slate-500">Mat: {server.matricula}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {(server.faltasJustificadas || 0) > 0 && (
                                <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-amber-500/20 text-amber-400">
                                  {server.faltasJustificadas} JUSTIFICADA{(server.faltasJustificadas || 0) > 1 ? 'S' : ''}
                                </span>
                              )}
                              {(server.faltasSemJustificativa || 0) > 0 && (
                                <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-red-500/20 text-red-400">
                                  {server.faltasSemJustificativa} S/ JUSTIF.
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
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
                  <p className="text-xs text-slate-400">
                    {selectedWeek === 0 ? `Ano ${selectedYear}` : `Semana ${selectedWeek}/${selectedYear}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportAtestadosPDF}
                  disabled={isExporting || atestadosServers.length === 0}
                  className="px-3 py-2 flex items-center gap-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                  PDF
                </button>
                <button onClick={() => setIsAtestadosModalOpen(false)} className="size-9 flex items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
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
                ) as [string, ServerWithStatus[]][]).sort(([a], [b]) => b.localeCompare(a)).map(([week, servers]) => {
                  // Calcular total de dias na semana
                  const totalDias = servers.reduce((sum, s) => sum + (s.days_count || 0), 0);

                  return (
                    <div key={week} className="rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                      <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400 uppercase">{week} • {new Date().getFullYear()}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                          {servers.length} servidor(es) • {totalDias} dia(s)
                        </span>
                      </div>
                      <div className="p-2 space-y-2">
                        {servers.map((server) => (
                          <div key={server.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#101922]">
                            <div
                              className="size-9 rounded-full bg-cover bg-center ring-1 ring-gray-700"
                              style={{ backgroundImage: `url('https://ui-avatars.com/api/?name=${encodeURIComponent(server.name)}&background=f59e0b&color=fff&size=72')` }}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-bold text-white">{server.name}</p>
                              <p className="text-[10px] text-slate-500">
                                Mat: {server.matricula}
                                {server.cid_code && ` • CID: ${server.cid_code}`}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 text-[9px] font-bold">
                                {server.days_count} DIA{(server.days_count || 0) > 1 ? 'S' : ''}
                              </span>
                              {(server.atestadosCount || 0) > 1 && (
                                <span className="text-[8px] text-slate-500">
                                  {server.atestadosCount} atestado(s)
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
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
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

        {/* Produção da Semana */}
        <div className="flex flex-col p-4 rounded-2xl bg-[#1c2127] border border-gray-800 shadow-sm transition-all hover:border-primary/30">
          <div className="p-2 rounded-xl bg-green-500/10 text-green-500 w-fit mb-3">
            <span className="material-symbols-outlined text-2xl">work_history</span>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Produção {selectedWeek === 0 ? `Ano ${selectedYear}` : `Sem. ${selectedWeek}`}
          </p>
          <p className="text-2xl font-bold text-white">
            {loadingStats ? '...' : stats.totalProduction.toLocaleString('pt-BR')}
          </p>
        </div>

        {/* Card Semana Epidemiológica com Seletor */}
        <div className="relative flex flex-col p-4 rounded-2xl bg-[#1c2127] border border-gray-800 shadow-sm transition-all hover:border-purple-500/30">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 w-fit mb-3">
            <span className="material-symbols-outlined text-2xl">calendar_month</span>
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Semana Epidemiológica</p>

          {/* Botão do Seletor */}
          <button
            onClick={() => setIsWeekSelectorOpen(!isWeekSelectorOpen)}
            className="flex items-center gap-2 mt-1 hover:bg-purple-500/10 rounded-lg py-1 px-2 -ml-2 transition-colors group"
          >
            <p className="text-2xl font-bold text-white">
              {selectedWeek === 0 ? 'Todas' : `Sem. ${String(selectedWeek).padStart(2, '0')}`}
            </p>
            <span className={`material-symbols-outlined text-purple-400 transition-transform ${isWeekSelectorOpen ? 'rotate-180' : ''}`}>
              expand_more
            </span>
            {selectedWeek === currentWeek && (
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px] font-bold">ATUAL</span>
            )}
            {selectedWeek === 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">ANO</span>
            )}
          </button>

          {/* Dropdown de Semanas */}
          {isWeekSelectorOpen && (
            <>
              {/* Overlay para fechar ao clicar fora */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsWeekSelectorOpen(false)}
              />

              <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#1c2127]/95 backdrop-blur-xl border border-purple-500/30 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2 border-b border-gray-800 bg-purple-500/5">
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Selecione a Semana</p>
                </div>
                <div className="max-h-60 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-purple-500/30">
                  {/* Opção: Todas as Semanas */}
                  <button
                    onClick={() => {
                      setSelectedWeek(0);
                      setIsWeekSelectorOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left ${selectedWeek === 0
                      ? 'bg-emerald-500/20 border border-emerald-500/40'
                      : 'hover:bg-gray-800/50'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${selectedWeek === 0 ? 'text-emerald-400' : 'text-white'}`}>
                        Todas as Semanas
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">ANO {selectedYear}</span>
                    </div>
                    <span className="material-symbols-outlined text-emerald-400 text-sm">calendar_view_month</span>
                  </button>

                  {/* Separador */}
                  <div className="border-t border-gray-700 my-2"></div>

                  {/* Semanas individuais */}
                  {Array.from({ length: 52 }, (_, i) => i + 1).map(week => {
                    const range = getEpidemiologicalWeekRange(selectedYear, week);
                    const isSelected = week === selectedWeek;
                    const isCurrent = week === currentWeek;

                    return (
                      <button
                        key={week}
                        onClick={() => {
                          setSelectedWeek(week);
                          setIsWeekSelectorOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left ${isSelected
                          ? 'bg-purple-500/20 border border-purple-500/40'
                          : 'hover:bg-gray-800/50'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isSelected ? 'text-purple-400' : 'text-white'}`}>
                            Semana {String(week).padStart(2, '0')}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px] font-bold">ATUAL</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {formatShortDate(range.start)} - {formatShortDate(range.end)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
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
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Férias no Mês</p>
              <p className="text-lg font-bold text-white">{loadingStats ? '...' : stats.vacationsCount} servidor(es)</p>
              <p className="text-[10px] text-slate-500">{monthNames[new Date().getMonth()]}</p>
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
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Faltas Sem. {selectedWeek}</p>
              <p className="text-lg font-bold text-white">{loadingStats ? '...' : stats.faltasCount} registro(s)</p>
              <p className="text-[10px] text-slate-500">Na semana selecionada</p>
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
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Atestados Sem. {selectedWeek}</p>
              <p className="text-lg font-bold text-white">{loadingStats ? '...' : stats.atestadosCount} registro(s)</p>
              <p className="text-[10px] text-slate-500">Na semana selecionada</p>
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
