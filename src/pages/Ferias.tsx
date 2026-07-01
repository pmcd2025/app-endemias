import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import type { InsertTables, Tables } from '../lib/database.types';
import { useAuth } from '../contexts/AuthContext';
import { HISTORICO_FERIAS } from '../data/historicoFerias';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type Server = Tables<'servers'>;
type Vacation = Tables<'vacations'>;
type VacationInsert = InsertTables<'vacations'>;

type Programacao = {
  id: string;
  month: string;
  year: number;
  periodStart: string;
  periodEnd: string;
};

type LinhaFerias = {
  id: string;
  matricula: string;
  nome: string;
  admissao: string;
  feriasVencidas: number;
  feriasGozadas: number;
  programacao: Programacao | null;
  feriasAtuais: Programacao | null;
};

type ProgramSelection = {
  selected: boolean;
  month: string;
  year: string;
};

const formatDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const getProgramYear = (month: string) => {
  const now = new Date();
  const monthNum = parseInt(month, 10);
  const currentMonth = now.getMonth() + 1;
  return monthNum < currentMonth ? now.getFullYear() + 1 : now.getFullYear();
};

const getPeriodosAdquiridos = (admissao: string) => {
  const admissaoDate = parseDate(admissao);
  if (isNaN(admissaoDate.getTime())) return 0;

  const currentDate = new Date();
  let periodos = currentDate.getFullYear() - admissaoDate.getFullYear();
  const monthDiff = currentDate.getMonth() - admissaoDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < admissaoDate.getDate())) {
    periodos--;
  }
  return Math.max(0, periodos);
};

const formatProgramacao = (programacao: Programacao) =>
  `${MONTH_NAMES[parseInt(programacao.month, 10) - 1]}/${programacao.year}`;

const mapProgramacao = (vacation: Vacation): Programacao => {
  const start = parseDate(vacation.period_start);
  return {
    id: vacation.id,
    month: String(start.getMonth() + 1).padStart(2, '0'),
    year: start.getFullYear(),
    periodStart: vacation.period_start,
    periodEnd: vacation.period_end,
  };
};

const getInfo = (item: LinhaFerias) => {
  const periodosAdquiridos = getPeriodosAdquiridos(item.admissao);
  const admissaoDate = parseDate(item.admissao);

  if (isNaN(admissaoDate.getTime())) {
    return {
      periodosAdquiridos,
      feriasGozadas: item.feriasGozadas,
      feriasDisponiveis: item.feriasVencidas,
      proximoVencimento: '-',
      status: item.programacao
        ? `Programado: ${formatProgramacao(item.programacao)}`
        : item.feriasAtuais
          ? `Em férias até ${formatDate(parseDate(item.feriasAtuais.periodEnd))}`
          : item.feriasVencidas > 0
            ? `${item.feriasVencidas} Período(s) Vencido(s)`
            : 'Em dia',
    };
  }

  const proximoVencimento = new Date(
    admissaoDate.getFullYear() + periodosAdquiridos + 1,
    admissaoDate.getMonth(),
    admissaoDate.getDate()
  );

  return {
    periodosAdquiridos,
    feriasGozadas: item.feriasGozadas,
    feriasDisponiveis: item.feriasVencidas,
    proximoVencimento: formatDate(proximoVencimento),
    status: item.programacao
      ? `Programado: ${formatProgramacao(item.programacao)}`
      : item.feriasAtuais
        ? `Em férias até ${formatDate(parseDate(item.feriasAtuais.periodEnd))}`
        : item.feriasVencidas > 0
          ? `${item.feriasVencidas} Período(s) Vencido(s)`
          : 'Em dia',
  };
};

