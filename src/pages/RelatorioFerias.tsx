import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import type { Tables } from '../lib/database.types';
import { useAuth } from '../contexts/AuthContext';
import { HISTORICO_FERIAS } from '../data/historicoFerias';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type Server = Tables<'servers'>;
type Vacation = Tables<'vacations'>;

type ServidorRelatorio = {
  id: string;
  matricula: string;
  nome: string;
  admissao: string;
  admissaoDate: Date;
  periodosAdquiridos: number;
  feriasGozadas: number;
  feriasVencidas: number;
  proximoVencimento: Date | null;
  proximoVencimentoStr: string;
  diasParaVencer: number | null;
  status: 'vencida' | 'vencendo' | 'em_dia' | 'em_ferias' | 'programado';
  statusLabel: string;
  programacao: string | null;
};

type SortKey = 'nome' | 'matricula' | 'admissao' | 'feriasVencidas' | 'diasParaVencer' | 'status';
type SortDir = 'asc' | 'desc';
type FilterStatus = 'todos' | 'vencida' | 'vencendo' | 'em_dia' | 'em_ferias' | 'programado';

const formatDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const parseDate = (value: string) => {
  if (!value) return new Date('invalid');
  if (value.includes('/')) {
    const [day, month, year] = value.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getPeriodosAdquiridos = (admissao: string, targetDate: Date = new Date()) => {
  const admissaoDate = parseDate(admissao);
  if (isNaN(admissaoDate.getTime())) return 0;
  let periodos = targetDate.getFullYear() - admissaoDate.getFullYear();
  const monthDiff = targetDate.getMonth() - admissaoDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && targetDate.getDate() < admissaoDate.getDate())) {
    periodos--;
  }
  return Math.max(0, periodos);
};

const diffDays = (a: Date, b: Date) => Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

