import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import type { InsertTables, Tables } from '../lib/database.types';
import { useAuth } from '../contexts/AuthContext';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
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
          ? `Em ferias ate ${formatDate(parseDate(item.feriasAtuais.periodEnd))}`
          : item.feriasVencidas > 0
            ? `${item.feriasVencidas} Periodo(s) Vencido(s)`
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
        ? `Em ferias ate ${formatDate(parseDate(item.feriasAtuais.periodEnd))}`
        : item.feriasVencidas > 0
          ? `${item.feriasVencidas} Periodo(s) Vencido(s)`
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
  const [programModalTab, setProgramModalTab] = useState<'programados' | 'novos'>('novos');
  const [programSelections, setProgramSelections] = useState<Record<string, ProgramSelection>>({});

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

        return {
          id: server.id,
          matricula: server.matricula,
          nome: server.name,
          admissao: hireDate ? formatDate(parseDate(hireDate)) : '-',
          feriasVencidas: Math.max(0, periodosAdquiridos - consumedCount),
          feriasGozadas: Math.min(periodosAdquiridos, consumedCount),
          programacao: futureVacation ? mapProgramacao(futureVacation) : null,
          feriasAtuais: activeVacation ? mapProgramacao(activeVacation) : null,
        };
      });

      setData(mapped);
    } catch (error) {
      console.error('Erro ao carregar dados de ferias:', error);
      alert('Nao foi possivel carregar os dados de ferias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeriasData();
  }, [userProfile]);

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

  const stats = useMemo(() => {
    let totalVencidas = 0;
    let totalEmDia = 0;
    let proximoVencimento: { nome: string; data: string } | null = null;
    let minDate = Infinity;

    data.forEach((item) => {
      const info = getInfo(item);
      if (item.feriasVencidas > 0 && !item.programacao && !item.feriasAtuais) totalVencidas++;
      else totalEmDia++;

      if (info.proximoVencimento !== '-') {
        const nextDate = parseDate(info.proximoVencimento).getTime();
        if (nextDate > Date.now() && nextDate < minDate) {
          minDate = nextDate;
          proximoVencimento = { nome: item.nome, data: info.proximoVencimento };
        }
      }
    });

    return { totalVencidas, totalEmDia, proximoVencimento };
  }, [data]);

  const openProgramModal = () => {
    const selections: Record<string, ProgramSelection> = {};
    servidoresVencidos.forEach((item) => {
      selections[item.id] = { selected: false, month: '' };
    });
    setProgramSelections(selections);
    setProgramModalTab(servidoresProgramados.length > 0 ? 'programados' : 'novos');
    setIsProgramModalOpen(true);
  };

  const handleCancelProgramacao = async (vacationId: string) => {
    if (!window.confirm('Deseja cancelar esta programacao de ferias?')) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('vacations').delete().eq('id', vacationId);
      if (error) throw error;
      await fetchFeriasData();
    } catch (error) {
      console.error('Erro ao cancelar programacao:', error);
      alert('Nao foi possivel cancelar a programacao.');
    } finally {
      setSaving(false);
    }
  };

  const handleProgramMultipleSave = async () => {
    const selected = servidoresVencidos
      .map((item) => ({ item, selection: programSelections[item.id] }))
      .filter(({ selection }) => selection?.selected && selection.month);

    if (selected.length === 0) return;

    setSaving(true);
    try {
      const payload: VacationInsert[] = selected.map(({ item, selection }) => {
        const year = getProgramYear(selection.month);
        const startDate = new Date(year, parseInt(selection.month, 10) - 1, 1);
        const endDate = new Date(year, parseInt(selection.month, 10) - 1, 30);
        return {
          server_id: item.id,
          period_start: formatIsoDate(startDate),
          period_end: formatIsoDate(endDate),
          days_count: 30,
          days_sold: 0,
          year_reference: year,
          created_by: userProfile?.id || null,
          status: 'scheduled',
          notes: 'Programacao criada pela tela de ferias',
        };
      });

      // Workaround para cenarios em que o client do Supabase infere o insert como `never`.
      const { error } = await supabase.from('vacations').insert(payload as unknown as never[]);
      if (error) throw error;
      setIsProgramModalOpen(false);
      await fetchFeriasData();
    } catch (error) {
      console.error('Erro ao programar ferias:', error);
      alert('Nao foi possivel salvar a programacao de ferias.');
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

    let y = 20;
    doc.setFontSize(18);
    doc.text('Programacao de Ferias', 14, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 14, y);
    y += 15;

    Object.keys(grouped).sort().forEach((key) => {
      const [month, year] = key.split('/');
      doc.setFontSize(14);
      doc.text(`${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`, 14, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        head: [['Matricula', 'Nome', 'Admissao', 'Ferias Vencidas']],
        body: grouped[key].map((item) => [item.matricula, item.nome, item.admissao, String(item.feriasVencidas)]),
        theme: 'striped',
        headStyles: { fillColor: [234, 179, 8] },
        styles: { fontSize: 8 },
      });

      y = (doc as any).lastAutoTable.finalY + 10;
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save('programacao_ferias.pdf');
  };

  return (
    <div className="p-4 md:p-8 animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl md:text-4xl">beach_access</span>
            Listagem Ferias Vencidas
          </h1>
          <p className="text-gray-400 mt-1">Dados sincronizados com o Supabase.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={fetchFeriasData}
            disabled={loading || saving}
            className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#222] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium border border-border-dark w-full md:w-auto justify-center"
          >
            <span className="material-symbols-outlined">refresh</span>
            Atualizar
          </button>
          <button
            onClick={openProgramModal}
            disabled={loading || saving}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black px-4 py-2.5 rounded-xl font-medium w-full md:w-auto justify-center"
          >
            <span className="material-symbols-outlined">event_note</span>
            Programacao
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
          <p className="text-gray-400 text-sm">Servidores com Ferias Vencidas</p>
          <p className="text-3xl font-bold text-red-400">{stats.totalVencidas}</p>
        </div>
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-5">
          <p className="text-gray-400 text-sm">Servidores Em Dia</p>
          <p className="text-3xl font-bold text-green-400">{stats.totalEmDia}</p>
        </div>
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-5">
          <p className="text-gray-400 text-sm">Proximo Vencimento</p>
          <p className="text-xl font-bold text-yellow-400">{stats.proximoVencimento?.data || '---'}</p>
          <p className="text-xs text-gray-500 truncate">{stats.proximoVencimento?.nome || ''}</p>
        </div>
      </div>

      <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-border-dark flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-dark/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Servidores sincronizados</h2>
            <p className="text-sm text-gray-400">Total de {filteredData.length} registros encontrados</p>
          </div>
          <input
            type="text"
            placeholder="Buscar por nome ou matricula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72 bg-[#111111] border border-border-dark text-white rounded-xl px-4 py-2 focus:outline-none focus:border-primary"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#111111] text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-4 font-semibold border-b border-border-dark">Matricula</th>
                <th className="px-4 py-4 font-semibold border-b border-border-dark">Nome</th>
                <th className="px-4 py-4 font-semibold border-b border-border-dark">Admissao</th>
                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center">Adquiridos</th>
                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center">Gozadas</th>
                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center">Situacao</th>
                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center">Prox. Venc.</th>
                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-400" colSpan={8}>Carregando dados de ferias...</td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-400" colSpan={8}>Nenhum servidor encontrado.</td>
                </tr>
              ) : filteredData.map((item) => {
                const info = getInfo(item);
                return (
                  <tr key={item.id} className="hover:bg-[#151515] transition-colors">
                    <td className="px-4 py-4"><span className="font-mono text-gray-300">{item.matricula}</span></td>
                    <td className="px-4 py-4 text-white font-medium">{item.nome}</td>
                    <td className="px-4 py-4 text-gray-400">{item.admissao}</td>
                    <td className="px-4 py-4 text-center text-gray-300">{info.periodosAdquiridos}</td>
                    <td className="px-4 py-4 text-center text-gray-300">{info.feriasGozadas}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-white/5 text-gray-200">{info.status}</span>
                    </td>
                    <td className="px-4 py-4 text-center text-gray-400">{info.proximoVencimento}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setViewServer(item)} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                          <span className="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                        {item.programacao && (
                          <button onClick={() => handleCancelProgramacao(item.programacao.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                            <span className="material-symbols-outlined text-[20px]">close</span>
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
                    <div className="flex justify-between"><span className="text-gray-400">Matricula</span><span className="text-white">{viewServer.matricula}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Admissao</span><span className="text-white">{viewServer.admissao}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Periodos Adquiridos</span><span className="text-white">{info.periodosAdquiridos}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Ferias Gozadas</span><span className="text-white">{info.feriasGozadas}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Prox. Vencimento</span><span className="text-white">{info.proximoVencimento}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Situacao</span><span className="text-white">{info.status}</span></div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {isProgramModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsProgramModalOpen(false)}>
          <div className="bg-[#111111] border border-border-dark rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border-dark flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Programacao de Ferias</h3>
              <button onClick={() => setIsProgramModalOpen(false)} className="text-gray-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex border-b border-border-dark">
              <button onClick={() => setProgramModalTab('programados')} className={`flex-1 px-3 py-2.5 text-xs font-semibold ${programModalTab === 'programados' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-500'}`}>Programados</button>
              <button onClick={() => setProgramModalTab('novos')} className={`flex-1 px-3 py-2.5 text-xs font-semibold ${programModalTab === 'novos' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-500'}`}>Programar</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {programModalTab === 'programados' ? (
                servidoresProgramados.length > 0 ? (
                  <ul className="divide-y divide-border-dark">
                    {servidoresProgramados.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{item.nome}</p>
                          <p className="text-gray-600 text-[10px] font-mono">{item.matricula}</p>
                        </div>
                        <span className="text-yellow-400 text-[10px] font-bold">{formatProgramacao(item.programacao!)}</span>
                        <button onClick={() => handleCancelProgramacao(item.programacao!.id)} className="p-1 text-gray-500 hover:text-red-400">
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-10 px-4 text-center text-gray-500 text-xs">Nenhum servidor programado no momento.</div>
                )
              ) : (
                servidoresVencidos.length > 0 ? (
                  <ul className="divide-y divide-border-dark">
                    {servidoresVencidos.map((item) => {
                      const selection = programSelections[item.id] || { selected: false, month: '' };
                      return (
                        <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                          <input
                            type="checkbox"
                            className="accent-yellow-500 w-3.5 h-3.5"
                            checked={selection.selected}
                            onChange={(e) => setProgramSelections((prev) => ({ ...prev, [item.id]: { ...prev[item.id], selected: e.target.checked } }))}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium truncate">{item.nome}</p>
                            <p className="text-gray-600 text-[10px] font-mono">{item.matricula}</p>
                          </div>
                          <select
                            value={selection.month}
                            onChange={(e) => setProgramSelections((prev) => ({ ...prev, [item.id]: { ...prev[item.id], month: e.target.value, selected: true } }))}
                            className="w-[110px] bg-[#1A1A1A] border border-border-dark text-white rounded-md px-2 py-1 text-[11px]"
                          >
                            <option value="">Mes...</option>
                            <option value="01">Jan</option>
                            <option value="02">Fev</option>
                            <option value="03">Mar</option>
                            <option value="04">Abr</option>
                            <option value="05">Mai</option>
                            <option value="06">Jun</option>
                            <option value="07">Jul</option>
                            <option value="08">Ago</option>
                            <option value="09">Set</option>
                            <option value="10">Out</option>
                            <option value="11">Nov</option>
                            <option value="12">Dez</option>
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="py-10 px-4 text-center text-gray-500 text-xs">Nenhum servidor pendente de programacao.</div>
                )
              )}
            </div>
            <div className="px-3 py-3 border-t border-border-dark bg-[#0a0a0a]">
              <div className="flex gap-2">
                <button onClick={() => setIsProgramModalOpen(false)} className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-400 border border-border-dark">Cancelar</button>
                <button
                  onClick={handleProgramMultipleSave}
                  disabled={saving || (Object.values(programSelections) as ProgramSelection[]).filter((item) => item.selected && item.month).length === 0}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black py-2 rounded-lg text-xs font-bold"
                >
                  Programar
                </button>
                <button onClick={handleExportPDF} disabled={servidoresProgramados.length === 0} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-2 rounded-lg text-xs font-bold">Exportar PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ferias;