const Ferias: React.FC = () => {
  const { userProfile } = useAuth();
  const [data, setData] = useState<LinhaFerias[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewServer, setViewServer] = useState<LinhaFerias | null>(null);
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [programModalTab, setProgramModalTab] = useState<'em_ferias' | 'programados' | 'novos'>('novos');
  const [programSelections, setProgramSelections] = useState<Record<string, ProgramSelection>>({});
  const [programSearchTerm, setProgramSearchTerm] = useState('');
  
  // Accordion state
  const [expandedLetters, setExpandedLetters] = useState<string[]>([]);

  // Page tab state
  const [pageTab, setPageTab] = useState<'listagem' | 'relatorio'>('listagem');

  // Report-specific state
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportFilterStatus, setReportFilterStatus] = useState<'todos' | 'vencida' | 'vencendo' | 'em_dia' | 'em_ferias' | 'programado'>('todos');
  const [reportSortKey, setReportSortKey] = useState<'nome' | 'matricula' | 'admissao' | 'feriasVencidas' | 'diasParaVencer' | 'status'>('feriasVencidas');
  const [reportSortDir, setReportSortDir] = useState<'asc' | 'desc'>('desc');
  const [diasLimiteVencendo, setDiasLimiteVencendo] = useState(90);

  // Add Server Modal state
  const [isAddServerModalOpen, setIsAddServerModalOpen] = useState(false);
  const [addServerForm, setAddServerForm] = useState({ matricula: '', nome: '', admissao: '' });
  const [addServerError, setAddServerError] = useState('');
  const [addServerSaving, setAddServerSaving] = useState(false);

  const handleAddServerSave = async () => {
    setAddServerError('');

    // Validações
    if (!addServerForm.matricula.trim()) {
      setAddServerError('Matrícula é obrigatória.');
      return;
    }
    if (!addServerForm.nome.trim()) {
      setAddServerError('Nome do servidor é obrigatório.');
      return;
    }
    if (!addServerForm.admissao) {
      setAddServerError('Data de admissão é obrigatória.');
      return;
    }

    setAddServerSaving(true);
    try {
      // Verifica se matrícula já existe
      const { data: existing, error: checkError } = await supabase
        .from('servers')
        .select('id')
        .eq('matricula', addServerForm.matricula.trim())
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        setAddServerError('Já existe um servidor com esta matrícula.');
        setAddServerSaving(false);
        return;
      }

      const insertPayload: any = {
        matricula: addServerForm.matricula.trim(),
        name: addServerForm.nome.trim(),
        hire_date: addServerForm.admissao,
        role: 'servidor',
        status: 'active',
      };

      // Associar supervisor baseado no perfil do usuário logado
      if (userProfile) {
        if (userProfile.role === 'supervisor_area') {
          insertPayload.supervisor_area_id = userProfile.id;
        } else if (userProfile.role === 'supervisor_geral') {
          insertPayload.supervisor_geral_id = userProfile.id;
        } else if (userProfile.role === 'admin') {
          // Admin pode cadastrar sem supervisor específico
        }
      }

      const { error } = await supabase.from('servers').insert([insertPayload] as unknown as never[]);
      if (error) throw error;

      // Sucesso - limpar formulário e fechar modal
      setAddServerForm({ matricula: '', nome: '', admissao: '' });
      setIsAddServerModalOpen(false);
      await fetchFeriasData();
    } catch (error: any) {
      console.error('Erro ao adicionar servidor:', error);
      setAddServerError(error?.message || 'Não foi possível adicionar o servidor.');
    } finally {
      setAddServerSaving(false);
    }
  };

  // Edit Server Modal state
  const [isEditServerModalOpen, setIsEditServerModalOpen] = useState(false);
  const [editServerForm, setEditServerForm] = useState({ id: '', matricula: '', nome: '', admissao: '' });
  const [editServerError, setEditServerError] = useState('');
  const [editServerSaving, setEditServerSaving] = useState(false);

  const openEditServerModal = (item: LinhaFerias) => {
    // Convert dd/mm/yyyy to yyyy-mm-dd for the date input
    let admissaoISO = '';
    if (item.admissao && item.admissao !== '-') {
      const parsed = parseDate(item.admissao);
      if (!isNaN(parsed.getTime())) {
        admissaoISO = formatIsoDate(parsed);
      }
    }
    setEditServerForm({
      id: item.id,
      matricula: item.matricula,
      nome: item.nome,
      admissao: admissaoISO,
    });
    setEditServerError('');
    setIsEditServerModalOpen(true);
  };

  const handleEditServerSave = async () => {
    setEditServerError('');

    if (!editServerForm.matricula.trim()) {
      setEditServerError('Matrícula é obrigatória.');
      return;
    }
    if (!editServerForm.nome.trim()) {
      setEditServerError('Nome do servidor é obrigatório.');
      return;
    }
    if (!editServerForm.admissao) {
      setEditServerError('Data de admissão é obrigatória.');
      return;
    }

    setEditServerSaving(true);
    try {
      // Check duplicate matricula (excluding current server)
      const { data: existing, error: checkError } = await supabase
        .from('servers')
        .select('id')
        .eq('matricula', editServerForm.matricula.trim())
        .neq('id', editServerForm.id)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existing) {
        setEditServerError('Já existe outro servidor com esta matrícula.');
        setEditServerSaving(false);
        return;
      }

      const { error } = await supabase
        .from('servers')
        .update({
          matricula: editServerForm.matricula.trim(),
          name: editServerForm.nome.trim(),
          hire_date: editServerForm.admissao,
        } as unknown as never)
        .eq('id', editServerForm.id);

      if (error) throw error;

      setIsEditServerModalOpen(false);
      await fetchFeriasData();
    } catch (error: any) {
      console.error('Erro ao editar servidor:', error);
      setEditServerError(error?.message || 'Não foi possível editar o servidor.');
    } finally {
      setEditServerSaving(false);
    }
  };

  const handleDeleteServer = async (item: LinhaFerias) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o servidor "${item.nome}" (${item.matricula})?\n\nEsta ação irá remover o servidor e todas as férias associadas.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      // Delete associated vacations first
      const { error: vacError } = await supabase
        .from('vacations')
        .delete()
        .eq('server_id', item.id);
      if (vacError) throw vacError;

      // Delete the server
      const { error } = await supabase
        .from('servers')
        .delete()
        .eq('id', item.id);
      if (error) throw error;

      await fetchFeriasData();
    } catch (error: any) {
      console.error('Erro ao excluir servidor:', error);
      alert(error?.message || 'Não foi possível excluir o servidor.');
    } finally {
      setSaving(false);
    }
  };

  const fetchFeriasData = async () => {
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
      if (servers.length === 0) {
        setData([]);
        return;
      }

      const serverIds = servers.map((server) => server.id);
      const { data: vacationsData, error: vacationsError } = await (supabase
        .from('vacations')
        .select('*')
        .in('server_id', serverIds)
        .neq('status', 'cancelled')
        .order('period_start', { ascending: true }) as any);

      if (vacationsError) throw vacationsError;

      const now = new Date();
      const vacationsByServer = new Map<string, Vacation[]>();
      ((vacationsData || []) as Vacation[]).forEach((vacation) => {
        const current = vacationsByServer.get(vacation.server_id) || [];
        current.push(vacation);
        vacationsByServer.set(vacation.server_id, current);
      });

      const mapped: LinhaFerias[] = servers.map((server) => {
        const hireDate = server.hire_date || '';
        const vacations = vacationsByServer.get(server.id) || [];
        const consumedCount = vacations.filter((vacation) => parseDate(vacation.period_start) <= now).length;
        const futureVacation = vacations.find((vacation) => parseDate(vacation.period_start) > now) || null;
        const activeVacation = vacations.find((vacation) => {
          const start = parseDate(vacation.period_start);
          const end = parseDate(vacation.period_end);
          return start <= now && end >= now;
        }) || null;
        const periodosAdquiridos = getPeriodosAdquiridos(hireDate);
        const normalizedMatricula = server.matricula.replace(/[-_]/g, '');
        const historico = HISTORICO_FERIAS[normalizedMatricula] || HISTORICO_FERIAS[server.matricula];

        let historicalConsumed = 0;
        if (historico && hireDate) {
          // Na época da migração, quantas férias o servidor já havia gozado?
          const periodosNaMigracao = getPeriodosAdquiridos(historico.admissao.split('/').reverse().join('-'));
          historicalConsumed = Math.max(0, periodosNaMigracao - historico.feriasVencidas);
        }

        const totalConsumed = consumedCount + historicalConsumed;

        return {
          id: server.id,
          matricula: server.matricula,
          nome: server.name,
          admissao: hireDate ? formatDate(parseDate(hireDate)) : '-',
          feriasVencidas: Math.max(0, periodosAdquiridos - totalConsumed),
          feriasGozadas: Math.min(periodosAdquiridos, totalConsumed),
          programacao: futureVacation ? mapProgramacao(futureVacation) : null,
          feriasAtuais: activeVacation ? mapProgramacao(activeVacation) : null,
        };
      });

      setData(mapped);
    } catch (error) {
      console.error('Erro ao carregar dados de ferias:', error);
      alert('Não foi possível carregar os dados de férias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeriasData();
  }, [userProfile]);

  const servidoresEmFerias = useMemo(() => {
    return data
      .filter((item) => item.feriasAtuais)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [data]);

  const servidoresProgramados = useMemo(() => {
    return data
      .filter((item) => item.programacao)
      .sort((a, b) => parseDate(a.programacao!.periodStart).getTime() - parseDate(b.programacao!.periodStart).getTime());
  }, [data]);

  const servidoresVencidos = useMemo(() => {
    return data
      .filter((item) => item.feriasVencidas > 0 && !item.programacao && !item.feriasAtuais)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [data]);

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const lower = searchTerm.toLowerCase();
    return data.filter((item) => item.nome.toLowerCase().includes(lower) || item.matricula.toLowerCase().includes(lower));
  }, [data, searchTerm]);

  const groupedData = useMemo(() => {
    const groups: Record<string, typeof data> = {};
    filteredData.forEach(item => {
      const letter = item.nome.charAt(0).toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(item);
    });
    return Object.keys(groups).sort().map(letter => ({
      letter,
      items: groups[letter]
    }));
  }, [filteredData]);

  const toggleLetter = (letter: string) => {
    setExpandedLetters(prev => 
      prev.includes(letter) ? prev.filter(l => l !== letter) : [...prev, letter]
    );
  };

  const stats = useMemo(() => {
    let totalVencidas = 0;
    let totalEmDia = 0;
    let totalEmFerias = 0;
    let totalProgramados = 0;
    let proximoVencimento: { nome: string; data: string } | null = null;
    let minDate = Infinity;

    data.forEach((item) => {
      const info = getInfo(item);
      if (item.feriasAtuais) totalEmFerias++;
      else if (item.programacao) totalProgramados++;
      else if (item.feriasVencidas > 0) totalVencidas++;
      else totalEmDia++;

      if (info.proximoVencimento !== '-') {
        const [d, m, y] = info.proximoVencimento.split('/').map(Number);
        const nextDate = new Date(y, m - 1, d).getTime();
        if (nextDate > Date.now() && nextDate < minDate) {
          minDate = nextDate;
          proximoVencimento = { nome: item.nome, data: info.proximoVencimento };
        }
      }
    });

    return { totalVencidas, totalEmDia, totalEmFerias, totalProgramados, proximoVencimento, total: data.length };
  }, [data]);

  const openProgramModal = () => {
    const currentYear = new Date().getFullYear();
    const selections: Record<string, ProgramSelection> = {};
    servidoresVencidos.forEach((item) => {
      selections[item.id] = { selected: false, month: '', year: String(currentYear) };
    });
    setProgramSelections(selections);
    setProgramSearchTerm('');
    // Choose the best initial tab
    if (servidoresEmFerias.length > 0) {
      setProgramModalTab('em_ferias');
    } else if (servidoresProgramados.length > 0) {
      setProgramModalTab('programados');
    } else {
      setProgramModalTab('novos');
    }
    setIsProgramModalOpen(true);
  };

  const handleCancelProgramacao = async (vacationId: string) => {
    if (!window.confirm('Deseja cancelar esta programação de férias?')) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('vacations').delete().eq('id', vacationId);
      if (error) throw error;
      await fetchFeriasData();
    } catch (error) {
      console.error('Erro ao cancelar programação:', error);
      alert('Não foi possível cancelar a programação.');
    } finally {
      setSaving(false);
    }
  };

  const getLastDayOfMonth = (year: number, month: number) => {
    // month is 1-indexed (1=Jan, 12=Dec)
    return new Date(year, month, 0).getDate();
  };

  const handleProgramMultipleSave = async () => {
    const selected = servidoresVencidos
      .map((item) => ({ item, selection: programSelections[item.id] }))
      .filter(({ selection }) => selection?.selected && selection.month);

    if (selected.length === 0) return;

    setSaving(true);
    try {
      const now = new Date();
      const payload: VacationInsert[] = selected.map(({ item, selection }) => {
        const year = parseInt(selection.year, 10) || getProgramYear(selection.month);
        const monthNum = parseInt(selection.month, 10);
        const lastDay = getLastDayOfMonth(year, monthNum);
        const startDate = new Date(year, monthNum - 1, 1);
        const endDate = new Date(year, monthNum - 1, lastDay);

        // Determine status: if the programmed period includes today, it's active
        const isActive = startDate <= now && endDate >= now;

        return {
          server_id: item.id,
          period_start: formatIsoDate(startDate),
          period_end: formatIsoDate(endDate),
          days_count: lastDay,
          days_sold: 0,
          year_reference: year,
          created_by: userProfile?.id || null,
          status: isActive ? 'active' : 'scheduled',
          notes: `Programação de férias: ${MONTH_NAMES[monthNum - 1]}/${year}`,
        };
      });

      const { error } = await supabase.from('vacations').insert(payload as unknown as never[]);
      if (error) throw error;
      setIsProgramModalOpen(false);
      await fetchFeriasData();
    } catch (error) {
      console.error('Erro ao programar ferias:', error);
      alert('Não foi possível salvar a programação de férias.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const grouped: Record<string, LinhaFerias[]> = {};
    servidoresProgramados.forEach((item) => {
      if (!item.programacao) return;
      const key = `${item.programacao.month}/${item.programacao.year}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    const sortedMonths = Object.keys(grouped).sort();

    let yPosition = 20;
    doc.setFontSize(18);
    doc.text('Programação de Férias', 14, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.text(`Fundo Municipal de Saúde de Itabuna - Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 14, yPosition);
    yPosition += 15;

    sortedMonths.forEach((monthKey, index) => {
      const [month, year] = monthKey.split('/');
      const monthName = MONTH_NAMES[parseInt(month, 10) - 1];
      
      doc.setFontSize(14);
      doc.text(`${monthName} ${year}`, 14, yPosition);
      yPosition += 8;

      autoTable(doc, {
        startY: yPosition,
        head: [['Matrícula', 'Nome', 'Admissão', 'Férias Vencidas']],
        body: grouped[monthKey].map((item) => [item.matricula, item.nome, item.admissao, String(item.feriasVencidas)]),
        theme: 'striped',
        headStyles: { fillColor: [234, 179, 8] },
        styles: { fontSize: 8 },
        margin: { top: yPosition, left: 14, right: 14 }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
      if (index < sortedMonths.length - 1 && yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
    });

    doc.save('programacao_ferias.pdf');
  };

  // ═══════════════════════════════════════════
  // REPORT TAB - computed data & helpers
  // ═══════════════════════════════════════════

  const diffDays = (a: Date, b: Date) => Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

  type ReportItem = {
    id: string; matricula: string; nome: string; admissao: string; admissaoDate: Date;
    periodosAdquiridos: number; feriasGozadas: number; feriasVencidas: number;
    proximoVencimentoStr: string; diasParaVencer: number | null;
    status: 'vencida' | 'vencendo' | 'em_dia' | 'em_ferias' | 'programado'; statusLabel: string;
  };

  const reportData = useMemo((): ReportItem[] => {
    const now = new Date();
    return data.map((item) => {
      const admDate = parseDate(item.admissao);
      const periodosAdquiridos = getPeriodosAdquiridos(item.admissao);
      let proximoVencimentoStr = '-';
      let diasParaVencer: number | null = null;

      if (!isNaN(admDate.getTime())) {
        const nextDate = new Date(admDate.getFullYear() + periodosAdquiridos + 1, admDate.getMonth(), admDate.getDate());
        proximoVencimentoStr = formatDate(nextDate);
        diasParaVencer = diffDays(nextDate, now);
      }

      let status: ReportItem['status'] = 'em_dia';
      let statusLabel = 'Em dia';

      if (item.feriasAtuais) {
        status = 'em_ferias';
        statusLabel = `Em férias até ${formatDate(parseDate(item.feriasAtuais.periodEnd))}`;
      } else if (item.programacao) {
        status = 'programado';
        statusLabel = `Programado: ${formatProgramacao(item.programacao)}`;
      } else if (item.feriasVencidas > 0) {
        status = 'vencida';
        statusLabel = `${item.feriasVencidas} Período(s) Vencido(s)`;
      } else if (diasParaVencer !== null && diasParaVencer > 0 && diasParaVencer <= diasLimiteVencendo) {
        status = 'vencendo';
        statusLabel = `Vence em ${diasParaVencer} dias`;
      }

      return {
        id: item.id, matricula: item.matricula, nome: item.nome,
        admissao: item.admissao, admissaoDate: admDate,
        periodosAdquiridos, feriasGozadas: item.feriasGozadas, feriasVencidas: item.feriasVencidas,
        proximoVencimentoStr, diasParaVencer, status, statusLabel,
      };
    });
  }, [data, diasLimiteVencendo]);

  const reportStats = useMemo(() => {
    const vencidas = reportData.filter(d => d.status === 'vencida').length;
    const vencendo = reportData.filter(d => d.status === 'vencendo').length;
    const emDia = reportData.filter(d => d.status === 'em_dia').length;
    const emFerias = reportData.filter(d => d.status === 'em_ferias').length;
    const programados = reportData.filter(d => d.status === 'programado').length;
    const totalPeriodosVencidos = reportData.reduce((sum, d) => sum + d.feriasVencidas, 0);
    return { vencidas, vencendo, emDia, emFerias, programados, total: reportData.length, totalPeriodosVencidos };
  }, [reportData]);

  const processedReportData = useMemo(() => {
    let result = [...reportData];
    if (reportFilterStatus !== 'todos') {
      result = result.filter(d => d.status === reportFilterStatus);
    }
    if (reportSearchTerm) {
      const lower = reportSearchTerm.toLowerCase();
      result = result.filter(d => d.nome.toLowerCase().includes(lower) || d.matricula.toLowerCase().includes(lower));
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (reportSortKey) {
        case 'nome': cmp = a.nome.localeCompare(b.nome); break;
        case 'matricula': cmp = a.matricula.localeCompare(b.matricula); break;
        case 'admissao': cmp = a.admissaoDate.getTime() - b.admissaoDate.getTime(); break;
        case 'feriasVencidas': cmp = a.feriasVencidas - b.feriasVencidas; break;
        case 'diasParaVencer': cmp = (a.diasParaVencer ?? 99999) - (b.diasParaVencer ?? 99999); break;
        case 'status': { const order = { vencida: 0, vencendo: 1, programado: 2, em_ferias: 3, em_dia: 4 }; cmp = order[a.status] - order[b.status]; break; }
      }
      return reportSortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [reportData, reportFilterStatus, reportSearchTerm, reportSortKey, reportSortDir]);

  const handleReportSort = (key: typeof reportSortKey) => {
    if (reportSortKey === key) { setReportSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setReportSortKey(key); setReportSortDir(key === 'nome' || key === 'matricula' ? 'asc' : 'desc'); }
  };

  const ReportSortIcon = ({ column }: { column: typeof reportSortKey }) => {
    if (reportSortKey !== column) return <span className="material-symbols-outlined text-[14px] opacity-30">unfold_more</span>;
    return <span className="material-symbols-outlined text-[14px] text-primary">{reportSortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>;
  };

  const getReportStatusBadge = (item: ReportItem) => {
    const base = 'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap';
    switch (item.status) {
      case 'vencida': return <span className={`${base} bg-red-500/10 text-red-400 border border-red-500/20`}><span className="material-symbols-outlined text-[14px]">error</span>{item.statusLabel}</span>;
      case 'vencendo': return <span className={`${base} bg-orange-500/10 text-orange-400 border border-orange-500/20`}><span className="material-symbols-outlined text-[14px]">schedule</span>{item.statusLabel}</span>;
      case 'programado': return <span className={`${base} bg-yellow-500/10 text-yellow-400 border border-yellow-500/20`}><span className="material-symbols-outlined text-[14px]">event_available</span>{item.statusLabel}</span>;
      case 'em_ferias': return <span className={`${base} bg-blue-500/10 text-blue-400 border border-blue-500/20`}><span className="material-symbols-outlined text-[14px]">beach_access</span>{item.statusLabel}</span>;
      case 'em_dia': return <span className={`${base} bg-green-500/10 text-green-400 border border-green-500/20`}><span className="material-symbols-outlined text-[14px]">check_circle</span>{item.statusLabel}</span>;
    }
  };

  const getUrgencyBar = (item: ReportItem) => {
    if (item.status === 'vencida') return 'bg-red-500';
    if (item.status === 'vencendo') return 'bg-orange-500';
    if (item.status === 'programado') return 'bg-yellow-500';
    if (item.status === 'em_ferias') return 'bg-blue-500';
    return 'bg-green-500';
  };

  const handleExportReportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    let y = 15;
    doc.setFontSize(18);
    doc.text('Relatório de Férias - Análise de Vencimentos', 14, y); y += 8;
    doc.setFontSize(10);
    doc.text(`Fundo Municipal de Saúde de Itabuna — Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 14, y); y += 5;
    doc.text(`Total: ${processedReportData.length} servidores | Filtro: ${reportFilterStatus === 'todos' ? 'Todos' : reportFilterStatus}`, 14, y); y += 10;
    autoTable(doc, {
      startY: y,
      head: [['Matrícula', 'Nome', 'Admissão', 'Adquiridos', 'Gozadas', 'Vencidas', 'Próx. Vencimento', 'Dias p/ Vencer', 'Situação']],
      body: processedReportData.map(d => [
        d.matricula, d.nome, d.admissao,
        String(d.periodosAdquiridos), String(d.feriasGozadas), String(d.feriasVencidas),
        d.proximoVencimentoStr, d.diasParaVencer !== null ? String(d.diasParaVencer) : '-', d.statusLabel,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      styles: { cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 50 }, 8: { cellWidth: 40 } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 8) {
          const s = processedReportData[data.row.index]?.status;
          if (s === 'vencida') data.cell.styles.textColor = [220, 50, 50];
          else if (s === 'vencendo') data.cell.styles.textColor = [230, 140, 30];
          else if (s === 'em_dia') data.cell.styles.textColor = [50, 180, 80];
        }
      },
    });
    doc.save(`relatorio_ferias_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const reportFilterButtons: { key: typeof reportFilterStatus; label: string; icon: string; color: string; count: number }[] = [
    { key: 'todos', label: 'Todos', icon: 'groups', color: 'text-gray-400 border-gray-600', count: reportStats.total },
    { key: 'vencida', label: 'Vencidas', icon: 'error', color: 'text-red-400 border-red-500/30', count: reportStats.vencidas },
    { key: 'vencendo', label: 'Vencendo', icon: 'schedule', color: 'text-orange-400 border-orange-500/30', count: reportStats.vencendo },
    { key: 'programado', label: 'Programados', icon: 'event_available', color: 'text-yellow-400 border-yellow-500/30', count: reportStats.programados },
    { key: 'em_ferias', label: 'Em Férias', icon: 'beach_access', color: 'text-blue-400 border-blue-500/30', count: reportStats.emFerias },
    { key: 'em_dia', label: 'Em Dia', icon: 'check_circle', color: 'text-green-400 border-green-500/30', count: reportStats.emDia },
  ];

  return (
    <div className="p-4 md:p-8 animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl md:text-4xl">beach_access</span>
            Gestão de Férias
          </h1>
          <p className="text-gray-400 mt-1">
            Dados sincronizados com o Supabase.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto flex-wrap">
          <button
            onClick={fetchFeriasData}
            disabled={loading || saving}
            className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#222] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium border border-border-dark transition-all shadow-lg shadow-black/20 active:scale-95 w-full md:w-auto justify-center"
          >
            <span className="material-symbols-outlined">refresh</span>
            Atualizar
          </button>
          <button
            onClick={() => { setAddServerForm({ matricula: '', nome: '', admissao: '' }); setAddServerError(''); setIsAddServerModalOpen(true); }}
            disabled={loading || saving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-emerald-600/20 active:scale-95 w-full md:w-auto justify-center"
          >
            <span className="material-symbols-outlined">person_add</span>
            Adicionar Servidor
          </button>
          <button 
            onClick={openProgramModal}
            disabled={loading || saving}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black px-4 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-yellow-500/20 active:scale-95 w-full md:w-auto justify-center">
            <span className="material-symbols-outlined">event_note</span>
            Programação
          </button>
        </div>
      </div>

      {/* Abas: Listagem / Relatório */}
      <div className="flex border-b border-border-dark">
        <button
          onClick={() => setPageTab('listagem')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 ${
            pageTab === 'listagem'
              ? 'text-primary border-primary bg-primary/5'
              : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">list_alt</span>
          Listagem
        </button>
        <button
          onClick={() => setPageTab('relatorio')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 ${
            pageTab === 'relatorio'
              ? 'text-primary border-primary bg-primary/5'
              : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">assessment</span>
          Relatório
          {stats.totalVencidas > 0 && (
            <span className="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              {stats.totalVencidas}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════ ABA LISTAGEM ═══════════ */}
      {pageTab === 'listagem' && (<>
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-red-400">warning</span>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Servidores com Férias Vencidas</p>
            <p className="text-3xl font-bold text-red-400">{stats.totalVencidas}</p>
          </div>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-green-400">check_circle</span>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Servidores Em Dia</p>
            <p className="text-3xl font-bold text-green-400">{stats.totalEmDia}</p>
          </div>
        </div>
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-yellow-400">event_upcoming</span>
          </div>
          <div className="min-w-0">
            <p className="text-gray-400 text-sm">Próximo Vencimento</p>
            {stats.proximoVencimento ? (
              <>
                <p className="text-xl font-bold text-yellow-400">{stats.proximoVencimento.data}</p>
                <p className="text-xs text-gray-500 truncate">{stats.proximoVencimento.nome}</p>
              </>
            ) : <p className="text-lg font-bold text-gray-400">---</p>}
          </div>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden flex flex-col shadow-xl">
        
        {/* Header e Filtros da Tabela */}
        <div className="p-6 border-b border-border-dark flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-dark/50">
          <div className="flex items-center gap-2">
            <div className="bg-primary/20 text-primary p-2 rounded-lg">
              <span className="material-symbols-outlined">list_alt</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Servidores em Férias Vencidas</h2>
              <p className="text-sm text-gray-400">Total de {filteredData.length} registros encontrados</p>
            </div>
          </div>
          
          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            <input
              type="text"
              placeholder="Buscar por nome ou matrícula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#111111] border border-border-dark text-white rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-gray-500"
            />
          </div>
        </div>

        {/* Lista Agrupada por Letras (Accordion) */}
        <div className="p-6 bg-[#0a0a0a]">
          {loading ? (
             <div className="py-12 text-center text-gray-400">Carregando dados de férias...</div>
          ) : groupedData.length > 0 ? (
            <div className="space-y-4">
              {groupedData.map((group) => {
                const isExpanded = expandedLetters.includes(group.letter);
                return (
                  <div key={group.letter} className="bg-[#111111] border border-border-dark rounded-2xl overflow-hidden shadow-lg transition-all">
                    {/* Cabeçalho do Accordion (Letra) */}
                    <button 
                      onClick={() => toggleLetter(group.letter)}
                      className="w-full flex items-center justify-between p-5 bg-[#151515] hover:bg-white/5 transition-colors focus:outline-none"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-2xl border border-primary/30 shrink-0 shadow-sm">
                          {group.letter}
                        </div>
                        <div className="text-left">
                          <h3 className="text-white font-bold text-xl mb-1">Letra {group.letter}</h3>
                          <p className="text-gray-400 text-sm font-medium">{group.items.length} Servidor{group.items.length !== 1 ? 'es' : ''}</p>
                        </div>
                      </div>
                      <div className={`p-2 rounded-full bg-black/40 border border-white/5 transition-transform duration-300 flex items-center justify-center ${isExpanded ? 'rotate-180 bg-primary/20 text-primary border-primary/30' : 'text-gray-400'}`}>
                        <span className="material-symbols-outlined">expand_more</span>
                      </div>
                    </button>
                    
                    {/* Conteúdo do Accordion (Lista de Servidores) */}
                    {isExpanded && (
                      <div className="border-t border-border-dark bg-[#0e0e0e] animate-fade-in">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#111111] text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-4 py-4 font-semibold border-b border-border-dark whitespace-nowrap">Matrícula</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark whitespace-nowrap">Nome</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark whitespace-nowrap">Admissão</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Adquiridos</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Gozadas</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Situação</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Próx. Venc.</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark">
                              {group.items.map((item) => {
                                const info = getInfo(item);
                                return (
                                <tr key={item.id} className="hover:bg-[#151515] transition-colors">
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <span className="font-mono text-gray-300 bg-black/40 px-2 py-1.5 rounded border border-white/5 text-sm shadow-inner">{item.matricula}</span>
                                  </td>
                                  <td className="px-4 py-4 text-white font-medium whitespace-nowrap">
                                    {item.nome}
                                  </td>
                                  <td className="px-4 py-4 text-gray-400 whitespace-nowrap text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-[16px] opacity-70">calendar_month</span>
                                      {item.admissao}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-gray-300 whitespace-nowrap text-center font-medium">
                                    {info.periodosAdquiridos}
                                  </td>
                                  <td className="px-4 py-4 text-gray-300 whitespace-nowrap text-center font-medium">
                                    {info.feriasGozadas}
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap">
                                    <div className="flex justify-center">
                                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${
                                        item.programacao
                                          ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                          : info.feriasDisponiveis > 0 
                                            ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                            : 'bg-green-500/10 text-green-400 border border-green-500/20'
                                      }`}>
                                        {info.status}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-gray-400 whitespace-nowrap text-center text-sm font-medium">
                                    {info.proximoVencimento}
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button onClick={() => setViewServer(item)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Visualizar">
                                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                                      </button>
                                      <button onClick={() => openEditServerModal(item)} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Editar">
                                        <span className="material-symbols-outlined text-[20px]">edit</span>
                                      </button>
                                      <button onClick={() => handleDeleteServer(item)} disabled={saving} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50" title="Excluir">
                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                      </button>
                                      {item.programacao && (
                                        <button onClick={() => handleCancelProgramacao(item.programacao!.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Cancelar Programação">
                                          <span className="material-symbols-outlined text-[20px]">event_busy</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400">
              <div className="flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-4xl opacity-50">search_off</span>
                <p>Nenhum servidor encontrado para "{searchTerm}"</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer da Tabela */}
        <div className="px-6 py-4 border-t border-border-dark bg-[#111111] flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Mostrando 1 a {filteredData.length} de {data.length} resultados
          </span>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg border border-border-dark text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm" disabled>
              Anterior
            </button>
            <button className="px-3 py-1.5 rounded-lg border border-border-dark text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm" disabled>
              Próxima
            </button>
          </div>
        </div>
      </div>
      </>)}

      {/* ═══════════ ABA RELATÓRIO ═══════════ */}
      {pageTab === 'relatorio' && (
        <div className="space-y-6 animate-fade-in">
          {/* Cards de resumo do relatório */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-surface-dark border border-border-dark rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 bg-gray-500/20 rounded-xl flex items-center justify-center mb-2"><span className="material-symbols-outlined text-gray-400">groups</span></div>
              <p className="text-2xl font-bold text-white">{reportStats.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total</p>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center mb-2"><span className="material-symbols-outlined text-red-400">error</span></div>
              <p className="text-2xl font-bold text-red-400">{reportStats.vencidas}</p>
              <p className="text-xs text-gray-500 mt-0.5">Vencidas</p>
            </div>
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center mb-2"><span className="material-symbols-outlined text-orange-400">schedule</span></div>
              <p className="text-2xl font-bold text-orange-400">{reportStats.vencendo}</p>
              <p className="text-xs text-gray-500 mt-0.5">Vencendo ({diasLimiteVencendo}d)</p>
            </div>
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center mb-2"><span className="material-symbols-outlined text-yellow-400">event_available</span></div>
              <p className="text-2xl font-bold text-yellow-400">{reportStats.programados}</p>
              <p className="text-xs text-gray-500 mt-0.5">Programados</p>
            </div>
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center mb-2"><span className="material-symbols-outlined text-blue-400">beach_access</span></div>
              <p className="text-2xl font-bold text-blue-400">{reportStats.emFerias}</p>
              <p className="text-xs text-gray-500 mt-0.5">Em Férias</p>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center mb-2"><span className="material-symbols-outlined text-green-400">check_circle</span></div>
              <p className="text-2xl font-bold text-green-400">{reportStats.emDia}</p>
              <p className="text-xs text-gray-500 mt-0.5">Em Dia</p>
            </div>
          </div>

          {/* Barra de distribuição */}
          {reportStats.total > 0 && (
            <div className="bg-surface-dark border border-border-dark rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">pie_chart</span>
                  Distribuição de Status
                </h3>
                <span className="text-xs text-gray-500">{reportStats.totalPeriodosVencidos} período(s) vencido(s) no total</span>
              </div>
              <div className="flex h-4 rounded-full overflow-hidden bg-[#111] gap-[2px]">
                {reportStats.vencidas > 0 && <div className="bg-red-500 rounded-full transition-all duration-500" style={{ width: `${(reportStats.vencidas / reportStats.total) * 100}%` }} />}
                {reportStats.vencendo > 0 && <div className="bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${(reportStats.vencendo / reportStats.total) * 100}%` }} />}
                {reportStats.programados > 0 && <div className="bg-yellow-500 rounded-full transition-all duration-500" style={{ width: `${(reportStats.programados / reportStats.total) * 100}%` }} />}
                {reportStats.emFerias > 0 && <div className="bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${(reportStats.emFerias / reportStats.total) * 100}%` }} />}
                {reportStats.emDia > 0 && <div className="bg-green-500 rounded-full transition-all duration-500" style={{ width: `${(reportStats.emDia / reportStats.total) * 100}%` }} />}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
                {reportStats.vencidas > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Vencidas ({((reportStats.vencidas / reportStats.total) * 100).toFixed(0)}%)</span>}
                {reportStats.vencendo > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />Vencendo ({((reportStats.vencendo / reportStats.total) * 100).toFixed(0)}%)</span>}
                {reportStats.programados > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />Programados ({((reportStats.programados / reportStats.total) * 100).toFixed(0)}%)</span>}
                {reportStats.emFerias > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Em Férias ({((reportStats.emFerias / reportStats.total) * 100).toFixed(0)}%)</span>}
                {reportStats.emDia > 0 && <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Em Dia ({((reportStats.emDia / reportStats.total) * 100).toFixed(0)}%)</span>}
              </div>
            </div>
          )}

          {/* Filtros + Tabela do relatório */}
          <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden flex flex-col shadow-xl">
            {/* Toolbar */}
            <div className="p-4 md:p-6 border-b border-border-dark bg-surface-dark/50">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  {reportFilterButtons.map(btn => (
                    <button key={btn.key} onClick={() => setReportFilterStatus(btn.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        reportFilterStatus === btn.key ? `${btn.color} bg-white/5 shadow-inner` : 'text-gray-500 border-transparent hover:border-border-dark hover:text-gray-400'
                      }`}>
                      <span className="material-symbols-outlined text-[14px]">{btn.icon}</span>
                      {btn.label}
                      <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${reportFilterStatus === btn.key ? 'bg-white/10' : 'bg-white/5'}`}>{btn.count}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative w-full sm:w-60">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
                    <input type="text" placeholder="Buscar servidor..." value={reportSearchTerm} onChange={e => setReportSearchTerm(e.target.value)}
                      className="w-full bg-[#111111] border border-border-dark text-white rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-gray-500" />
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#111111] border border-border-dark rounded-xl px-3 py-2 shrink-0">
                    <span className="material-symbols-outlined text-orange-400 text-[16px]">timer</span>
                    <select value={diasLimiteVencendo} onChange={e => setDiasLimiteVencendo(Number(e.target.value))}
                      className="bg-transparent text-white text-xs font-medium focus:outline-none cursor-pointer">
                      <option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option>
                      <option value="120">120 dias</option><option value="180">180 dias</option><option value="365">1 ano</option>
                    </select>
                  </div>
                  <button onClick={handleExportReportPDF} disabled={loading || processedReportData.length === 0}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 shrink-0">
                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto">
              {loading ? (
                <div className="py-16 text-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                  Carregando relatório...
                </div>
              ) : processedReportData.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#111111] text-gray-400 text-xs uppercase tracking-wider">
                      <th className="w-1"></th>
                      <th className="px-4 py-4 font-semibold border-b border-border-dark cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleReportSort('matricula')}>
                        <div className="flex items-center gap-1">Matrícula <ReportSortIcon column="matricula" /></div>
                      </th>
                      <th className="px-4 py-4 font-semibold border-b border-border-dark cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleReportSort('nome')}>
                        <div className="flex items-center gap-1">Nome <ReportSortIcon column="nome" /></div>
                      </th>
                      <th className="px-4 py-4 font-semibold border-b border-border-dark cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleReportSort('admissao')}>
                        <div className="flex items-center gap-1">Admissão <ReportSortIcon column="admissao" /></div>
                      </th>
                      <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Adquiridos</th>
                      <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Gozadas</th>
                      <th className="px-4 py-4 font-semibold border-b border-border-dark text-center cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleReportSort('feriasVencidas')}>
                        <div className="flex items-center justify-center gap-1">Vencidas <ReportSortIcon column="feriasVencidas" /></div>
                      </th>
                      <th className="px-4 py-4 font-semibold border-b border-border-dark text-center cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleReportSort('diasParaVencer')}>
                        <div className="flex items-center justify-center gap-1">Próx. Venc. <ReportSortIcon column="diasParaVencer" /></div>
                      </th>
                      <th className="px-4 py-4 font-semibold border-b border-border-dark text-center cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap" onClick={() => handleReportSort('status')}>
                        <div className="flex items-center justify-center gap-1">Situação <ReportSortIcon column="status" /></div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dark">
                    {processedReportData.map(item => (
                      <tr key={item.id} className="hover:bg-[#151515] transition-colors group">
                        <td className="w-1 p-0"><div className={`w-1 h-full min-h-[52px] ${getUrgencyBar(item)} opacity-80 group-hover:opacity-100 transition-opacity`} /></td>
                        <td className="px-4 py-3.5 whitespace-nowrap"><span className="font-mono text-gray-300 bg-black/40 px-2 py-1 rounded border border-white/5 text-sm">{item.matricula}</span></td>
                        <td className="px-4 py-3.5 text-white font-medium whitespace-nowrap">{item.nome}</td>
                        <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap text-sm"><div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] opacity-60">calendar_month</span>{item.admissao}</div></td>
                        <td className="px-4 py-3.5 text-gray-300 text-center font-medium">{item.periodosAdquiridos}</td>
                        <td className="px-4 py-3.5 text-gray-300 text-center font-medium">{item.feriasGozadas}</td>
                        <td className="px-4 py-3.5 text-center">
                          {item.feriasVencidas > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-sm font-bold border border-red-500/20">{item.feriasVencidas}</span>
                          ) : (<span className="text-gray-500 text-sm">0</span>)}
                        </td>
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <div className="text-sm text-gray-400">{item.proximoVencimentoStr}</div>
                          {item.diasParaVencer !== null && item.diasParaVencer > 0 && (
                            <div className={`text-[10px] font-medium mt-0.5 ${item.diasParaVencer <= 30 ? 'text-red-400' : item.diasParaVencer <= 90 ? 'text-orange-400' : 'text-gray-500'}`}>{item.diasParaVencer} dias</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">{getReportStatusBadge(item)}</td>
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
              <span className="text-sm text-gray-400">Mostrando {processedReportData.length} de {reportData.length} servidores</span>
              <span className="text-xs text-gray-600">Atualizado em {new Date().toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>
      )}

      {viewServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setViewServer(null)}>
          <div className="bg-[#111111] border border-border-dark rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border-dark flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">{viewServer.nome}</h3>
              <button onClick={() => setViewServer(null)} className="text-gray-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm bg-[#1A1A1A]">
              {(() => {
                const info = getInfo(viewServer);
                return (
                  <>
                    <div className="flex justify-between"><span className="text-gray-400">Matrícula</span><span className="text-white">{viewServer.matricula}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Admissão</span><span className="text-white">{viewServer.admissao}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Períodos Adquiridos</span><span className="text-white">{info.periodosAdquiridos}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Férias Gozadas</span><span className="text-white">{info.feriasGozadas}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Férias Vencidas</span><span className="text-white">{info.feriasDisponiveis}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Próx. Vencimento</span><span className="text-white">{info.proximoVencimento}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Situação</span><span className="text-white">{info.status}</span></div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {isProgramModalOpen && (() => {
        const currentYear = new Date().getFullYear();
        const yearOptions = [currentYear, currentYear + 1];
        const selectedCount = (Object.values(programSelections) as ProgramSelection[]).filter(s => s.selected && s.month).length;
        const filteredVencidos = programSearchTerm
          ? servidoresVencidos.filter(item => item.nome.toLowerCase().includes(programSearchTerm.toLowerCase()) || item.matricula.toLowerCase().includes(programSearchTerm.toLowerCase()))
          : servidoresVencidos;

        return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsProgramModalOpen(false)}>
          <div className="bg-[#111111] border border-border-dark rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-border-dark flex items-center justify-between bg-gradient-to-r from-yellow-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-yellow-400">event_note</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Programação de Férias</h3>
                  <p className="text-xs text-gray-500">Gerencie as férias programadas e em andamento</p>
                </div>
              </div>
              <button onClick={() => setIsProgramModalOpen(false)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Info Banner */}
            <div className="px-5 py-2.5 bg-[#0d0d0d] border-b border-border-dark flex flex-wrap gap-4 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-400">Em Férias: <span className="text-blue-400 font-bold">{servidoresEmFerias.length}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-gray-400">Programados: <span className="text-yellow-400 font-bold">{servidoresProgramados.length}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-gray-400">Pendentes: <span className="text-red-400 font-bold">{servidoresVencidos.length}</span></span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border-dark">
              <button onClick={() => setProgramModalTab('em_ferias')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-all border-b-2 ${
                  programModalTab === 'em_ferias' ? 'text-blue-400 border-blue-400 bg-blue-400/5' : 'text-gray-500 border-transparent hover:text-gray-400'
                }`}>
                <span className="material-symbols-outlined text-[16px]">beach_access</span>
                Em Férias
                {servidoresEmFerias.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded-full bg-blue-500/20 text-blue-400 font-bold">{servidoresEmFerias.length}</span>}
              </button>
              <button onClick={() => setProgramModalTab('programados')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-all border-b-2 ${
                  programModalTab === 'programados' ? 'text-yellow-400 border-yellow-400 bg-yellow-400/5' : 'text-gray-500 border-transparent hover:text-gray-400'
                }`}>
                <span className="material-symbols-outlined text-[16px]">event_available</span>
                Programados
                {servidoresProgramados.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded-full bg-yellow-500/20 text-yellow-400 font-bold">{servidoresProgramados.length}</span>}
              </button>
              <button onClick={() => setProgramModalTab('novos')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-all border-b-2 ${
                  programModalTab === 'novos' ? 'text-yellow-400 border-yellow-400 bg-yellow-400/5' : 'text-gray-500 border-transparent hover:text-gray-400'
                }`}>
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                Programar
                {servidoresVencidos.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded-full bg-red-500/20 text-red-400 font-bold">{servidoresVencidos.length}</span>}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">

              {/* ===== ABA EM FÉRIAS ===== */}
              {programModalTab === 'em_ferias' && (
                servidoresEmFerias.length > 0 ? (
                  <ul className="divide-y divide-border-dark">
                    {servidoresEmFerias.map((item) => {
                      const endDate = item.feriasAtuais ? parseDate(item.feriasAtuais.periodEnd) : null;
                      const diasRestantes = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000*60*60*24))) : 0;
                      return (
                        <li key={item.id} className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-blue-400 text-[18px]">beach_access</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{item.nome}</p>
                              <p className="text-gray-500 text-[11px] font-mono">{item.matricula}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20">
                                <span className="material-symbols-outlined text-[12px]">hourglass_bottom</span>
                                {diasRestantes} dias restantes
                              </span>
                              {item.feriasAtuais && (
                                <p className="text-gray-500 text-[10px] mt-1">
                                  {formatDate(parseDate(item.feriasAtuais.periodStart))} → {formatDate(parseDate(item.feriasAtuais.periodEnd))}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="py-14 px-4 text-center">
                    <span className="material-symbols-outlined text-4xl text-gray-600 mb-3 block">beach_access</span>
                    <p className="text-gray-500 text-sm">Nenhum servidor em férias no momento.</p>
                    <p className="text-gray-600 text-xs mt-1">Quando chegar o mês programado, o status mudará automaticamente.</p>
                  </div>
                )
              )}

              {/* ===== ABA PROGRAMADOS ===== */}
              {programModalTab === 'programados' && (
                servidoresProgramados.length > 0 ? (
                  <ul className="divide-y divide-border-dark">
                    {servidoresProgramados.map((item) => {
                      const startDate = item.programacao ? parseDate(item.programacao.periodStart) : null;
                      const diasAte = startDate ? Math.max(0, Math.ceil((startDate.getTime() - Date.now()) / (1000*60*60*24))) : 0;
                      return (
                        <li key={item.id} className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-yellow-400 text-[18px]">event_available</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{item.nome}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-gray-500 text-[11px] font-mono">{item.matricula}</span>
                                <span className="text-gray-600">•</span>
                                <span className="text-red-400 text-[11px] font-medium">{item.feriasVencidas} vencida(s)</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 text-[11px] font-bold border border-yellow-500/20">
                                {formatProgramacao(item.programacao!)}
                              </span>
                              <div className="flex items-center justify-end gap-2 mt-1">
                                <span className={`text-[10px] font-medium ${
                                  diasAte <= 30 ? 'text-orange-400' : 'text-gray-500'
                                }`}>
                                  em {diasAte} dias
                                </span>
                                <button onClick={() => handleCancelProgramacao(item.programacao!.id)}
                                  className="text-gray-500 hover:text-red-400 transition-colors" title="Cancelar programação">
                                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="py-14 px-4 text-center">
                    <span className="material-symbols-outlined text-4xl text-gray-600 mb-3 block">event_busy</span>
                    <p className="text-gray-500 text-sm">Nenhum servidor programado.</p>
                    <p className="text-gray-600 text-xs mt-1">Use a aba "Programar" para agendar férias.</p>
                  </div>
                )
              )}

              {/* ===== ABA PROGRAMAR (NOVOS) ===== */}
              {programModalTab === 'novos' && (
                <>
                  {/* Search within modal */}
                  {servidoresVencidos.length > 3 && (
                    <div className="px-4 py-3 border-b border-border-dark bg-[#0a0a0a]">
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[16px]">search</span>
                        <input
                          type="text"
                          placeholder="Buscar servidor..."
                          value={programSearchTerm}
                          onChange={(e) => setProgramSearchTerm(e.target.value)}
                          className="w-full bg-[#161616] border border-border-dark text-white rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-yellow-500/50 transition-all placeholder:text-gray-600"
                        />
                      </div>
                    </div>
                  )}

                  {filteredVencidos.length > 0 ? (
                    <ul className="divide-y divide-border-dark">
                      {filteredVencidos.map((item) => {
                        const selection = programSelections[item.id] || { selected: false, month: '', year: String(currentYear) };
                        const selectedMonth = selection.month ? parseInt(selection.month, 10) : 0;
                        const selectedYear = parseInt(selection.year, 10) || currentYear;
                        const previewStart = selectedMonth ? `01/${String(selectedMonth).padStart(2,'0')}/${selectedYear}` : null;
                        const previewEnd = selectedMonth ? `${getLastDayOfMonth(selectedYear, selectedMonth)}/${String(selectedMonth).padStart(2,'0')}/${selectedYear}` : null;

                        return (
                          <li key={item.id} className={`px-4 py-3 transition-colors ${
                            selection.selected ? 'bg-yellow-500/[0.03]' : 'hover:bg-white/[0.02]'
                          }`}>
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                className="accent-yellow-500 w-4 h-4 cursor-pointer shrink-0 rounded"
                                checked={selection.selected}
                                onChange={(e) => setProgramSelections((prev) => ({ ...prev, [item.id]: { ...prev[item.id], selected: e.target.checked } }))}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{item.nome}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-gray-500 text-[11px] font-mono">{item.matricula}</span>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] font-bold border border-red-500/20">
                                    {item.feriasVencidas} vencida(s)
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <select
                                  value={selection.month}
                                  onChange={(e) => setProgramSelections((prev) => ({ ...prev, [item.id]: { ...prev[item.id], month: e.target.value, selected: true } }))}
                                  className="bg-[#1A1A1A] border border-border-dark text-white rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-yellow-500/50 cursor-pointer"
                                >
                                  <option value="">Mês...</option>
                                  {MONTH_NAMES.map((name, i) => (
                                    <option key={i} value={String(i+1).padStart(2,'0')}>{name.slice(0,3)}</option>
                                  ))}
                                </select>
                                <select
                                  value={selection.year}
                                  onChange={(e) => setProgramSelections((prev) => ({ ...prev, [item.id]: { ...prev[item.id], year: e.target.value, selected: !!prev[item.id]?.month } }))}
                                  className="bg-[#1A1A1A] border border-border-dark text-white rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-yellow-500/50 cursor-pointer"
                                >
                                  {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
                                </select>
                              </div>
                            </div>
                            {/* Preview do período */}
                            {selection.selected && previewStart && previewEnd && (
                              <div className="ml-7 mt-2 flex items-center gap-2 text-[10px] text-gray-500">
                                <span className="material-symbols-outlined text-[14px] text-yellow-500/70">date_range</span>
                                Período: <span className="text-gray-300 font-medium">{previewStart}</span> até <span className="text-gray-300 font-medium">{previewEnd}</span>
                                <span className="text-gray-600">({getLastDayOfMonth(selectedYear, selectedMonth)} dias)</span>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : servidoresVencidos.length > 0 ? (
                    <div className="py-14 px-4 text-center">
                      <span className="material-symbols-outlined text-3xl text-gray-600 mb-2 block">search_off</span>
                      <p className="text-gray-500 text-sm">Nenhum resultado para "{programSearchTerm}"</p>
                    </div>
                  ) : (
                    <div className="py-14 px-4 text-center">
                      <span className="material-symbols-outlined text-4xl text-gray-600 mb-3 block">check_circle</span>
                      <p className="text-gray-500 text-sm">Todos os servidores estão em dia ou já programados!</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border-dark bg-[#0a0a0a]">
              {/* Status transition info */}
              <div className="mb-3 px-3 py-2 rounded-lg bg-[#161616] border border-border-dark">
                <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-yellow-500/70">info</span>
                  <span><strong className="text-gray-400">Transição automática:</strong> Programado → <span className="text-blue-400">Em Férias</span> (quando iniciar o mês) → <span className="text-green-400">Gozada</span> (após o mês)</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsProgramModalOpen(false)} className="flex-1 py-2.5 rounded-xl text-xs font-medium text-gray-400 border border-border-dark hover:bg-white/5 transition-colors">Cancelar</button>
                <button
                  onClick={handleProgramMultipleSave}
                  disabled={saving || selectedCount === 0}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-yellow-500/20 active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {saving ? (
                    <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Salvando...</>
                  ) : (
                    <><span className="material-symbols-outlined text-[16px]">event_note</span> Programar{selectedCount > 0 ? ` (${selectedCount})` : ''}</>
                  )}
                </button>
                <button onClick={handleExportPDF} disabled={servidoresProgramados.length === 0}
                  className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center gap-1.5 shrink-0">
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> PDF
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal Adicionar Servidor */}
      {isAddServerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setIsAddServerModalOpen(false)}>
          <div
            className="bg-[#111111] border border-border-dark rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-border-dark flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-400">person_add</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Adicionar Servidor</h3>
                  <p className="text-xs text-gray-500">Cadastrar novo servidor para verificação de férias</p>
                </div>
              </div>
              <button onClick={() => setIsAddServerModalOpen(false)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Formulário */}
            <div className="p-6 space-y-5 bg-[#0e0e0e]">
              {addServerError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  {addServerError}
                </div>
              )}

              {/* Matrícula */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-500">badge</span>
                  Matrícula
                </label>
                <input
                  type="text"
                  value={addServerForm.matricula}
                  onChange={(e) => setAddServerForm((prev) => ({ ...prev, matricula: e.target.value }))}
                  placeholder="Ex: 12345"
                  className="w-full bg-[#1a1a1a] border border-border-dark text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-gray-600 font-mono"
                  autoFocus
                />
              </div>

              {/* Nome do Servidor */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-500">person</span>
                  Nome do Servidor
                </label>
                <input
                  type="text"
                  value={addServerForm.nome}
                  onChange={(e) => setAddServerForm((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Nome completo do servidor"
                  className="w-full bg-[#1a1a1a] border border-border-dark text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-gray-600"
                />
              </div>

              {/* Admissão */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-500">calendar_month</span>
                  Data de Admissão
                </label>
                <input
                  type="date"
                  value={addServerForm.admissao}
                  onChange={(e) => setAddServerForm((prev) => ({ ...prev, admissao: e.target.value }))}
                  className="w-full bg-[#1a1a1a] border border-border-dark text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Footer / Botões */}
            <div className="px-6 py-4 border-t border-border-dark bg-[#0a0a0a] flex gap-3">
              <button
                onClick={() => setIsAddServerModalOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-400 border border-border-dark hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddServerSave}
                disabled={addServerSaving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center justify-center gap-2"
              >
                {addServerSaving ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Salvando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    Salvar Servidor
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Servidor */}
      {isEditServerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setIsEditServerModalOpen(false)}>
          <div
            className="bg-[#111111] border border-border-dark rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-border-dark flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-400">edit</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Editar Servidor</h3>
                  <p className="text-xs text-gray-500">Alterar dados do servidor</p>
                </div>
              </div>
              <button onClick={() => setIsEditServerModalOpen(false)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Formulário */}
            <div className="p-6 space-y-5 bg-[#0e0e0e]">
              {editServerError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  {editServerError}
                </div>
              )}

              {/* Matrícula */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-500">badge</span>
                  Matrícula
                </label>
                <input
                  type="text"
                  value={editServerForm.matricula}
                  onChange={(e) => setEditServerForm((prev) => ({ ...prev, matricula: e.target.value }))}
                  placeholder="Ex: 12345"
                  className="w-full bg-[#1a1a1a] border border-border-dark text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600 font-mono"
                />
              </div>

              {/* Nome do Servidor */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-500">person</span>
                  Nome do Servidor
                </label>
                <input
                  type="text"
                  value={editServerForm.nome}
                  onChange={(e) => setEditServerForm((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Nome completo do servidor"
                  className="w-full bg-[#1a1a1a] border border-border-dark text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                />
              </div>

              {/* Admissão */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-500">calendar_month</span>
                  Data de Admissão
                </label>
                <input
                  type="date"
                  value={editServerForm.admissao}
                  onChange={(e) => setEditServerForm((prev) => ({ ...prev, admissao: e.target.value }))}
                  className="w-full bg-[#1a1a1a] border border-border-dark text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Footer / Botões */}
            <div className="px-6 py-4 border-t border-border-dark bg-[#0a0a0a] flex gap-3">
              <button
                onClick={() => setIsEditServerModalOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-400 border border-border-dark hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditServerSave}
                disabled={editServerSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-2"
              >
                {editServerSaving ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Salvando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ferias;
