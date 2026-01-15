
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Tables, InsertTables } from '../lib/database.types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type Server = Tables<'servers'>;

interface DailyEntry {
  id?: string;
  day_of_week: number;
  worked_days: number | null;
  production: number | null;
  status: string | null;
}

interface WeeklyRecordWithDetails {
  id: string;
  year: number;
  week_number: number;
  saturday_active: boolean | null;
  status: string | null;
  server_id: string;
  daily_entries: DailyEntry[];
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

const statusColors: Record<string, { bg: string; text: string; abbrev: string }> = {
  'Normal': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', abbrev: 'N' },
  'Férias': { bg: 'bg-blue-500/20', text: 'text-blue-400', abbrev: 'FE' },
  'Falta Justificada': { bg: 'bg-amber-500/20', text: 'text-amber-400', abbrev: 'FJ' },
  'Falta Sem Justificativa': { bg: 'bg-red-500/20', text: 'text-red-400', abbrev: 'FS' },
  'Feriado': { bg: 'bg-purple-500/20', text: 'text-purple-400', abbrev: 'FD' },
  'Facultativo': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', abbrev: 'FA' },
  'Folga de Aniversário': { bg: 'bg-pink-500/20', text: 'text-pink-400', abbrev: 'AN' },
};

const statusOptions = [
  'Normal', 'Férias', 'Falta Justificada', 'Falta Sem Justificativa',
  'Feriado', 'Facultativo', 'Folga de Aniversário'
];

const dayNames = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const Reports: React.FC = () => {
  const { userProfile } = useAuth();

  // Dados
  const [servers, setServers] = useState<Server[]>([]);
  const [hierarchyData, setHierarchyData] = useState<SupervisorGeralWithArea[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de detalhes do servidor
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([getCurrentWeekNumber()]);
  const [serverRecords, setServerRecords] = useState<WeeklyRecordWithDetails[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // Modal de edição
  const [editingRecord, setEditingRecord] = useState<WeeklyRecordWithDetails | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editWeekData, setEditWeekData] = useState<Record<number, DailyEntry>>({});
  const [editWeekDetails, setEditWeekDetails] = useState<{ week: number; year: number }>({ week: 0, year: 0 }); // [NEW] State for week details
  const [isSaving, setIsSaving] = useState(false);

  // Modal de exclusão
  const [recordToDelete, setRecordToDelete] = useState<WeeklyRecordWithDetails | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estado para visualização detalhada (expandir/colapsar semanas)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [serverStats, setServerStats] = useState<{
    totalDays: number;
    totalProduction: number;
    totalFaltas: number;
    totalFerias: number;
    weeksCount: number;
  } | null>(null);

  // Estados para exportação em lote
  const [isBatchExportModalOpen, setIsBatchExportModalOpen] = useState(false);
  const [batchExportYear, setBatchExportYear] = useState(new Date().getFullYear());
  const [batchExportWeeks, setBatchExportWeeks] = useState<number[]>([getCurrentWeekNumber()]);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedServersForExport, setSelectedServersForExport] = useState<string[]>([]);

  const years = Array.from({ length: 6 }, (_, i) => (2025 + i));
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1);

  function getCurrentWeekNumber() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  // Fetch servers on mount
  useEffect(() => {
    if (userProfile) {
      fetchServers();
    }
  }, [userProfile]);

  // Fetch records when modal opens or filters change
  useEffect(() => {
    if (isModalOpen && selectedServer && selectedWeeks.length > 0) {
      fetchServerRecords();
    }
  }, [isModalOpen, selectedServer, selectedYear, selectedWeeks]);

