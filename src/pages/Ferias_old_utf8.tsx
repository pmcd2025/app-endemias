import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STORAGE_KEY = 'ferias_programacoes';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Mar├ºo', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type FeriasProgramacao = {
  month: string;
  year: number;
};

type ServidorFerias = {
  matricula: string;
  nome: string;
  admissao: string;
  feriasVencidas: number;
  programacao?: FeriasProgramacao | null;
};

const getProgramYear = (month: string) => {
  const now = new Date();
  const monthNum = parseInt(month, 10);
  const currentMonth = now.getMonth() + 1;
  return monthNum < currentMonth ? now.getFullYear() + 1 : now.getFullYear();
};

const formatProgramacao = (prog: FeriasProgramacao) =>
  `${MONTH_NAMES[parseInt(prog.month, 10) - 1]}/${prog.year}`;

const isBaixaDue = (prog: FeriasProgramacao) => {
  const now = new Date();
  const progDate = new Date(prog.year, parseInt(prog.month, 10) - 1, 1);
  return now >= progDate;
};

const loadProgramacoes = (): Record<string, FeriasProgramacao> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const saveProgramacoes = (data: ServidorFerias[]) => {
  const programacoes: Record<string, FeriasProgramacao> = {};
  data.forEach(s => {
    if (s.programacao) programacoes[s.matricula] = s.programacao;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(programacoes));
};

const applyPendingBaixas = (servidores: ServidorFerias[]): { data: ServidorFerias[]; changed: boolean } => {
  let changed = false;
  const updated = servidores.map(s => {
    if (s.programacao && isBaixaDue(s.programacao)) {
      changed = true;
      return {
        ...s,
        feriasVencidas: Math.max(0, s.feriasVencidas - 1),
        programacao: null,
      };
    }
    return s;
  });
  if (changed) saveProgramacoes(updated);
  return { data: updated, changed };
};

const mergeProgramacoes = (servidores: ServidorFerias[]): ServidorFerias[] => {
  const stored = loadProgramacoes();
  return servidores.map(s => ({
    ...s,
    programacao: stored[s.matricula] ?? s.programacao ?? null,
  }));
};

const parseDate = (dateStr: string) => {
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
};

const formatDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const calculateVacationInfo = (
  admissaoStr: string,
  feriasVencidasDb: number,
  programacao?: FeriasProgramacao | null
) => {
  // Defensive parsing ÔÇô if the date string is malformed, fall back to today
  const admissaoDate = parseDate(admissaoStr);
  if (isNaN(admissaoDate.getTime())) {
    console.warn('Invalid admission date:', admissaoStr);
    return {
      periodosAdquiridos: 0,
      feriasGozadas: 0,
      feriasDisponiveis: feriasVencidasDb,
      inicioProximoPeriodo: '-',
      fimProximoPeriodo: '-',
      proximoVencimento: '-',
      status: programacao
        ? `Programado: ${formatProgramacao(programacao)}`
        : feriasVencidasDb > 0
          ? `${feriasVencidasDb} Per├¡odo(s) Vencido(s)`
          : 'Em dia',
    };
  }

  const currentDate = new Date();
  let periodosAdquiridos = currentDate.getFullYear() - admissaoDate.getFullYear();
  const m = currentDate.getMonth() - admissaoDate.getMonth();
  if (m < 0 || (m === 0 && currentDate.getDate() < admissaoDate.getDate())) {
    periodosAdquiridos--;
  }
  if (periodosAdquiridos < 0) periodosAdquiridos = 0;

  const feriasGozadas = Math.max(0, periodosAdquiridos - feriasVencidasDb);

  const inicioProximo = new Date(admissaoDate.getFullYear() + periodosAdquiridos, admissaoDate.getMonth(), admissaoDate.getDate());
  const fimProximo = new Date(admissaoDate.getFullYear() + periodosAdquiridos + 1, admissaoDate.getMonth(), admissaoDate.getDate());

  return {
    periodosAdquiridos,
    feriasGozadas,
    feriasDisponiveis: feriasVencidasDb,
    inicioProximoPeriodo: formatDate(inicioProximo),
    fimProximoPeriodo: formatDate(fimProximo),
    proximoVencimento: formatDate(fimProximo),
    status: programacao
      ? `Programado: ${formatProgramacao(programacao)}`
      : feriasVencidasDb > 0
        ? `${feriasVencidasDb} Per├¡odo(s) Vencido(s)`
        : 'Em dia',
  };
};

// Dados extra├¡dos das imagens fornecidas
const FERIAS_DATA = [
  // P├ígina 1
  { matricula: '00737001', nome: 'ADELMA DA SILVA SANTOS REIS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01311001', nome: 'ADELSON NASCIMENTO DOS SANTOS', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00738001', nome: 'ADRIANA SILVA SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01310601', nome: 'AIONA PEREIRA SANTOS', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '01310301', nome: 'ALANA BARRETO BRAGA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '01311401', nome: 'ALBERTO CESAR ARAUJO DOS SANTOS', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00449702', nome: 'ALESSANDRO DE OLIVEIRA MORENO', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00349005', nome: 'ALEX SILVA CARVALHO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00056102', nome: 'ALEXSANDRO SANTOS SODRE', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00742601', nome: 'ALINE DE JESUS SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01434201', nome: 'AMANDA SILVA VIANA', admissao: '11/04/2019', feriasVencidas: 1 },
  { matricula: '00444602', nome: 'ANA BARROS SAMPAIO NETA', admissao: '26/11/2009', feriasVencidas: 0 },
  { matricula: '01310901', nome: 'ANA CRISTINA DA SILVA SANTOS', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00740001', nome: 'ANDERSON GONCALVES DOS SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00573502', nome: 'ANDRE FREITAS RAEDER', admissao: '01/07/2008', feriasVencidas: 1 },
  { matricula: '00740501', nome: 'ANDRE SALES CURVELO', admissao: '01/07/2008', feriasVencidas: 0 },
  
  // P├ígina 2
  { matricula: '00560202', nome: 'ANTONIO CARDOSO LIMA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00570002', nome: 'APARECIDA DE JESUS BRANDAO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00562002', nome: 'ARLENE PAZ DE ALMEIDA OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00734001', nome: 'CARLA AYESCA SILVA BARBOSA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00458502', nome: 'CARLOS ALBERTO DIAS ALVES', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00730101', nome: 'CARLOS ALBERTO SILVA SANTOS', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00730501', nome: 'CARLOS ALEXANDRE LIMA REIS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00621602', nome: 'CARLOS ANTONIO OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00734101', nome: 'CATIA CRISTINA SANTOS CALAZANS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01309801', nome: 'CELIO ROBERTO CAROBA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00558402', nome: 'CINTIA DE OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01310001', nome: 'CLAUDINEI SANTOS NASCIMENTO', admissao: '15/08/2016', feriasVencidas: 1 },
  { matricula: '00737601', nome: 'CLAUDINEIDE PEREIRA CHAVES MACIEL SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00730601', nome: 'CLAUDIO SOUSA VIEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00734301', nome: 'CLEITON MATOS PEDREIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00449402', nome: 'CLEUDES SOUSA FERREIRA', admissao: '07/07/2008', feriasVencidas: 0 },

  // P├ígina 3
  { matricula: '00741401', nome: 'CLEUDY FRANCO NUNES FARIAS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00738601', nome: 'CLEVERSON ANDRADE PINHO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00736801', nome: 'CLODOALDO SANTOS DE OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00738301', nome: 'CREMILDA DA CRUZ DE MORAIS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01308801', nome: 'CRISTIANE VIEIRA DE OLIVEIRA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00737201', nome: 'DAIANE MARIA SANTOS', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00737901', nome: 'DANIEL MACEDO DOS SANTOS FILHO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00458602', nome: 'DANILO ALMEIDA FONSECA SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00414502', nome: 'DANILO SILVA DE OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00741501', nome: 'DANYELE DOS SANTOS DIAS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00344505', nome: 'DAVIDSON ARAUJO SANTOS', admissao: '26/11/2009', feriasVencidas: 0 },
  { matricula: '00738401', nome: 'DIEGO SOUZA SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00414002', nome: 'DJENANE DA SILVA FERREIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00416002', nome: 'DORIVAL SOUSA DIAS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00458805', nome: 'EDILEUSA GOMES DOS SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00560402', nome: 'EDLA CARLA POLVORA DO NASCIMENTO', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00575302', nome: 'EDNA SILVA DOS SANTOS', admissao: '01/07/2008', feriasVencidas: 0 },

  // P├ígina 4
  { matricula: '01309501', nome: 'ELITON OLIVEIRA DA SILVA', admissao: '15/08/2016', feriasVencidas: 1 },
  { matricula: '00735801', nome: 'ELIENE DA SILVA CERQUEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01472501', nome: 'ELIETE DO CARMO MELO', admissao: '03/07/2017', feriasVencidas: 0 },
  { matricula: '01625601', nome: 'ELINEIDE REIS SANTOS', admissao: '23/04/2019', feriasVencidas: 1 },
  { matricula: '01309401', nome: 'ELIQUENES SOUTO DOS SANTOS', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00448302', nome: 'ELISANGELA DA SILVA ARAUJO', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00865502', nome: 'ELISSANDRO SANTOS DE OLIVEIRA', admissao: '26/11/2009', feriasVencidas: 1 },
  { matricula: '00576402', nome: 'ERIKSON MARIO SOUZA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00615003', nome: 'ERIVALDO DE SOUZA SILVA', admissao: '26/11/2009', feriasVencidas: 0 },
  { matricula: '00562402', nome: 'ESDRAS SANTOS AGUIAR NOVAIS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00575702', nome: 'ESTELITA VIANA SILVA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01341201', nome: 'FAGNER NASCIMENTO DA SILVA', admissao: '02/05/2018', feriasVencidas: 1 },
  { matricula: '00576302', nome: 'FLAVIO SANTOS MODESTO DA COSTA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00620502', nome: 'FRANCISCO APOLINARIO DA SILVA NETO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00741801', nome: 'FRANCIELI ALVES LIMA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00876002', nome: 'GEANE SOARES DOS SANTOS', admissao: '26/11/2009', feriasVencidas: 1 },

  // P├ígina 5
  { matricula: '00492802', nome: 'GILDASIO SILVA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00741201', nome: 'GILDETE FERREIRA DOS SANTOS SALES', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00741701', nome: 'GILMARA SANTOS OLIVEIRA SETENTA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01626401', nome: 'GILSON DE OLIVEIRA PIRES', admissao: '06/05/2019', feriasVencidas: 2 },
  { matricula: '00741601', nome: 'GILVAN NASCIMENTO DE ALMEIDA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01626501', nome: 'GISELE SILVA DE CASTRO', admissao: '02/05/2019', feriasVencidas: 1 },
  { matricula: '00738201', nome: 'GIVALDO EUZEBIO SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00471602', nome: 'GLEICE DOS SANTOS COUTINHO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00645802', nome: 'GLICIA OLIVEIRA FERREIRA DAS VIRGENS', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00736501', nome: 'HERALDO VIEIRA MOREIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00865602', nome: 'HERVALDO OLIVEIRA DE CARVALHO', admissao: '26/11/2009', feriasVencidas: 0 },
  { matricula: '00560302', nome: 'ILZANETE NUNES NORONHA', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00737101', nome: 'IRANILSON BARBOSA DA CRUZ', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01624801', nome: 'ISABELLA ALVES DA SILVA', admissao: '15/04/2019', feriasVencidas: 1 },
  { matricula: '00631202', nome: 'ISRAEL SILVA BATISTA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00574102', nome: 'ISRAEL VIEIRA SENA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01308401', nome: 'JACKSON OLIVEIRA SANTOS', admissao: '15/08/2016', feriasVencidas: 1 },

  // P├ígina 6
  { matricula: '00576602', nome: 'JADSON GOMES DE OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00577902', nome: 'JAIR FONSECA FONTES', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00643702', nome: 'JAIR SILVA SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00734201', nome: 'JAMILLE BARRETO ROSA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00470602', nome: 'JEAN GENTIL SANTOS RAMOS', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '01308101', nome: 'JEFERSON SANTOS DA ROCHA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '01308201', nome: 'JEFFERSON BARROS DA SILVA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00736701', nome: 'JESSE CARVALHO SOUSA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00738501', nome: 'JOAO PAULO FIGUEIREDO DE CARVALHO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01308301', nome: 'JOELISSON FERREIRA DE SOUZA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00734301', nome: 'JOELMA BARBOSA DE SOUZA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00576502', nome: 'JORGE OLIVEIRA SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00734801', nome: 'JOSE MARCIO DIAS OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00570502', nome: 'JOSE OLIVEIRA DOS SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01307801', nome: 'JOSE PEREIRA COSTA JUNIOR', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '01307501', nome: 'JOSE REINAN GOMES DOS SANTOS JUNIOR', admissao: '15/08/2016', feriasVencidas: 0 },

  // P├ígina 7
  { matricula: '00634602', nome: 'JOSE ROBERTO NASCIMENTO SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00617402', nome: 'JOSE ROBERTO PEREIRA GOES', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01624701', nome: 'JOSE VILSON DIAS ARAGAO', admissao: '16/04/2019', feriasVencidas: 1 },
  { matricula: '00736401', nome: 'JOSEFA DA CRUZ DE MORAIS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00616502', nome: 'JOSENALDO MENDES DOS SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01309601', nome: 'KADU SILVA CAVALCANTE', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00734401', nome: 'LELIA FRANCA VIEIRA', admissao: '07/07/2008', feriasVencidas: 2 },
  { matricula: '01546201', nome: 'LEONARDO RODRIGUES DOS SANTOS', admissao: '05/09/2018', feriasVencidas: 0 },
  { matricula: '00868702', nome: 'LICIA SANTOS NASCIMENTO', admissao: '26/11/2009', feriasVencidas: 0 },
  { matricula: '00742701', nome: 'LINDIVAL LOPES GOMES', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00561302', nome: 'LINDOMAR PEREIRA SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01623801', nome: 'LUANA PRISCILLA BERTHOLDO DOS SANTOS', admissao: '16/04/2019', feriasVencidas: 0 },
  { matricula: '00734601', nome: 'LUCIANA SANTOS DO CARMO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00488602', nome: 'LUCIMAR CRUZ SANTOS', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00561502', nome: 'LUCIMAR SANTOS RIBEIRO', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '01307701', nome: 'LUIS RICARDO HORA ADERNE', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00659602', nome: 'LUIZ PAULO PELLEGRINI FERREIRA', admissao: '07/07/2008', feriasVencidas: 0 },

  // P├ígina 8
  { matricula: '00742501', nome: 'MADSON SANTOS SODRE', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01306901', nome: 'MARCELO VIEIRA MOREIRA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '01307201', nome: 'MARCOS ANTONIO ALVARENGA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '01307601', nome: 'MARCUS VINICIUS BRITO COSTA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00735201', nome: 'MARIA AVANEIDE ALMEIDA SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00733801', nome: 'MARIA DAS GRACAS FELIX DOS SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00738801', nome: 'MARIA MARGARETH BARRETO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00561802', nome: 'MARILENE NUNES DOS SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00471702', nome: 'MARY LUCY SILVA SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00622802', nome: 'MOISES CARDOSO DANTAS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01472701', nome: 'NATALY NASCIMENTO MARTINS', admissao: '03/07/2017', feriasVencidas: 0 },
  { matricula: '00746901', nome: 'PATRICIA MARCAL DE JESUS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00737801', nome: 'PATRICIO ALVES MOREIRA', admissao: '07/07/2008', feriasVencidas: 3 },
  { matricula: '00740201', nome: 'PAULO HENRIQUE SOUSA TEIXEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00677502', nome: 'PAULO VITOR OLIVEIRA BARRETO', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01628801', nome: 'POLLYANA ASSUNCAO SANTOS', admissao: '13/05/2019', feriasVencidas: 1 },

  // P├ígina 9
  { matricula: '01306101', nome: 'RAFAEL SIMOES PADILHA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00741101', nome: 'RAILDA DE JESUS PORFIRIO', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00868002', nome: 'REGINA SILVA DOS SANTOS', admissao: '26/11/2009', feriasVencidas: 1 },
  { matricula: '01305901', nome: 'RENATO SEIXAS VIEIRA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00746501', nome: 'RENIVALDA DOS SANTOS SOUZA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00579202', nome: 'RILDO BARROS DE MENEZES', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01626601', nome: 'RITA DE CASSIA BISPO DOS SANTOS', admissao: '02/05/2019', feriasVencidas: 0 },
  { matricula: '00738701', nome: 'RITA DE CASSIA SOUZA DE OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '00739401', nome: 'RITA SOUSA CARDOSO DE OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00479102', nome: 'ROBERIO DOS SANTOS MAIA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01305801', nome: 'ROMULO BEHRMANN DA SILVA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00738501', nome: 'ROSIMARA ALVES DE JESUS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00676902', nome: 'ROSIVALDO DIAS DA SILVA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00676702', nome: 'ROSIVALDO SANTOS DANTAS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00735601', nome: 'RUTE FRANCISCA DOS SANTOS GONCALVES', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01626101', nome: 'SILAS GOIS SILVA', admissao: '25/04/2019', feriasVencidas: 1 },
  { matricula: '01305501', nome: 'SILVAN DOS SANTOS ALMEIDA', admissao: '15/08/2016', feriasVencidas: 0 },

  // P├ígina 10
  { matricula: '00455102', nome: 'SILVIA DE MENEZES ALVES ESTRELA', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '01305401', nome: 'STHEFANNY JULIANY NASCIMENTO SILVA', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00458902', nome: 'TELMA MARIA MACEDO OLIVEIRA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01305301', nome: 'TONY ROGERIO RODRIGUES', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00865802', nome: 'VALDIRENE DOS SANTOS FERNANDES', admissao: '26/11/2009', feriasVencidas: 0 },
  { matricula: '01624501', nome: 'VANESSA APARECIDA SILVA ARAUJO', admissao: '11/04/2019', feriasVencidas: 1 },
  { matricula: '00556302', nome: 'VANEUSA FERREIRA DOS SANTOS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00593602', nome: 'VANUSA SANTOS DA SILVA', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00746601', nome: 'VERONICA COSTA VIDAL', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '01305201', nome: 'VITOR LAYTYNHER VARJAO RAMOS', admissao: '15/08/2016', feriasVencidas: 0 },
  { matricula: '00735901', nome: 'WERIK DE ANDRADE DANTAS', admissao: '07/07/2008', feriasVencidas: 0 },
  { matricula: '00736601', nome: 'WILLIAMS JOSE DE OLIVEIRA CRUZ', admissao: '07/07/2008', feriasVencidas: 1 },
  { matricula: '01624901', nome: 'ZILMA FIRMINO DE QUEIROZ CAZAIS', admissao: '06/04/2019', feriasVencidas: 1 },
  { matricula: '01305101', nome: 'ZULEIDE CONCEICAO SANTOS', admissao: '15/08/2016', feriasVencidas: 0 },
];

const Ferias: React.FC = () => {
  const [data, setData] = useState<ServidorFerias[]>(() =>
    applyPendingBaixas(mergeProgramacoes(FERIAS_DATA)).data
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newServidor, setNewServidor] = useState({ matricula: '', nome: '', admissao: '', feriasVencidas: 0 });
  const [viewServer, setViewServer] = useState<any>(null);
  const [editServer, setEditServer] = useState<any>(null);
  const [expandedLetters, setExpandedLetters] = useState<string[]>([]);
  const [deleteServer, setDeleteServer] = useState<any>(null);
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [programModalTab, setProgramModalTab] = useState<'programados' | 'novos'>('novos');
  const [programSelections, setProgramSelections] = useState<Record<string, { selected: boolean; month: string }>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => {
        const { data: updated, changed } = applyPendingBaixas(prev);
        return changed ? updated : prev;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const servidoresProgramados = useMemo(() => {
    return data
      .filter(s => s.programacao)
      .sort((a, b) => {
        const pa = a.programacao!;
        const pb = b.programacao!;
        const dateA = new Date(pa.year, parseInt(pa.month, 10) - 1).getTime();
        const dateB = new Date(pb.year, parseInt(pb.month, 10) - 1).getTime();
        return dateA - dateB || a.nome.localeCompare(b.nome);
      });
  }, [data]);

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const lower = searchTerm.toLowerCase();
    return data.filter(
      (item) =>
        item.nome.toLowerCase().includes(lower) ||
        item.matricula.includes(lower)
    );
  }, [searchTerm, data]);

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

  const handleSave = () => {
    if (!newServidor.matricula || !newServidor.nome || !newServidor.admissao) return;
    
    const updatedData = [...data, newServidor];
    updatedData.sort((a, b) => a.nome.localeCompare(b.nome));
    
    setData(updatedData);
    setIsModalOpen(false);
    setNewServidor({ matricula: '', nome: '', admissao: '', feriasVencidas: 0 });
  };

  const handleEditSave = () => {
    if (!editServer || !editServer.matricula || !editServer.nome || !editServer.admissao) return;
    const updatedData = data.map(s => s.matricula === editServer.matricula ? editServer : s);
    updatedData.sort((a, b) => a.nome.localeCompare(b.nome));
    setData(updatedData);
    setEditServer(null);
  };

  const servidoresVencidos = useMemo(() => {
    return data
      .filter(s => s.feriasVencidas > 0 && !s.programacao)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [data]);

  const openProgramModal = () => {
    const selections: Record<string, { selected: boolean; month: string }> = {};
    servidoresVencidos.forEach(s => {
      selections[s.matricula] = { selected: false, month: '' };
    });
    setProgramSelections(selections);
    setProgramModalTab(servidoresProgramados.length > 0 ? 'programados' : 'novos');
    setIsProgramModalOpen(true);
  };

  const handleCancelProgramacao = (matricula: string) => {
    const updatedData = data.map(s =>
      s.matricula === matricula ? { ...s, programacao: null } : s
    );
    setData(updatedData);
    saveProgramacoes(updatedData);
  };

  const handleProgramMultipleSave = () => {
    const updatedData = data.map(s => {
      const sel = programSelections[s.matricula];
      if (sel && sel.selected && sel.month) {
        return {
          ...s,
          programacao: { month: sel.month, year: getProgramYear(sel.month) },
        };
      }
      return s;
    });
    setData(updatedData);
    saveProgramacoes(updatedData);
    setIsProgramModalOpen(false);
    setProgramSelections({});
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Agrupar servidores programados por m├¬s
    const groupedByMonth: Record<string, typeof servidoresProgramados> = {};
    servidoresProgramados.forEach(s => {
      if (s.programacao) {
        const key = `${s.programacao.month}/${s.programacao.year}`;
        if (!groupedByMonth[key]) groupedByMonth[key] = [];
        groupedByMonth[key].push(s);
      }
    });

    // Ordenar meses
    const sortedMonths = Object.keys(groupedByMonth).sort();
    
    let yPosition = 20;
    
    doc.setFontSize(18);
    doc.text('Programa├º├úo de F├®rias', 14, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.text(`Fundo Municipal de Sa├║de de Itabuna - ${new Date().toLocaleDateString('pt-BR')}`, 14, yPosition);
    yPosition += 15;

    sortedMonths.forEach((monthKey, index) => {
      const [month, year] = monthKey.split('/');
      const monthName = MONTH_NAMES[parseInt(month, 10) - 1];
      
      doc.setFontSize(14);
      doc.text(`${monthName} ${year}`, 14, yPosition);
      yPosition += 8;
      
      const tableData = groupedByMonth[monthKey].map(s => [
        s.matricula,
        s.nome,
        s.admissao,
        `${s.feriasVencidas} per├¡odo(s)`
      ]);
      
      autoTable(doc, {
        startY: yPosition,
        head: [['Matr├¡cula', 'Nome', 'Admiss├úo', 'F├®rias Vencidas']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [234, 179, 8] }, // yellow-500
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

  const handleDelete = () => {
    if (!deleteServer) return;
    const updatedData = data.filter(s => s.matricula !== deleteServer.matricula);
    setData(updatedData);
    saveProgramacoes(updatedData);
    setDeleteServer(null);
  };


  const stats = useMemo(() => {
    let totalVencidas = 0;
    let totalEmDia = 0;
    let proximoVencimento: { nome: string; data: string } | null = null;
    let minDate = Infinity;

    data.forEach(item => {
      const info = calculateVacationInfo(item.admissao, item.feriasVencidas, item.programacao);
      if (info.feriasDisponiveis > 0) totalVencidas++;
      else totalEmDia++;

      const [d, m, y] = info.proximoVencimento.split('/').map(Number);
      const ts = new Date(y, m - 1, d).getTime();
      if (ts > Date.now() && ts < minDate) {
        minDate = ts;
        proximoVencimento = { nome: item.nome, data: info.proximoVencimento };
      }
    });
    return { totalVencidas, totalEmDia, proximoVencimento };
  }, [data]);

  return (
    <div className="p-4 md:p-8 animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl md:text-4xl">beach_access</span>
            Listagem F├®rias Vencidas
          </h1>
          <p className="text-gray-400 mt-1">
            Fundo Municipal de Sa├║de de Itabuna - Controle de f├®rias dos servidores.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={openProgramModal}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-yellow-500/20 active:scale-95 w-full md:w-auto justify-center">
            <span className="material-symbols-outlined">event_note</span>
            Programa├º├úo
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-primary/20 active:scale-95 w-full md:w-auto justify-center">
            <span className="material-symbols-outlined">add</span>
            Add
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-red-400">warning</span>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Servidores com F├®rias Vencidas</p>
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
            <p className="text-gray-400 text-sm">Pr├│ximo Vencimento</p>
            {stats.proximoVencimento ? (
              <>
                <p className="text-xl font-bold text-yellow-400">{(stats.proximoVencimento as any).data}</p>
                <p className="text-xs text-gray-500 truncate">{(stats.proximoVencimento as any).nome}</p>
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
              <h2 className="text-lg font-semibold text-white">Servidores em F├®rias Vencidas</h2>
              <p className="text-sm text-gray-400">Total de {filteredData.length} registros encontrados</p>
            </div>
          </div>
          
          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            <input
              type="text"
              placeholder="Buscar por nome ou matr├¡cula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#111111] border border-border-dark text-white rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-gray-500"
            />
          </div>
        </div>

        {/* Lista Agrupada por Letras (Accordion) */}
        <div className="p-6 bg-[#0a0a0a]">
          {groupedData.length > 0 ? (
            <div className="space-y-4">
              {groupedData.map((group) => {
                const isExpanded = expandedLetters.includes(group.letter);
                return (
                  <div key={group.letter} className="bg-[#111111] border border-border-dark rounded-2xl overflow-hidden shadow-lg transition-all">
                    {/* Cabe├ºalho do Accordion (Letra) */}
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
                    
                    {/* Conte├║do do Accordion (Lista de Servidores) */}
                    {isExpanded && (
                      <div className="border-t border-border-dark bg-[#0e0e0e] animate-fade-in">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#111111] text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-4 py-4 font-semibold border-b border-border-dark whitespace-nowrap">Matr├¡cula</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark whitespace-nowrap">Nome</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark whitespace-nowrap">Admiss├úo</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Adquiridos</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Gozadas</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Situa├º├úo</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">Pr├│x. Venc.</th>
                                <th className="px-4 py-4 font-semibold border-b border-border-dark text-center whitespace-nowrap">A├º├Áes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark">
                              {group.items.map((item) => {
                                const info = calculateVacationInfo(item.admissao, item.feriasVencidas, item.programacao);
                                return (
                                <tr key={item.matricula} className="hover:bg-[#151515] transition-colors">
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
                                      <button onClick={() => setEditServer(item)} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Editar">
                                        <span className="material-symbols-outlined text-[20px]">edit</span>
                                      </button>
                                      <button onClick={() => setDeleteServer(item)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Excluir">
                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                      </button>
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
              Pr├│xima
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setIsModalOpen(false)}>
          <div className="bg-[#111111] border border-border-dark rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border-dark flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Adicionar Servidor</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Matr├¡cula</label>
                <input type="text" value={newServidor.matricula} onChange={e => setNewServidor({...newServidor, matricula: e.target.value})} className="w-full bg-[#1A1A1A] border border-border-dark text-white rounded-xl px-4 py-2 focus:outline-none focus:border-primary transition-colors" placeholder="Ex: 0012345" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Nome</label>
                <input type="text" value={newServidor.nome} onChange={e => setNewServidor({...newServidor, nome: e.target.value.toUpperCase()})} className="w-full bg-[#1A1A1A] border border-border-dark text-white rounded-xl px-4 py-2 focus:outline-none focus:border-primary transition-colors" placeholder="NOME COMPLETO" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Admiss├úo</label>
                <input type="text" value={newServidor.admissao} onChange={e => setNewServidor({...newServidor, admissao: e.target.value})} className="w-full bg-[#1A1A1A] border border-border-dark text-white rounded-xl px-4 py-2 focus:outline-none focus:border-primary transition-colors" placeholder="DD/MM/AAAA" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">F├®rias Vencidas</label>
                <input type="number" value={newServidor.feriasVencidas} onChange={e => setNewServidor({...newServidor, feriasVencidas: parseInt(e.target.value) || 0})} className="w-full bg-[#1A1A1A] border border-border-dark text-white rounded-xl px-4 py-2 focus:outline-none focus:border-primary transition-colors" min="0" />
              </div>
            </div>
            <div className="p-6 border-t border-border-dark bg-[#0a0a0a] flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-primary/20">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edi├º├úo */}
      {editServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setEditServer(null)}>
          <div className="bg-[#111111] border border-border-dark rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border-dark flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Editar Servidor</h3>
              <button onClick={() => setEditServer(null)} className="text-gray-400 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Matr├¡cula (Imut├ível)</label>
                <input type="text" value={editServer.matricula} disabled className="w-full bg-[#1A1A1A] border border-border-dark text-gray-500 rounded-xl px-4 py-2 opacity-70 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Nome</label>
                <input type="text" value={editServer.nome} onChange={e => setEditServer({...editServer, nome: e.target.value.toUpperCase()})} className="w-full bg-[#1A1A1A] border border-border-dark text-white rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Admiss├úo</label>
                <input type="text" value={editServer.admissao} onChange={e => setEditServer({...editServer, admissao: e.target.value})} className="w-full bg-[#1A1A1A] border border-border-dark text-white rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">F├®rias Vencidas</label>
                <input type="number" value={editServer.feriasVencidas} onChange={e => setEditServer({...editServer, feriasVencidas: parseInt(e.target.value) || 0})} className="w-full bg-[#1A1A1A] border border-border-dark text-white rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 transition-colors" min="0" />
              </div>
            </div>
            <div className="p-6 border-t border-border-dark bg-[#0a0a0a] flex justify-end gap-3">
              <button onClick={() => setEditServer(null)} className="px-5 py-2.5 rounded-xl font-medium text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={handleEditSave} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20">Salvar Altera├º├Áes</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualiza├º├úo */}
      {viewServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setViewServer(null)}>
          <div className="bg-[#111111] border border-border-dark rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-primary/40 to-blue-500/40 pointer-events-none"></div>
            <button onClick={() => setViewServer(null)} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-50 bg-black/20 p-1 rounded-full backdrop-blur-md cursor-pointer">
              <span className="material-symbols-outlined">close</span>
            </button>
            <div className="p-6 pt-12 flex flex-col items-center relative z-10">
              <div className="w-24 h-24 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center font-bold text-4xl border-4 border-[#111111] shadow-xl mb-4">
                {viewServer.nome.charAt(0)}
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-1">{viewServer.nome}</h3>
              <span className="text-sm font-mono text-gray-400 bg-white/5 px-3 py-1 rounded-full border border-white/10 mb-8">{viewServer.matricula}</span>
              
              <div className="w-full space-y-3 bg-[#1A1A1A] p-5 rounded-2xl border border-border-dark text-sm">
                
                {(() => {
                  const info = calculateVacationInfo(viewServer.admissao, viewServer.feriasVencidas, viewServer.programacao);
                  return (
                    <>
                      <div className="flex justify-between items-center pb-3 border-b border-white/5">
                        <span className="text-gray-400">Data de Admiss├úo</span>
                        <span className="text-white font-medium">{viewServer.admissao}</span>
                      </div>
                      
                      <div className="flex justify-between items-center pb-3 border-b border-white/5">
                        <span className="text-gray-400">Per├¡odos Adquiridos</span>
                        <span className="text-white font-medium">{info.periodosAdquiridos}</span>
                      </div>
                      
                      <div className="flex justify-between items-center pb-3 border-b border-white/5">
                        <span className="text-gray-400">F├®rias Gozadas</span>
                        <span className="text-white font-medium">{info.feriasGozadas}</span>
                      </div>
                      
                      <div className="flex justify-between items-center pb-3 border-b border-white/5">
                        <span className="text-gray-400">Pr├│x. Per├¡odo Aquisitivo</span>
                        <span className="text-white font-medium">{info.inicioProximoPeriodo} a {info.fimProximoPeriodo}</span>
                      </div>
                      
                      <div className="flex justify-between items-center pb-3 border-b border-white/5">
                        <span className="text-gray-400">Pr├│x. Vencimento</span>
                        <span className="text-white font-medium">{info.proximoVencimento}</span>
                      </div>

                      <div className="flex justify-between items-center pt-1">
                        <span className="text-gray-400">Situa├º├úo Atual</span>
                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${
                            viewServer.programacao
                              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                              : info.feriasDisponiveis > 0 
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                : 'bg-green-500/20 text-green-400 border border-green-500/30'
                          }`}>
                          {info.status}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Programa├º├úo de F├®rias */}
      {isProgramModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsProgramModalOpen(false)}
        >
          <div
            className="bg-[#111111] border border-border-dark rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabe├ºalho compacto */}
            <div className="px-4 py-3 border-b border-border-dark flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-yellow-400 text-[18px]">event_note</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate">Programa├º├úo de F├®rias</h3>
                  <p className="text-xs text-gray-500 truncate">Agende e consulte gozos programados</p>
                </div>
              </div>
              <button
                onClick={() => setIsProgramModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10 shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Abas */}
            <div className="flex border-b border-border-dark shrink-0">
              <button
                onClick={() => setProgramModalTab('programados')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
                  programModalTab === 'programados'
                    ? 'text-yellow-400 border-b-2 border-yellow-400 bg-yellow-500/5'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                Programados
                {servidoresProgramados.length > 0 && (
                  <span className="bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                    {servidoresProgramados.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setProgramModalTab('novos')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
                  programModalTab === 'novos'
                    ? 'text-yellow-400 border-b-2 border-yellow-400 bg-yellow-500/5'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                Programar
                {servidoresVencidos.length > 0 && (
                  <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                    {servidoresVencidos.length}
                  </span>
                )}
              </button>
            </div>

            {/* Conte├║do com scroll */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {programModalTab === 'programados' ? (
                servidoresProgramados.length > 0 ? (
                  <ul className="divide-y divide-border-dark">
                    {servidoresProgramados.map(s => (
                      <li key={s.matricula} className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02]">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{s.nome}</p>
                          <p className="text-gray-600 text-[10px] font-mono">{s.matricula}</p>
                        </div>
                        <span className="shrink-0 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap">
                          {formatProgramacao(s.programacao!)}
                        </span>
                        <button
                          onClick={() => handleCancelProgramacao(s.matricula)}
                          className="shrink-0 p-1 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                          title="Cancelar programa├º├úo"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-10 px-4 text-center">
                    <span className="material-symbols-outlined text-3xl text-gray-600 mb-2 block">event_busy</span>
                    <p className="text-gray-500 text-xs">Nenhum servidor programado no momento.</p>
                  </div>
                )
              ) : servidoresVencidos.length > 0 ? (
                <ul className="divide-y divide-border-dark">
                  {servidoresVencidos.map(s => {
                    const sel = programSelections[s.matricula] || { selected: false, month: '' };
                    return (
                      <li
                        key={s.matricula}
                        className={`flex items-center gap-2 px-3 py-2 ${sel.selected ? 'bg-yellow-500/5' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="accent-yellow-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                          checked={sel.selected}
                          onChange={(e) => {
                            setProgramSelections(prev => ({
                              ...prev,
                              [s.matricula]: { ...prev[s.matricula], selected: e.target.checked }
                            }));
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{s.nome}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-gray-600 text-[10px] font-mono">{s.matricula}</span>
                            <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              {s.feriasVencidas} venc.
                            </span>
                          </div>
                        </div>
                        <select
                          value={sel.month}
                          onChange={(e) => {
                            setProgramSelections(prev => ({
                              ...prev,
                              [s.matricula]: { ...prev[s.matricula], month: e.target.value, selected: true }
                            }));
                          }}
                          className="shrink-0 w-[110px] bg-[#1A1A1A] border border-border-dark text-white rounded-md px-2 py-1 text-[11px] focus:outline-none focus:border-yellow-500 transition-colors cursor-pointer"
                        >
                          <option value="">M├¬s...</option>
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
                <div className="py-10 px-4 text-center">
                  <span className="material-symbols-outlined text-3xl text-green-400 mb-2 block">check_circle</span>
                  <p className="text-gray-500 text-xs">Nenhum servidor pendente de programa├º├úo.</p>
                </div>
              )}
            </div>

            {/* Rodap├® compacto */}
            <div className="px-3 py-3 border-t border-border-dark bg-[#0a0a0a] shrink-0">
              <p className="text-[10px] text-gray-500 text-center mb-2.5">
                {servidoresProgramados.length} programado(s) ┬À{' '}
                {(Object.values(programSelections) as { selected: boolean; month: string }[]).filter(s => s.selected && s.month).length} selecionado(s)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsProgramModalOpen(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-400 border border-border-dark hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleProgramMultipleSave}
                  disabled={
                    (Object.values(programSelections) as { selected: boolean; month: string }[]).filter(s => s.selected && s.month).length === 0
                  }
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black py-2 rounded-lg text-xs font-bold transition-all"
                >
                  Programar
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={servidoresProgramados.length === 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-lg text-xs font-bold transition-all"
                >
                  Exportar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirma├º├úo de Exclus├úo */}
      {deleteServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setDeleteServer(null)}>
          <div className="bg-[#111111] border border-border-dark rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden text-center p-8" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Confirmar Exclus├úo</h3>
            <p className="text-gray-400 mb-8">
              Tem certeza que deseja excluir o servidor <strong>{deleteServer.nome}</strong>? Esta a├º├úo n├úo pode ser desfeita.
            </p>
            <div className="flex justify-center gap-3 w-full">
              <button onClick={() => setDeleteServer(null)} className="flex-1 py-2.5 rounded-xl font-medium text-gray-400 border border-border-dark hover:text-white hover:bg-white/5 transition-colors">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-red-600/20">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ferias;