const RelatorioFerias: React.FC = () => {
  const { userProfile } = useAuth();
  const [data, setData] = useState<ServidorRelatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos');
  const [sortKey, setSortKey] = useState<SortKey>('feriasVencidas');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [diasLimiteVencendo, setDiasLimiteVencendo] = useState(90);

  const fetchData = async () => {
    if (!userProfile) return;
    setLoading(true);

    try {
      let serversQuery = supabase
        .from('servers')
        .select('id, matricula, name, hire_date, supervisor_geral_id, supervisor_area_id')
        .order('name', { ascending: true });

      if (userProfile.role === 'supervisor_area') {
        serversQuery = serversQuery.eq('supervisor_area_id', userProfile.id);
      } else if (userProfile.role === 'supervisor_geral') {
        serversQuery = serversQuery.eq('supervisor_geral_id', userProfile.id);
      }

      const { data: serversData, error: serversError } = await (serversQuery as any);
      if (serversError) throw serversError;

      const servers = (serversData || []) as Pick<Server, 'id' | 'matricula' | 'name' | 'hire_date'>[];
      if (servers.length === 0) { setData([]); return; }

      const serverIds = servers.map((s) => s.id);
      const { data: vacationsData, error: vacationsError } = await (supabase
        .from('vacations')
        .select('*')
        .in('server_id', serverIds)
        .neq('status', 'cancelled')
        .order('period_start', { ascending: true }) as any);

      if (vacationsError) throw vacationsError;

      const now = new Date();
      const vacationsByServer = new Map<string, Vacation[]>();
      ((vacationsData || []) as Vacation[]).forEach((v) => {
        const cur = vacationsByServer.get(v.server_id) || [];
        cur.push(v);
        vacationsByServer.set(v.server_id, cur);
      });

      const mapped: ServidorRelatorio[] = servers.map((server) => {
        const hireDate = server.hire_date || '';
        const vacations = vacationsByServer.get(server.id) || [];
        const consumedCount = vacations.filter((v) => parseDate(v.period_start) <= now).length;
        const futureVacation = vacations.find((v) => parseDate(v.period_start) > now) || null;
        const activeVacation = vacations.find((v) => {
          const start = parseDate(v.period_start);
          const end = parseDate(v.period_end);
          return start <= now && end >= now;
        }) || null;

        const periodosAdquiridos = getPeriodosAdquiridos(hireDate);
        const admissaoDate = parseDate(hireDate);

        // Historical data from migration
        const normalizedMatricula = server.matricula.replace(/[-_]/g, '');
        const historico = HISTORICO_FERIAS[normalizedMatricula] || HISTORICO_FERIAS[server.matricula];
        let historicalConsumed = 0;
        if (historico && hireDate) {
          // A data base de extração dos dados legados foi fixada no início de 2025.
          const dataMigracao = new Date('2025-01-01T12:00:00');
          const periodosNaMigracao = getPeriodosAdquiridos(historico.admissao.split('/').reverse().join('-'), dataMigracao);
          historicalConsumed = Math.max(0, periodosNaMigracao - historico.feriasVencidas);
        }

        const totalConsumed = consumedCount + historicalConsumed;
        const saldoAdquirido = Math.max(0, periodosAdquiridos - totalConsumed);
        const feriasGozadas = Math.min(periodosAdquiridos, totalConsumed);
        
        // A period is legally 'vencido' only if it has passed its concessive period (which is 1 year after acquisition).
        // This means out of all acquired periods, 1 is allowed to be available without being expired.
        const feriasVencidas = Math.max(0, saldoAdquirido - 1);

        // Próximo vencimento
        let proximoVencimento: Date | null = null;
        let proximoVencimentoStr = '-';
        let diasParaVencer: number | null = null;

        if (!isNaN(admissaoDate.getTime())) {
          // The next period to expire is the oldest unconsumed period.
          // It was acquired at (admission + consumed) and expires 2 years after its start.
          const nextDate = new Date(
            admissaoDate.getFullYear() + totalConsumed + 2,
            admissaoDate.getMonth(),
            admissaoDate.getDate()
          );
          proximoVencimento = nextDate;
          proximoVencimentoStr = formatDate(nextDate);
          diasParaVencer = diffDays(nextDate, now);
        }

        // Status
        let status: ServidorRelatorio['status'] = 'em_dia';
        let statusLabel = 'Em dia';

        if (activeVacation) {
          status = 'em_ferias';
          statusLabel = `Em férias até ${formatDate(parseDate(activeVacation.period_end))}`;
        } else if (futureVacation) {
          const start = parseDate(futureVacation.period_start);
          const monthName = MONTH_NAMES[start.getMonth()];
          status = 'programado';
          statusLabel = `Programado: ${monthName}/${start.getFullYear()}`;
        } else if (feriasVencidas > 0) {
          status = 'vencida';
          statusLabel = `${feriasVencidas} Período(s) Vencido(s)`;
        } else if (saldoAdquirido > 0 && diasParaVencer !== null && diasParaVencer <= diasLimiteVencendo && diasParaVencer > 0) {
          status = 'vencendo';
          statusLabel = `Vence em ${diasParaVencer} dias`;
        } else if (saldoAdquirido > 0) {
          status = 'em_dia';
          statusLabel = '1 Período Adquirido';
        }

        const admissaoFormatted = hireDate ? formatDate(parseDate(hireDate)) : '-';

        return {
          id: server.id,
          matricula: server.matricula,
          nome: server.name,
          admissao: admissaoFormatted,
          admissaoDate: admissaoDate,
          periodosAdquiridos,
          feriasGozadas,
          feriasVencidas,
          proximoVencimento,
          proximoVencimentoStr,
          diasParaVencer,
          status,
          statusLabel,
          programacao: futureVacation ? `${MONTH_NAMES[parseDate(futureVacation.period_start).getMonth()]}/${parseDate(futureVacation.period_start).getFullYear()}` : null,
        };
      });

      setData(mapped);
    } catch (error) {
      console.error('Erro ao carregar relatório:', error);
      alert('Não foi possível carregar os dados do relatório.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userProfile]);

  // Stats
  const stats = useMemo(() => {
    const vencidas = data.filter((d) => d.status === 'vencida').length;
    const vencendo = data.filter((d) => d.status === 'vencendo').length;
    const emDia = data.filter((d) => d.status === 'em_dia').length;
    const emFerias = data.filter((d) => d.status === 'em_ferias').length;
    const programados = data.filter((d) => d.status === 'programado').length;
    const totalPeriodosVencidos = data.reduce((sum, d) => sum + d.feriasVencidas, 0);
    return { vencidas, vencendo, emDia, emFerias, programados, total: data.length, totalPeriodosVencidos };
  }, [data]);

  // Filter + Search + Sort
  const processedData = useMemo(() => {
    let result = [...data];

    // Recalculate vencendo status based on dynamic limit
    result = result.map((item) => {
      if (item.status === 'em_dia' && item.diasParaVencer !== null && item.diasParaVencer <= diasLimiteVencendo && item.diasParaVencer > 0) {
        return { ...item, status: 'vencendo' as const, statusLabel: `Vence em ${item.diasParaVencer} dias` };
      }
      if (item.status === 'vencendo' && (item.diasParaVencer === null || item.diasParaVencer > diasLimiteVencendo)) {
        return { ...item, status: 'em_dia' as const, statusLabel: 'Em dia' };
      }
      return item;
    });

    // Filter by status
    if (filterStatus !== 'todos') {
      result = result.filter((d) => d.status === filterStatus);
    }

    // Search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((d) => d.nome.toLowerCase().includes(lower) || d.matricula.toLowerCase().includes(lower));
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'nome': cmp = a.nome.localeCompare(b.nome); break;
        case 'matricula': cmp = a.matricula.localeCompare(b.matricula); break;
        case 'admissao': cmp = a.admissaoDate.getTime() - b.admissaoDate.getTime(); break;
        case 'feriasVencidas': cmp = a.feriasVencidas - b.feriasVencidas; break;
        case 'diasParaVencer': cmp = (a.diasParaVencer ?? 99999) - (b.diasParaVencer ?? 99999); break;
        case 'status': {
          const order = { vencida: 0, vencendo: 1, programado: 2, em_ferias: 3, em_dia: 4 };
          cmp = order[a.status] - order[b.status];
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [data, filterStatus, searchTerm, sortKey, sortDir, diasLimiteVencendo]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'nome' || key === 'matricula' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <span className="material-symbols-outlined text-[14px] opacity-30">unfold_more</span>;
    return <span className="material-symbols-outlined text-[14px] text-primary">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>;
  };

  const getStatusBadge = (item: ServidorRelatorio) => {
    const base = 'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap';
    switch (item.status) {
      case 'vencida':
        return <span className={`${base} bg-red-500/10 text-red-400 border border-red-500/20`}><span className="material-symbols-outlined text-[14px]">error</span>{item.statusLabel}</span>;
      case 'vencendo':
        return <span className={`${base} bg-orange-500/10 text-orange-400 border border-orange-500/20`}><span className="material-symbols-outlined text-[14px]">schedule</span>{item.statusLabel}</span>;
      case 'programado':
        return <span className={`${base} bg-yellow-500/10 text-yellow-400 border border-yellow-500/20`}><span className="material-symbols-outlined text-[14px]">event_available</span>{item.statusLabel}</span>;
      case 'em_ferias':
        return <span className={`${base} bg-blue-500/10 text-blue-400 border border-blue-500/20`}><span className="material-symbols-outlined text-[14px]">beach_access</span>{item.statusLabel}</span>;
      case 'em_dia':
        return <span className={`${base} bg-green-500/10 text-green-400 border border-green-500/20`}><span className="material-symbols-outlined text-[14px]">check_circle</span>{item.statusLabel}</span>;
    }
  };

  const getUrgencyBar = (item: ServidorRelatorio) => {
    if (item.status === 'vencida') return 'bg-red-500';
    if (item.status === 'vencendo') return 'bg-orange-500';
    if (item.status === 'programado') return 'bg-yellow-500';
    if (item.status === 'em_ferias') return 'bg-blue-500';
    return 'bg-green-500';
  };

  // PDF Export
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    let y = 15;

    doc.setFontSize(18);
    doc.text('Relatório de Férias - Análise de Vencimentos', 14, y);
    y += 8;

    doc.setFontSize(10);
    doc.text(`Fundo Municipal de Saúde de Itabuna — Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 14, y);
    y += 5;
    doc.text(`Total: ${processedData.length} servidores | Filtro: ${filterStatus === 'todos' ? 'Todos' : filterStatus}`, 14, y);
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [['Matrícula', 'Nome', 'Admissão', 'Adquiridos', 'Gozadas', 'Vencidas', 'Próx. Vencimento', 'Dias p/ Vencer', 'Situação']],
      body: processedData.map((d) => [
        d.matricula,
        d.nome,
        d.admissao,
        String(d.periodosAdquiridos),
        String(d.feriasGozadas),
        String(d.feriasVencidas),
        d.proximoVencimentoStr,
        d.diasParaVencer !== null ? String(d.diasParaVencer) : '-',
        d.statusLabel,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      styles: { cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 50 },
        8: { cellWidth: 40 },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 8) {
          const status = processedData[data.row.index]?.status;
          if (status === 'vencida') data.cell.styles.textColor = [220, 50, 50];
          else if (status === 'vencendo') data.cell.styles.textColor = [230, 140, 30];
          else if (status === 'em_dia') data.cell.styles.textColor = [50, 180, 80];
        }
      },
    });

    doc.save(`relatorio_ferias_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const filterButtons: { key: FilterStatus; label: string; icon: string; color: string; count: number }[] = [
    { key: 'todos', label: 'Todos', icon: 'groups', color: 'text-gray-400 border-gray-600', count: stats.total },
    { key: 'vencida', label: 'Vencidas', icon: 'error', color: 'text-red-400 border-red-500/30', count: stats.vencidas },
    { key: 'vencendo', label: 'Vencendo', icon: 'schedule', color: 'text-orange-400 border-orange-500/30', count: stats.vencendo },
    { key: 'programado', label: 'Programados', icon: 'event_available', color: 'text-yellow-400 border-yellow-500/30', count: stats.programados },
    { key: 'em_ferias', label: 'Em Férias', icon: 'beach_access', color: 'text-blue-400 border-blue-500/30', count: stats.emFerias },
    { key: 'em_dia', label: 'Em Dia', icon: 'check_circle', color: 'text-green-400 border-green-500/30', count: stats.emDia },
  ];

  return (
    <div className="p-4 md:p-8 animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl md:text-4xl">assessment</span>
            Relatório de Férias
          </h1>
          <p className="text-gray-400 mt-1">
            Análise completa dos períodos de férias vencidas e a vencer.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#222] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium border border-border-dark transition-all shadow-lg shadow-black/20 active:scale-95 w-full md:w-auto justify-center"
          >
            <span className="material-symbols-outlined">refresh</span>
            Atualizar
          </button>
          <button
            onClick={handleExportPDF}
            disabled={loading || processedData.length === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-600/20 active:scale-95 w-full md:w-auto justify-center"
          >
            <span className="material-symbols-outlined">picture_as_pdf</span>
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-surface-dark border border-border-dark rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 bg-gray-500/20 rounded-xl flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-gray-400">groups</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Servidores</p>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-red-400">error</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{stats.vencidas}</p>
          <p className="text-xs text-gray-500 mt-0.5">Vencidas</p>
        </div>
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-orange-400">schedule</span>
          </div>
          <p className="text-2xl font-bold text-orange-400">{stats.vencendo}</p>
          <p className="text-xs text-gray-500 mt-0.5">Vencendo ({diasLimiteVencendo}d)</p>
        </div>
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-yellow-400">event_available</span>
          </div>
          <p className="text-2xl font-bold text-yellow-400">{stats.programados}</p>
          <p className="text-xs text-gray-500 mt-0.5">Programados</p>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-blue-400">beach_access</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">{stats.emFerias}</p>
          <p className="text-xs text-gray-500 mt-0.5">Em Férias</p>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-green-400">check_circle</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{stats.emDia}</p>
          <p className="text-xs text-gray-500 mt-0.5">Em Dia</p>
        </div>
      </div>

      {/* Barra de progresso visual */}
      {stats.total > 0 && (
        <div className="bg-surface-dark border border-border-dark rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">pie_chart</span>
              Distribuição de Status
            </h3>
            <span className="text-xs text-gray-500">{stats.totalPeriodosVencidos} período(s) vencido(s) no total</span>
          </div>
          <div className="flex h-4 rounded-full overflow-hidden bg-[#111] gap-[2px]">
            {stats.vencidas > 0 && (
              <div className="bg-red-500 rounded-full transition-all duration-500" style={{ width: `${(stats.vencidas / stats.total) * 100}%` }} title={`${stats.vencidas} vencidas`} />
            )}
            {stats.vencendo > 0 && (
              <div className="bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${(stats.vencendo / stats.total) * 100}%` }} title={`${stats.vencendo} vencendo`} />
            )}
            {stats.programados > 0 && (
              <div className="bg-yellow-500 rounded-full transition-all duration-500" style={{ width: `${(stats.programados / stats.total) * 100}%` }} title={`${stats.programados} programados`} />
            )}
            {stats.emFerias > 0 && (
              <div className="bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${(stats.emFerias / stats.total) * 100}%` }} title={`${stats.emFerias} em férias`} />
            )}
            {stats.emDia > 0 && (
              <div className="bg-green-500 rounded-full transition-all duration-500" style={{ width: `${(stats.emDia / stats.total) * 100}%` }} title={`${stats.emDia} em dia`} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {stats.vencidas > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Vencidas ({((stats.vencidas / stats.total) * 100).toFixed(0)}%)</span>}
            {stats.vencendo > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />Vencendo ({((stats.vencendo / stats.total) * 100).toFixed(0)}%)</span>}
            {stats.programados > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />Programados ({((stats.programados / stats.total) * 100).toFixed(0)}%)</span>}
            {stats.emFerias > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Em Férias ({((stats.emFerias / stats.total) * 100).toFixed(0)}%)</span>}
            {stats.emDia > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Em Dia ({((stats.emDia / stats.total) * 100).toFixed(0)}%)</span>}
          </div>
        </div>
      )}

      {/* Filtros e Tabela */}
      <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden flex flex-col shadow-xl">
        {/* Toolbar */}
        <div className="p-4 md:p-6 border-b border-border-dark bg-surface-dark/50">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Filtros de status */}
            <div className="flex flex-wrap gap-2">
              {filterButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setFilterStatus(btn.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    filterStatus === btn.key
                      ? `${btn.color} bg-white/5 shadow-inner`
                      : 'text-gray-500 border-transparent hover:border-border-dark hover:text-gray-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{btn.icon}</span>
                  {btn.label}
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${filterStatus === btn.key ? 'bg-white/10' : 'bg-white/5'}`}>
                    {btn.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search + Config */}
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-60">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Buscar servidor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#111111] border border-border-dark text-white rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-gray-500"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-[#111111] border border-border-dark rounded-xl px-3 py-2 shrink-0">
                <span className="material-symbols-outlined text-orange-400 text-[16px]">timer</span>
                <select
                  value={diasLimiteVencendo}
                  onChange={(e) => setDiasLimiteVencendo(Number(e.target.value))}
                  className="bg-transparent text-white text-xs font-medium focus:outline-none cursor-pointer"
                >
                  <option value="30">30 dias</option>
                  <option value="60">60 dias</option>
                  <option value="90">90 dias</option>
                  <option value="120">120 dias</option>
                  <option value="180">180 dias</option>
                  <option value="365">1 ano</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
              Carregando relatório de férias...
            </div>
          ) : processedData.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#111111] text-gray-400 text-xs uppercase tracking-wider">
                  <th className="w-1"></th>
                  <th className="px-4 py-4 font-semibold border-b border-border-dark cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleSort('matricula')}>
                    <div className="flex items-center gap-1">Matrícula <SortIcon column="matricula" /></div>
                  </th>
                  <th className="px-4 py-4 font-semibold border-b border-border-dark cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleSort('nome')}>
                    <div className="flex items-center gap-1">Nome <SortIcon column="nome" /></div>
                  </th>
                  <th className="px-4 py-4 font-semibold border-b border-border-dark cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleSort('admissao')}>
                    <div className="flex items-center gap-1">Admissão <SortIcon column="admissao" /></div>
                  </th>
                  <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Adquiridos</th>
                  <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Gozadas</th>
                  <th className="px-4 py-4 font-semibold border-b border-border-dark text-center cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleSort('feriasVencidas')}>
                    <div className="flex items-center justify-center gap-1">Vencidas <SortIcon column="feriasVencidas" /></div>
                  </th>
                  <th className="px-4 py-4 font-semibold border-b border-border-dark text-center cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleSort('diasParaVencer')}>
                    <div className="flex items-center justify-center gap-1">Próx. Venc. <SortIcon column="diasParaVencer" /></div>
                  </th>
                  <th className="px-4 py-4 font-semibold border-b border-border-dark text-center cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleSort('status')}>
                    <div className="flex items-center justify-center gap-1">Situação <SortIcon column="status" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {processedData.map((item) => (
                  <tr key={item.id} className="hover:bg-[#151515] transition-colors group">
                    <td className="w-1 p-0">
                      <div className={`w-1 h-full min-h-[52px] ${getUrgencyBar(item)} opacity-80 group-hover:opacity-100 transition-opacity`} />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-gray-300 bg-black/40 px-2 py-1 rounded border border-white/5 text-sm">{item.matricula}</span>
                    </td>
                    <td className="px-4 py-3.5 text-white font-medium whitespace-nowrap">{item.nome}</td>
                    <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px] opacity-60">calendar_month</span>
                        {item.admissao}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-300 text-center font-medium">{item.periodosAdquiridos}</td>
                    <td className="px-4 py-3.5 text-gray-300 text-center font-medium">{item.feriasGozadas}</td>
                    <td className="px-4 py-3.5 text-center">
                      {item.feriasVencidas > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-sm font-bold border border-red-500/20">
                          {item.feriasVencidas}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <div className="text-sm text-gray-400">{item.proximoVencimentoStr}</div>
                      {item.diasParaVencer !== null && item.diasParaVencer > 0 && (
                        <div className={`text-[10px] font-medium mt-0.5 ${
                          item.diasParaVencer <= 30 ? 'text-red-400' : item.diasParaVencer <= 90 ? 'text-orange-400' : 'text-gray-500'
                        }`}>
                          {item.diasParaVencer} dias
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {getStatusBadge(item)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-16 text-center text-gray-400">
              <div className="flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-4xl opacity-50">filter_list_off</span>
                <p>Nenhum servidor encontrado com os filtros selecionados.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-dark bg-[#111111] flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Mostrando {processedData.length} de {data.length} servidores
          </span>
          <span className="text-xs text-gray-600">
            Atualizado em {new Date().toLocaleString('pt-BR')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default RelatorioFerias;