  const fetchServers = async () => {
    if (!userProfile) return;

    try {
      let query = supabase.from('servers').select('*').order('name');

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

  const fetchServerRecords = async () => {
    if (!selectedServer || selectedWeeks.length === 0) return;

    setIsLoadingRecords(true);
    try {
      const { data, error } = await supabase
        .from('weekly_records')
        .select(`
          id,
          year,
          week_number,
          saturday_active,
          status,
          server_id,
          daily_entries (
            id,
            day_of_week,
            worked_days,
            production,
            status
          )
        `)
        .eq('server_id', selectedServer.id)
        .eq('year', selectedYear)
        .in('week_number', selectedWeeks)
        .order('week_number');

      if (error) throw error;

      const records: WeeklyRecordWithDetails[] = (data || []).map((r: any) => ({
        id: r.id,
        year: r.year,
        week_number: r.week_number,
        saturday_active: r.saturday_active,
        status: r.status,
        server_id: r.server_id,
        daily_entries: r.daily_entries || []
      }));

      // Calcular estatísticas resumidas
      let totalDays = 0;
      let totalProduction = 0;
      let totalFaltas = 0;
      let totalFerias = 0;

      records.forEach(record => {
        record.daily_entries.forEach(entry => {
          totalDays += entry.worked_days || 0;
          totalProduction += entry.production || 0;
          if (entry.status === 'Falta Justificada' || entry.status === 'Falta Sem Justificativa') {
            totalFaltas++;
          }
          if (entry.status === 'Férias') {
            totalFerias++;
          }
        });
      });

      setServerStats({
        totalDays,
        totalProduction,
        totalFaltas,
        totalFerias,
        weeksCount: records.length
      });

      setServerRecords(records);
    } catch (err) {
      console.error('Erro ao buscar registros:', err);
    } finally {
      setIsLoadingRecords(false);
    }
  };

  const handleExportPDF = () => {
    if (!selectedServer || serverRecords.length === 0) return;

    const doc = new jsPDF();

    // Cabeçalho
    doc.setFontSize(16);
    doc.text('Relatório de Ponto - Endemias', 14, 20);

    doc.setFontSize(10);
    doc.text(`Servidor: ${selectedServer.name}`, 14, 30);
    doc.text(`Matrícula: ${selectedServer.matricula}`, 14, 35);
    doc.text(`Período: ${selectedWeeks.join(', ')} / ${selectedYear}`, 14, 40);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 14, 45);

    // Tabela
    const tableBody = serverRecords.flatMap(record => {
      const rows = [];
      // Linha de cabeçalho da semana
      rows.push([{ content: `Semana ${record.week_number} - Status: ${record.status || 'Pendente'}`, colSpan: 4, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);

      // Detalhes diários
      const days = [1, 2, 3, 4, 5];
      if (record.saturday_active) days.push(6);

      days.forEach(day => {
        const entry = record.daily_entries.find(e => e.day_of_week === day);
        rows.push([
          dayNames[day],
          entry?.status || '-',
          entry?.worked_days || 0,
          entry?.production || 0
        ]);
      });

      return rows;
    });

    autoTable(doc, {
      startY: 55,
      head: [['Dia', 'Status', 'Dias Trab.', 'Produção']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      styles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 250, 250] }
    });

    doc.save(`relatorio_${selectedServer.name.replace(/\s+/g, '_')}_${selectedYear}.pdf`);
  };

  const handleExportExcel = () => {
    if (!selectedServer || serverRecords.length === 0) return;

    // Preparar dados para o Excel
    const data: any[] = [];

    serverRecords.forEach(record => {
      const days = [1, 2, 3, 4, 5];
      if (record.saturday_active) days.push(6);

      days.forEach(day => {
        const entry = record.daily_entries.find(e => e.day_of_week === day);
        data.push({
          'Semana': record.week_number,
          'Ano': record.year,
          'Servidor': selectedServer.name,
          'Matrícula': selectedServer.matricula,
          'Dia': dayNames[day],
          'Status': entry?.status || 'Não Registrado',
          'Dias Trabalhados': entry?.worked_days || 0,
          'Produção': entry?.production || 0,
          'Observação da Semana': (record as any).notes || ''
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');

    // Ajustar largura das colunas
    const wscols = [
      { wch: 8 }, // Semana
      { wch: 6 }, // Ano
      { wch: 30 }, // Servidor
      { wch: 15 }, // Matrícula
      { wch: 15 }, // Dia
      { wch: 20 }, // Status
      { wch: 15 }, // Dias Trab.
      { wch: 10 }, // Produção
      { wch: 40 } // Obs
    ];
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `relatorio_${selectedServer.name.replace(/\s+/g, '_')}_${selectedYear}.xlsx`);
  };

  // Função para buscar registros de múltiplos servidores
  const fetchBatchRecords = async (serverIds: string[], weeksToFetch: number[], year: number) => {
    const allRecords: { server: Server; records: WeeklyRecordWithDetails[] }[] = [];

    for (const serverId of serverIds) {
      const server = servers.find(s => s.id === serverId);
      if (!server) continue;

      const { data: weeklyRecords, error } = await supabase
        .from('weekly_records')
        .select('*')
        .eq('server_id', serverId)
        .eq('year', year)
        .in('week_number', weeksToFetch)
        .order('week_number', { ascending: true });

      if (error) {
        console.error(`Error fetching records for server ${serverId}:`, error);
        continue;
      }

      const recordsWithEntries: WeeklyRecordWithDetails[] = [];
      for (const record of weeklyRecords || []) {
        const { data: entries } = await supabase
          .from('daily_entries')
          .select('*')
          .eq('weekly_record_id', record.id);

        recordsWithEntries.push({
          ...record,
          daily_entries: entries || []
        });
      }

      allRecords.push({ server, records: recordsWithEntries });
    }

    return allRecords;
  };

  // Exportar PDF em lote
  const handleBatchExportPDF = async () => {
    if (servers.length === 0) return;
    setIsExporting(true);

    try {
      // Usar servidores selecionados ou todos se nenhum foi selecionado
      const serverIds = selectedServersForExport.length > 0
        ? selectedServersForExport
        : servers.map(s => s.id);
      const allData = await fetchBatchRecords(serverIds, batchExportWeeks, batchExportYear);

      const doc = new jsPDF();

      // Capa
      doc.setFontSize(20);
      doc.text('Relatório Consolidado de Ponto', 14, 30);
      doc.setFontSize(12);
      doc.text(`Período: Semanas ${batchExportWeeks.join(', ')} / ${batchExportYear}`, 14, 45);
      doc.text(`Total de Servidores: ${allData.length}`, 14, 55);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 14, 65);
      if (userProfile) {
        doc.text(`Emitido por: ${userProfile.name}`, 14, 75);
      }

      let currentY = 90;

      for (const { server, records } of allData) {
        // Verificar se precisa de nova página
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }

        // Cabeçalho do servidor
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${server.name} - Mat: ${server.matricula}`, 14, currentY);
        currentY += 8;

        if (records.length === 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text('Nenhum registro encontrado para o período.', 14, currentY);
          currentY += 15;
          continue;
        }

        // Tabela de registros
        const tableBody = records.flatMap(record => {
          const rows: any[] = [];
          rows.push([{ content: `Semana ${record.week_number}`, colSpan: 4, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);

          const days = [1, 2, 3, 4, 5];
          if (record.saturday_active) days.push(6);

          days.forEach(day => {
            const entry = record.daily_entries.find(e => e.day_of_week === day);
            rows.push([
              dayNames[day],
              entry?.status || '-',
              entry?.worked_days || 0,
              entry?.production || 0
            ]);
          });

          return rows;
        });

        autoTable(doc, {
          startY: currentY,
          head: [['Dia', 'Status', 'Dias', 'Prod.']],
          body: tableBody,
          theme: 'grid',
          headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 8 },
          styles: { fontSize: 7 },
          margin: { left: 14 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      doc.save(`relatorio_consolidado_${batchExportYear}.pdf`);
      setIsBatchExportModalOpen(false);
    } catch (error) {
      console.error('Error generating batch PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  // Exportar Excel em lote
  const handleBatchExportExcel = async () => {
    if (servers.length === 0) return;
    setIsExporting(true);

    try {
      // Usar servidores selecionados ou todos se nenhum foi selecionado
      const serverIds = selectedServersForExport.length > 0
        ? selectedServersForExport
        : servers.map(s => s.id);
      const allData = await fetchBatchRecords(serverIds, batchExportWeeks, batchExportYear);

      const data: any[] = [];

      for (const { server, records } of allData) {
        for (const record of records) {
          const days = [1, 2, 3, 4, 5];
          if (record.saturday_active) days.push(6);

          days.forEach(day => {
            const entry = record.daily_entries.find(e => e.day_of_week === day);
            data.push({
              'Servidor': server.name,
              'Matrícula': server.matricula,
              'Função': server.role,
              'Semana': record.week_number,
              'Ano': record.year,
              'Dia': dayNames[day],
              'Status': entry?.status || 'Não Registrado',
              'Dias Trabalhados': entry?.worked_days || 0,
              'Produção': entry?.production || 0
            });
          });
        }
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Consolidado');

      const wscols = [
        { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 8 },
        { wch: 6 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 10 }
      ];
      worksheet['!cols'] = wscols;

      XLSX.writeFile(workbook, `relatorio_consolidado_${batchExportYear}.xlsx`);
      setIsBatchExportModalOpen(false);
    } catch (error) {
      console.error('Error generating batch Excel:', error);
      alert('Erro ao gerar Excel. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  // Toggle week for batch export
  const handleToggleBatchWeek = (week: number) => {
    setBatchExportWeeks(prev =>
      prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week].sort((a, b) => a - b)
    );
  };

  // Toggle server for batch export
  const handleToggleServerForExport = (serverId: string) => {
    setSelectedServersForExport(prev =>
      prev.includes(serverId) ? prev.filter(id => id !== serverId) : [...prev, serverId]
    );
  };

  // Select/Deselect all servers
  const handleSelectAllServers = () => {
    if (selectedServersForExport.length === servers.length) {
      setSelectedServersForExport([]);
    } else {
      setSelectedServersForExport(servers.map(s => s.id));
    }
  };

  const handleOpenModal = (server: Server) => {
    setSelectedServer(server);
    setSelectedWeeks([getCurrentWeekNumber()]);
    setExpandedWeeks(new Set());
    setServerStats(null);
    setIsModalOpen(true);
  };

  // Função para expandir/colapsar detalhes da semana
  const toggleWeekExpanded = (weekId: string) => {
    setExpandedWeeks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(weekId)) {
        newSet.delete(weekId);
      } else {
        newSet.add(weekId);
      }
      return newSet;
    });
  };

  const handleToggleWeek = (week: number) => {
    setSelectedWeeks(prev =>
      prev.includes(week)
        ? prev.filter(w => w !== week)
        : [...prev, week].sort((a, b) => a - b)
    );
  };

  const handleEditRecord = (record: WeeklyRecordWithDetails) => {
    setEditingRecord(record);
    setEditWeekDetails({ week: record.week_number, year: record.year }); // [NEW] Initialize week details
    const data: Record<number, DailyEntry> = {};
    for (let day = 1; day <= 6; day++) {
      const entry = record.daily_entries.find(e => e.day_of_week === day);
      data[day] = entry || { day_of_week: day, worked_days: 1, production: 0, status: 'Normal' };
    }
    setEditWeekData(data);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;

    setIsSaving(true);
    try {
      // 1. Atualizar detalhes da semana (se mudou)
      if (editWeekDetails.week !== editingRecord.week_number || editWeekDetails.year !== editingRecord.year) {
        const { error: weekUpdateError } = await (supabase.from('weekly_records') as any)
          .update({
            week_number: editWeekDetails.week,
            year: editWeekDetails.year,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingRecord.id);

        if (weekUpdateError) throw weekUpdateError;
      }

      // 2. Atualizar entradas diárias
      const daysToSave = [1, 2, 3, 4, 5];
      if (editingRecord.saturday_active) daysToSave.push(6);

      const entriesPromises = daysToSave.map(async (day) => {
        const dayData = editWeekData[day];
        const existingEntry = editingRecord.daily_entries.find(e => e.day_of_week === day);

        const payload = {
          weekly_record_id: editingRecord.id, // ID remains the same
          day_of_week: day,
          worked_days: Number(dayData.worked_days),
          production: Number(dayData.production) || 0,
          status: dayData.status,
          updated_at: new Date().toISOString()
        };

        if (existingEntry?.id) {
          return (supabase.from('daily_entries') as any)
            .update(payload)
            .eq('id', existingEntry.id);
        } else {
          return (supabase.from('daily_entries') as any)
            .insert(payload);
        }
      });

      await Promise.all(entriesPromises);
      alert('Registro atualizado com sucesso!');
      setIsEditModalOpen(false);
      fetchServerRecords();
    } catch (err) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecord = (record: WeeklyRecordWithDetails) => {
    setRecordToDelete(record);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!recordToDelete) return;

    setIsDeleting(true);
    try {
      // Excluir entradas diárias primeiro
      await supabase.from('daily_entries').delete().eq('weekly_record_id', recordToDelete.id);

      // Excluir registro semanal
      const { error } = await supabase.from('weekly_records').delete().eq('id', recordToDelete.id);
      if (error) throw error;

      setIsDeleteModalOpen(false);
      fetchServerRecords();
    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir registro.');
    } finally {
      setIsDeleting(false);
      setRecordToDelete(null);
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

  const filteredServers = servers.filter(server =>
    server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.matricula.includes(searchTerm)
  );

  // Renderizar card de servidor
  const renderServerCard = (server: Server) => (
    <div key={server.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#1c2127] border border-gray-800 hover:border-primary/50 transition-all group">
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
        className="px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-105 transition-all flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined text-sm">analytics</span>
        Ver Relatório
      </button>
    </div>
  );

  // Renderizar célula de dia na tabela
  const renderDayCell = (day: number, entry: DailyEntry | undefined) => {
    if (!entry) return <td key={day} className="px-1 py-1 text-center"><span className="text-slate-600 text-[9px]">-</span></td>;
    const statusInfo = statusColors[entry.status || 'Normal'] || statusColors['Normal'];
    return (
      <td key={day} className="px-1 py-1 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${statusInfo.bg} ${statusInfo.text}`} title={entry.status || 'Normal'}>
            {statusInfo.abbrev}
          </span>
          {entry.production !== null && entry.production > 0 && (
            <span className="text-[8px] text-slate-400">{entry.production}</span>
          )}
        </div>
      </td>
    );
  };

  return (
    <div className="flex flex-col min-h-full pb-6 bg-background-dark">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-[#101922] via-[#1c2127] to-[#101922] border-b border-gray-800/50 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30">
              <span className="material-symbols-outlined text-amber-500">analytics</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Relatórios de Ponto</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Selecione um servidor para ver detalhes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Botões de exportação em lote */}
            {userProfile && (
              <button
                onClick={() => setIsBatchExportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 hover:from-amber-500/30 hover:to-orange-500/30 transition-all text-[10px] font-bold"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                Exportar Todos
              </button>
            )}
            <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
              {filteredServers.length} servidores
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {/* Busca */}
        <div className="relative">
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

        {/* Loading */}
        {isLoadingServers && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="size-10 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-slate-500 font-medium">Carregando servidores...</p>
          </div>
        )}

        {/* Lista Hierárquica */}
        {!isLoadingServers && hierarchyData.length > 0 && (
          <div className="flex flex-col gap-4">
            {hierarchyData.map((supGeral) => (
              <div key={supGeral.id} className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent overflow-hidden shadow-lg">
                {/* Header Supervisor Geral */}
                <div className="px-4 py-3 bg-gradient-to-r from-blue-500/15 to-transparent border-b border-blue-500/20 flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/30">
                    <span className="material-symbols-outlined text-blue-400">supervisor_account</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Supervisor Geral</p>
                    <p className="text-sm font-bold text-white">{supGeral.name}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/30">
                    {supGeral.supervisoresArea.reduce((acc, area) => acc + area.servidores.length, 0)} servidores
                  </span>
                </div>

                {/* Supervisores de Área */}
                <div className="p-3 space-y-3">
                  {supGeral.supervisoresArea.map((supArea) => (
                    <div key={supArea.id} className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent overflow-hidden">
                      {/* Header Supervisor de Área */}
                      <div className="px-3 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-500/20">
                          <span className="material-symbols-outlined text-emerald-400 text-lg">person</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest">Supervisor de Área</p>
                          <p className="text-xs font-bold text-white">{supArea.name}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                          {supArea.servidores.length}
                        </span>
                      </div>

                      {/* Lista de Servidores */}
                      <div className="p-2 space-y-2">
                        {supArea.servidores
                          .filter(server =>
                            server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            server.matricula.includes(searchTerm)
                          )
                          .map((server) => renderServerCard(server))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
      </main>

      {/* Modal de Detalhes do Servidor */}
      {isModalOpen && selectedServer && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-2xl bg-[#101922] rounded-t-3xl sm:rounded-3xl border-t sm:border border-gray-800 max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gradient-to-r from-[#1c2127] to-[#252b33] rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-full bg-cover bg-center ring-2 ring-primary/30"
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

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Seleção de Período */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-blue-600/10 border border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-lg">date_range</span>
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Período de Referência</p>
                </div>

                {/* Ano */}
                <div className="mb-3">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Ano</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="w-full bg-[#1c2127] border border-gray-700 rounded-lg text-sm p-2.5 text-white focus:ring-primary"
                  >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                {/* Semanas (Checkboxes) */}
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase mb-2 block">Semanas Epidemiológicas (selecione uma ou mais)</label>
                  <div className="grid grid-cols-8 gap-1.5 max-h-32 overflow-y-auto p-2 bg-[#1c2127] rounded-lg border border-gray-700">
                    {weeks.map(w => (
                      <button
                        key={w}
                        onClick={() => handleToggleWeek(w)}
                        className={`p-2 rounded-lg text-xs font-bold transition-all ${selectedWeeks.includes(w)
                          ? 'bg-primary text-white shadow-lg'
                          : 'bg-gray-800 text-slate-400 hover:bg-gray-700'
                          }`}
                      >
                        {w.toString().padStart(2, '0')}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-500 mt-1">{selectedWeeks.length} semana(s) selecionada(s)</p>
                </div>
              </div>

              {/* Loading Records */}
              {isLoadingRecords && (
                <div className="flex items-center justify-center py-8">
                  <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}


              {/* Cards de Estatísticas Resumidas */}
              {!isLoadingRecords && serverStats && serverRecords.length > 0 && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-[#1c2127] to-[#252b33] border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-400">insights</span>
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Resumo do Período</p>
                    </div>
                    {/* Botões de Exportação */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleExportPDF}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-[10px] font-bold"
                        title="Exportar para PDF"
                      >
                        <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                        PDF
                      </button>
                      <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all text-[10px] font-bold"
                        title="Exportar para Excel"
                      >
                        <span className="material-symbols-outlined text-sm">table_view</span>
                        Excel
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Total de Dias Trabalhados */}
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-emerald-400 text-lg">work</span>
                        <p className="text-[9px] text-emerald-400 font-bold uppercase">Dias Trab.</p>
                      </div>
                      <p className="text-2xl font-bold text-emerald-400">{serverStats.totalDays}</p>
                    </div>
                    {/* Produção Total */}
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-amber-400 text-lg">pest_control</span>
                        <p className="text-[9px] text-amber-400 font-bold uppercase">Produção</p>
                      </div>
                      <p className="text-2xl font-bold text-amber-400">{serverStats.totalProduction}</p>
                    </div>
                    {/* Total de Faltas */}
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-red-400 text-lg">event_busy</span>
                        <p className="text-[9px] text-red-400 font-bold uppercase">Faltas</p>
                      </div>
                      <p className="text-2xl font-bold text-red-400">{serverStats.totalFaltas}</p>
                    </div>
                    {/* Total de Férias */}
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-blue-400 text-lg">beach_access</span>
                        <p className="text-[9px] text-blue-400 font-bold uppercase">Férias</p>
                      </div>
                      <p className="text-2xl font-bold text-blue-400">{serverStats.totalFerias}</p>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-2 text-center">
                    Dados de {serverStats.weeksCount} semana(s) selecionada(s)
                  </p>
                </div>
              )}

              {/* Registros */}
              {!isLoadingRecords && serverRecords.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-primary">table_chart</span>
                    Registros das Semanas
                    <span className="text-[9px] text-slate-500 font-normal ml-auto">Clique para expandir detalhes</span>
                  </h3>

                  {serverRecords.map((record) => {
                    const isExpanded = expandedWeeks.has(record.id);
                    return (
                      <div key={record.id} className="rounded-xl border border-gray-700 bg-[#1c2127] overflow-hidden">
                        {/* Header do Registro - Clicável para expandir */}
                        <div
                          onClick={() => toggleWeekExpanded(record.id)}
                          className="px-3 py-2 bg-gray-800/50 flex items-center justify-between cursor-pointer hover:bg-gray-800/80 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`material-symbols-outlined text-sm text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              chevron_right
                            </span>
                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${record.status === 'submitted'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-400'
                              }`}>
                              Semana {record.week_number.toString().padStart(2, '0')}
                            </span>
                            {record.status === 'submitted' && (
                              <span className="text-[8px] text-emerald-400">✓ Enviado</span>
                            )}
                            {/* Resumo rápido */}
                            <div className="flex items-center gap-2 ml-2">
                              <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[12px]">work</span>
                                {record.daily_entries.reduce((sum, e) => sum + (e.worked_days || 0), 0)}d
                              </span>
                              <span className="text-[9px] text-amber-400 flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[12px]">pest_control</span>
                                {record.daily_entries.reduce((sum, e) => sum + (e.production || 0), 0)}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleEditRecord(record)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-primary/20 hover:text-primary transition-colors"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(record)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-red-500/20 hover:text-red-500 transition-colors"
                              title="Excluir"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        </div>

                        {/* Tabela de Dias - Sempre visível */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-[#101922]/50">
                                {dayNames.slice(1).map((day, idx) => (
                                  <th key={idx} className="px-2 py-2 text-center text-[8px] font-bold text-slate-400 uppercase">{day}</th>
                                ))}
                                <th className="px-2 py-2 text-center text-[8px] font-bold text-emerald-400 uppercase">Dias</th>
                                <th className="px-2 py-2 text-center text-[8px] font-bold text-amber-400 uppercase">Prod.</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {[1, 2, 3, 4, 5, 6].map(day => renderDayCell(day, record.daily_entries.find(e => e.day_of_week === day)))}
                                <td className="px-2 py-2 text-center">
                                  <span className="text-sm font-bold text-emerald-400">
                                    {record.daily_entries.reduce((sum, e) => sum + (e.worked_days || 0), 0)}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <span className="text-sm font-bold text-amber-400">
                                    {record.daily_entries.reduce((sum, e) => sum + (e.production || 0), 0)}
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Detalhes Expandidos de Cada Dia */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-gray-700/50 bg-[#101922]/30">
                            <p className="text-[9px] text-slate-400 uppercase font-bold mb-2 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">calendar_month</span>
                              Detalhes por Dia
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {[1, 2, 3, 4, 5, 6].map(day => {
                                const entry = record.daily_entries.find(e => e.day_of_week === day);
                                if (!entry && day === 6 && !record.saturday_active) return null;
                                const status = entry?.status || '-';
                                const statusInfo = statusColors[status] || { bg: 'bg-gray-500/20', text: 'text-slate-400', abbrev: '-' };

                                return (
                                  <div key={day} className="p-2 rounded-lg bg-[#1c2127] border border-gray-700/50">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] font-bold text-primary">{dayNames[day]}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${statusInfo.bg} ${statusInfo.text}`}>
                                        {status}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[9px]">
                                      <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[10px] text-emerald-400">work</span>
                                        <span className="text-slate-400">Dias:</span>
                                        <span className="font-bold text-emerald-400">{entry?.worked_days ?? 0}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[10px] text-amber-400">pest_control</span>
                                        <span className="text-slate-400">Prod:</span>
                                        <span className="font-bold text-amber-400">{entry?.production ?? 0}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty Records */}
              {!isLoadingRecords && serverRecords.length === 0 && selectedWeeks.length > 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <span className="material-symbols-outlined text-3xl text-slate-500">inbox</span>
                  <p className="text-sm text-slate-500">Nenhum registro encontrado para as semanas selecionadas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#1c2127] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h3 className="text-base font-bold text-white">Editar Semana {editingRecord.week_number}</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Edição da Semana e Ano */}
              <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div>
                  <label className="text-[10px] uppercase font-bold text-primary mb-1 block">Semana Nº</label>
                  <input
                    type="number"
                    min="1" max="53"
                    value={editWeekDetails.week}
                    onChange={(e) => setEditWeekDetails(prev => ({ ...prev, week: parseInt(e.target.value) }))}
                    className="w-full bg-[#1c2127] border border-gray-700 rounded-lg p-2 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-primary mb-1 block">Ano</label>
                  <input
                    type="number"
                    min="2024" max="2030"
                    value={editWeekDetails.year}
                    onChange={(e) => setEditWeekDetails(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                    className="w-full bg-[#1c2127] border border-gray-700 rounded-lg p-2 text-white font-bold"
                  />
                </div>
              </div>

              {[1, 2, 3, 4, 5, 6].map(day => {
                if (day === 6 && !editingRecord.saturday_active) return null;
                const data = editWeekData[day] || { worked_days: 0, production: 0, status: 'Normal' };
                return (
                  <div key={day} className="p-3 rounded-xl bg-[#101922] border border-gray-700 space-y-2">
                    <p className="text-xs font-bold text-primary">{dayNames[day]}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[8px] text-slate-500 uppercase">Trabalhou</label>
                        <input
                          type="checkbox"
                          checked={Number(data.worked_days) > 0}
                          onChange={(e) => setEditWeekData(prev => ({
                            ...prev,
                            [day]: { ...prev[day], worked_days: e.target.checked ? 1 : 0 }
                          }))}
                          className="size-5 rounded border-gray-700 bg-[#1c2127] text-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] text-slate-500 uppercase">Produção</label>
                        <input
                          type="number"
                          value={data.production || 0}
                          onChange={(e) => setEditWeekData(prev => ({
                            ...prev,
                            [day]: { ...prev[day], production: parseInt(e.target.value) || 0 }
                          }))}
                          className="w-full bg-[#1c2127] border-gray-700 rounded-lg text-xs p-2 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] text-slate-500 uppercase">Status</label>
                        <select
                          value={data.status || 'Normal'}
                          onChange={(e) => setEditWeekData(prev => ({
                            ...prev,
                            [day]: { ...prev[day], status: e.target.value }
                          }))}
                          className="w-full bg-[#1c2127] border-gray-700 rounded-lg text-[10px] p-2 text-white"
                        >
                          {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-800 flex gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 py-3 rounded-xl border border-gray-700 text-white font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Exclusão */}
      {isDeleteModalOpen && recordToDelete && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#1c2127] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <span className="material-symbols-outlined text-red-500 text-3xl">delete_forever</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Excluir Semana {recordToDelete.week_number}?</h3>
              <p className="text-sm text-slate-400 mb-6">
                Todos os registros diários desta semana serão removidos permanentemente. Esta ação não pode ser desfeita.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-700 text-slate-300 font-medium hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                >
                  {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exportação em Lote */}
      {isBatchExportModalOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#101922] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gradient-to-r from-[#1c2127] to-[#252b33]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
                  <span className="material-symbols-outlined text-amber-400">download</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Exportar Relatório em Lote</h2>
                  <p className="text-[10px] text-slate-400">{servers.length} servidores disponíveis</p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchExportModalOpen(false)}
                className="size-9 flex items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Ano */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ano</label>
                <select
                  value={batchExportYear}
                  onChange={(e) => setBatchExportYear(parseInt(e.target.value))}
                  className="w-full bg-[#1c2127] border border-gray-700 rounded-xl text-sm p-3 text-white focus:ring-primary [&>option]:bg-[#1c2127]"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* Semanas */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Semanas Epidemiológicas ({batchExportWeeks.length} selecionada(s))
                </label>
                <div className="grid grid-cols-8 gap-1.5 max-h-40 overflow-y-auto p-2 bg-[#1c2127] rounded-xl border border-gray-700">
                  {weeks.map(w => (
                    <button
                      key={w}
                      onClick={() => handleToggleBatchWeek(w)}
                      className={`p-2 rounded-lg text-xs font-bold transition-all ${batchExportWeeks.includes(w)
                        ? 'bg-amber-500 text-white shadow-lg'
                        : 'bg-gray-800 text-slate-400 hover:bg-gray-700'
                        }`}
                    >
                      {w.toString().padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seleção de Servidores */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Servidores ({selectedServersForExport.length > 0 ? selectedServersForExport.length : servers.length} selecionado(s))
                  </label>
                  <button
                    onClick={handleSelectAllServers}
                    className="text-[9px] font-bold text-primary hover:underline"
                  >
                    {selectedServersForExport.length === servers.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto p-2 bg-[#1c2127] rounded-xl border border-gray-700 space-y-1">
                  {servers.map(server => (
                    <button
                      key={server.id}
                      onClick={() => handleToggleServerForExport(server.id)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all ${selectedServersForExport.includes(server.id) || selectedServersForExport.length === 0
                          ? 'bg-emerald-500/20 border border-emerald-500/30'
                          : 'bg-gray-800 border border-transparent'
                        }`}
                    >
                      <div className={`size-4 rounded flex items-center justify-center border ${selectedServersForExport.includes(server.id) || selectedServersForExport.length === 0
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-gray-600'
                        }`}>
                        {(selectedServersForExport.includes(server.id) || selectedServersForExport.length === 0) && (
                          <span className="material-symbols-outlined text-white text-[10px]">check</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{server.name}</p>
                        <p className="text-[9px] text-slate-500">Mat: {server.matricula}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-500">
                  {selectedServersForExport.length === 0
                    ? 'Todos os servidores serão incluídos'
                    : `${selectedServersForExport.length} servidor(es) selecionado(s)`}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-800 bg-[#1c2127] flex gap-3">
              <button
                onClick={() => setIsBatchExportModalOpen(false)}
                disabled={isExporting}
                className="flex-1 py-3 rounded-xl border border-gray-700 text-slate-300 font-medium hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleBatchExportPDF}
                disabled={isExporting || batchExportWeeks.length === 0}
                className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 font-bold hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isExporting ? (
                  <><div className="size-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div> Gerando...</>
                ) : (
                  <><span className="material-symbols-outlined text-sm">picture_as_pdf</span> PDF</>
                )}
              </button>
              <button
                onClick={handleBatchExportExcel}
                disabled={isExporting || batchExportWeeks.length === 0}
                className="flex-1 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isExporting ? (
                  <><div className="size-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div> Gerando...</>
                ) : (
                  <><span className="material-symbols-outlined text-sm">table_view</span> Excel</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
