
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Tables } from '../lib/database.types';

type Server = Tables<'servers'>;

interface SupervisorAreaData {
    id: string;
    name: string;
    servidores: {
        id: string;
        name: string;
        matricula: string;
        submitted: boolean;
        submittedAt?: string;
    }[];
    totalServers: number;
    submittedCount: number;
    completionRate: number;
    status: 'complete' | 'partial' | 'pending';
}

interface SupervisorGeralData {
    id: string;
    name: string;
    supervisoresArea: SupervisorAreaData[];
    totalServers: number;
    submittedCount: number;
    completionRate: number;
    status: 'complete' | 'partial' | 'pending';
}

interface GlobalStats {
    totalServers: number;
    submittedCount: number;
    pendingCount: number;
    completionRate: number;
}

const SubmissionMonitoring: React.FC = () => {
    const { userProfile } = useAuth();

    // State for week/year selection
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedWeeks, setSelectedWeeks] = useState<number[]>([1]); // Padrão: semana 01
    const [isWeekSelectorOpen, setIsWeekSelectorOpen] = useState(false);

    // State for data
    const [hierarchyData, setHierarchyData] = useState<SupervisorGeralData[]>([]);
    const [globalStats, setGlobalStats] = useState<GlobalStats>({
        totalServers: 0,
        submittedCount: 0,
        pendingCount: 0,
        completionRate: 0
    });
    const [isLoading, setIsLoading] = useState(true);

    // State for expansion
    const [expandedGerais, setExpandedGerais] = useState<Set<string>>(new Set());
    const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

    // Filter state
    const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'complete'>('all');

    const years = Array.from({ length: 6 }, (_, i) => 2025 + i);

    function getCurrentWeekNumber() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    }

    useEffect(() => {
        if (userProfile) {
            fetchMonitoringData();
        }
    }, [userProfile, selectedYear, selectedWeeks]);

    const fetchMonitoringData = async () => {
        if (!userProfile) return;

        setIsLoading(true);
        try {
            // Fetch all servers with their supervisors
            const { data: serversData, error: serversError } = await supabase
                .from('servers')
                .select('id, name, matricula, supervisor_geral_id, supervisor_area_id')
                .order('name');

            if (serversError) throw serversError;

            // Fetch weekly records for selected weeks
            const { data: recordsData, error: recordsError } = await supabase
                .from('weekly_records')
                .select('id, server_id, status, updated_at')
                .eq('year', selectedYear)
                .in('week_number', selectedWeeks);

            if (recordsError) throw recordsError;

            // Fetch supervisors
            const supervisorGeralIds = [...new Set((serversData || []).map(s => s.supervisor_geral_id).filter(Boolean))];
            const supervisorAreaIds = [...new Set((serversData || []).map(s => s.supervisor_area_id).filter(Boolean))];

            const { data: supervisoresGeraisData } = await (supabase.from('users') as any)
                .select('id, name')
                .in('id', supervisorGeralIds);

            const { data: supervisoresAreaData } = await (supabase.from('users') as any)
                .select('id, name, supervisor_geral_id')
                .in('id', supervisorAreaIds);

            // Create a map of server_id to submission status
            const submissionMap = new Map<string, { submitted: boolean; submittedAt?: string }>();
            (recordsData || []).forEach((record: any) => {
                const isSubmitted = record.status === 'submitted';
                const existing = submissionMap.get(record.server_id);
                // For multi-week, consider submitted if all selected weeks are submitted
                if (!existing || (existing.submitted && !isSubmitted)) {
                    submissionMap.set(record.server_id, {
                        submitted: isSubmitted,
                        submittedAt: record.updated_at
                    });
                }
            });

            // Build hierarchy data
            const hierarchy: SupervisorGeralData[] = [];

            (supervisoresGeraisData || []).forEach((supGeral: any) => {
                const areasDoGeral = (supervisoresAreaData || []).filter(
                    (supArea: any) => supArea.supervisor_geral_id === supGeral.id
                );

                const supervisoresArea: SupervisorAreaData[] = areasDoGeral.map((supArea: any) => {
                    const servidoresArea = (serversData || []).filter(s => s.supervisor_area_id === supArea.id);
                    const servidoresWithStatus = servidoresArea.map(s => ({
                        id: s.id,
                        name: s.name,
                        matricula: s.matricula,
                        submitted: submissionMap.get(s.id)?.submitted || false,
                        submittedAt: submissionMap.get(s.id)?.submittedAt
                    }));

                    const submittedCount = servidoresWithStatus.filter(s => s.submitted).length;
                    const totalServers = servidoresWithStatus.length;
                    const completionRate = totalServers > 0 ? (submittedCount / totalServers) * 100 : 0;

                    return {
                        id: supArea.id,
                        name: supArea.name,
                        servidores: servidoresWithStatus,
                        totalServers,
                        submittedCount,
                        completionRate,
                        status: completionRate === 100 ? 'complete' : (completionRate > 0 ? 'partial' : 'pending') as 'complete' | 'partial' | 'pending'
                    };
                });

                // Servidores sem supervisor de área
                const servidoresSemArea = (serversData || []).filter(
                    s => s.supervisor_geral_id === supGeral.id && !s.supervisor_area_id
                );

                if (servidoresSemArea.length > 0) {
                    const servidoresWithStatus = servidoresSemArea.map(s => ({
                        id: s.id,
                        name: s.name,
                        matricula: s.matricula,
                        submitted: submissionMap.get(s.id)?.submitted || false,
                        submittedAt: submissionMap.get(s.id)?.submittedAt
                    }));

                    const submittedCount = servidoresWithStatus.filter(s => s.submitted).length;
                    const totalServers = servidoresWithStatus.length;
                    const completionRate = totalServers > 0 ? (submittedCount / totalServers) * 100 : 0;

                    supervisoresArea.push({
                        id: 'sem-area-' + supGeral.id,
                        name: 'Sem Supervisor de Área',
                        servidores: servidoresWithStatus,
                        totalServers,
                        submittedCount,
                        completionRate,
                        status: completionRate === 100 ? 'complete' : (completionRate > 0 ? 'partial' : 'pending')
                    });
                }

                const totalServers = supervisoresArea.reduce((acc, area) => acc + area.totalServers, 0);
                const submittedCount = supervisoresArea.reduce((acc, area) => acc + area.submittedCount, 0);
                const completionRate = totalServers > 0 ? (submittedCount / totalServers) * 100 : 0;

                hierarchy.push({
                    id: supGeral.id,
                    name: supGeral.name,
                    supervisoresArea,
                    totalServers,
                    submittedCount,
                    completionRate,
                    status: completionRate === 100 ? 'complete' : (completionRate > 0 ? 'partial' : 'pending')
                });
            });

            // Servidores sem supervisor geral
            const servidoresSemGeral = (serversData || []).filter(s => !s.supervisor_geral_id);
            if (servidoresSemGeral.length > 0) {
                const servidoresWithStatus = servidoresSemGeral.map(s => ({
                    id: s.id,
                    name: s.name,
                    matricula: s.matricula,
                    submitted: submissionMap.get(s.id)?.submitted || false,
                    submittedAt: submissionMap.get(s.id)?.submittedAt
                }));

                const submittedCount = servidoresWithStatus.filter(s => s.submitted).length;
                const totalServers = servidoresWithStatus.length;
                const completionRate = totalServers > 0 ? (submittedCount / totalServers) * 100 : 0;

                hierarchy.push({
                    id: 'sem-geral',
                    name: 'Sem Supervisor Geral',
                    supervisoresArea: [{
                        id: 'sem-area-sem-geral',
                        name: 'Sem Supervisor de Área',
                        servidores: servidoresWithStatus,
                        totalServers,
                        submittedCount,
                        completionRate,
                        status: completionRate === 100 ? 'complete' : (completionRate > 0 ? 'partial' : 'pending')
                    }],
                    totalServers,
                    submittedCount,
                    completionRate,
                    status: completionRate === 100 ? 'complete' : (completionRate > 0 ? 'partial' : 'pending')
                });
            }

            // Calculate global stats
            const allServers = serversData || [];
            const totalSubmitted = allServers.filter(s => submissionMap.get(s.id)?.submitted).length;

            setHierarchyData(hierarchy);
            setGlobalStats({
                totalServers: allServers.length,
                submittedCount: totalSubmitted,
                pendingCount: allServers.length - totalSubmitted,
                completionRate: allServers.length > 0 ? (totalSubmitted / allServers.length) * 100 : 0
            });

        } catch (error) {
            console.error('Error fetching monitoring data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleWeekSelection = (week: number) => {
        setSelectedWeeks(prev => {
            if (prev.includes(week)) {
                return prev.filter(w => w !== week);
            } else {
                return [...prev, week].sort((a, b) => a - b);
            }
        });
    };

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

    const getStatusColor = (status: 'complete' | 'partial' | 'pending') => {
        switch (status) {
            case 'complete': return 'emerald';
            case 'partial': return 'amber';
            case 'pending': return 'red';
        }
    };

    const getStatusIcon = (status: 'complete' | 'partial' | 'pending') => {
        switch (status) {
            case 'complete': return 'check_circle';
            case 'partial': return 'pending';
            case 'pending': return 'cancel';
        }
    };

    // Filter hierarchy based on filterMode
    const filteredHierarchy = hierarchyData.filter(supGeral => {
        if (filterMode === 'all') return true;
        if (filterMode === 'pending') return supGeral.status !== 'complete';
        if (filterMode === 'complete') return supGeral.status === 'complete';
        return true;
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-full pb-6 bg-background-dark">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-gradient-to-r from-[#101922] via-[#1c2127] to-[#101922] border-b border-gray-800/50 px-4 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-600/20 border border-purple-500/30">
                            <span className="material-symbols-outlined text-purple-400">monitoring</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-white">Monitoramento de Envios</h1>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                                {selectedWeeks.length === 1 ? `Semana ${selectedWeeks[0]}` : `${selectedWeeks.length} semanas`} • {selectedYear}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 space-y-4">
                {/* Painel de Seleção de Período */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-[#1c2127] to-[#252b33] border border-gray-800">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        {/* Year Selector */}
                        <div className="flex items-center gap-3">
                            <label className="text-xs font-bold text-slate-400 uppercase">Ano:</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="px-3 py-2 rounded-lg bg-[#1c2127] border border-gray-700 text-white text-sm focus:ring-primary focus:border-primary"
                            >
                                {years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>

                        {/* Week Selector */}
                        <div className="relative flex-1 min-w-[200px]">
                            <button
                                onClick={() => setIsWeekSelectorOpen(!isWeekSelectorOpen)}
                                className="w-full flex items-center justify-between px-4 py-2 rounded-lg bg-[#1c2127] border border-gray-700 text-white hover:border-primary/50 transition-all"
                            >
                                <span className="text-sm">
                                    {selectedWeeks.length === 0
                                        ? 'Selecione semanas'
                                        : selectedWeeks.length === 1
                                            ? `Semana ${selectedWeeks[0]}`
                                            : `${selectedWeeks.length} semanas selecionadas`
                                    }
                                </span>
                                <span className={`material-symbols-outlined text-gray-400 transition-transform ${isWeekSelectorOpen ? 'rotate-180' : ''}`}>
                                    expand_more
                                </span>
                            </button>

                            {isWeekSelectorOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsWeekSelectorOpen(false)} />
                                    <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#1c2127]/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
                                        <div className="p-2 border-b border-gray-700 bg-gray-800/50 flex items-center justify-between">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">Selecione as semanas</span>
                                            <button
                                                onClick={() => {
                                                    if (selectedWeeks.length === 52) setSelectedWeeks([]);
                                                    else setSelectedWeeks(Array.from({ length: 52 }, (_, i) => i + 1));
                                                }}
                                                className="text-[10px] text-primary hover:underline"
                                            >
                                                {selectedWeeks.length === 52 ? 'Limpar' : 'Selecionar todas'}
                                            </button>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto p-2 grid grid-cols-4 gap-1">
                                            {Array.from({ length: 52 }, (_, i) => i + 1).map(week => (
                                                <button
                                                    key={week}
                                                    onClick={() => toggleWeekSelection(week)}
                                                    className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${selectedWeeks.includes(week)
                                                        ? 'bg-primary text-white'
                                                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                                        } ${week === getCurrentWeekNumber() ? 'ring-1 ring-primary/50' : ''}`}
                                                >
                                                    {String(week).padStart(2, '0')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Refresh Button */}
                        <button
                            onClick={fetchMonitoringData}
                            className="px-4 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-sm">refresh</span>
                            <span className="text-sm font-bold">Atualizar</span>
                        </button>
                    </div>
                </div>

                {/* Global Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-[#1c2127] border border-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                                <span className="material-symbols-outlined text-lg">groups</span>
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase">Total Servidores</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{globalStats.totalServers}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-[#1c2127] border border-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                                <span className="material-symbols-outlined text-lg">check_circle</span>
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase">Enviados</span>
                        </div>
                        <p className="text-2xl font-bold text-emerald-400">{globalStats.submittedCount}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-[#1c2127] border border-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
                                <span className="material-symbols-outlined text-lg">pending</span>
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase">Pendentes</span>
                        </div>
                        <p className="text-2xl font-bold text-red-400">{globalStats.pendingCount}</p>
                    </div>

                    <div className="p-4 rounded-xl bg-[#1c2127] border border-gray-800">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                                <span className="material-symbols-outlined text-lg">trending_up</span>
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase">Taxa de Conclusão</span>
                        </div>
                        <p className="text-2xl font-bold text-purple-400">{globalStats.completionRate.toFixed(1)}%</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="p-4 rounded-xl bg-[#1c2127] border border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-white">Progresso Geral</span>
                        <span className="text-xs text-slate-400">{globalStats.submittedCount} de {globalStats.totalServers} enviados</span>
                    </div>
                    <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                            style={{ width: `${globalStats.completionRate}%` }}
                        />
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    {[
                        { key: 'all', label: 'Todos', icon: 'list' },
                        { key: 'pending', label: 'Pendentes', icon: 'warning' },
                        { key: 'complete', label: 'Completos', icon: 'check' }
                    ].map(filter => (
                        <button
                            key={filter.key}
                            onClick={() => setFilterMode(filter.key as typeof filterMode)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${filterMode === filter.key
                                ? 'bg-primary text-white'
                                : 'bg-[#1c2127] border border-gray-700 text-gray-300 hover:bg-gray-800'
                                }`}
                        >
                            <span className="material-symbols-outlined text-sm">{filter.icon}</span>
                            {filter.label}
                        </button>
                    ))}
                </div>

                {/* Hierarchy List */}
                <div className="space-y-3">
                    {filteredHierarchy.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <span className="material-symbols-outlined text-5xl text-slate-600 mb-3">search_off</span>
                            <p className="text-slate-400">Nenhum supervisor encontrado com o filtro atual.</p>
                        </div>
                    ) : (
                        filteredHierarchy.map(supGeral => {
                            const isGeralExpanded = expandedGerais.has(supGeral.id);
                            const color = getStatusColor(supGeral.status);

                            return (
                                <div
                                    key={supGeral.id}
                                    className={`rounded-2xl border overflow-hidden transition-all ${supGeral.status === 'complete'
                                        ? 'border-emerald-500/30 bg-emerald-500/5'
                                        : supGeral.status === 'partial'
                                            ? 'border-amber-500/30 bg-amber-500/5'
                                            : 'border-red-500/30 bg-red-500/5'
                                        }`}
                                >
                                    {/* Supervisor Geral Header */}
                                    <button
                                        onClick={() => toggleGeralExpanded(supGeral.id)}
                                        className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl bg-${color}-500/20`}>
                                                <span className={`material-symbols-outlined text-${color}-400`}>
                                                    {getStatusIcon(supGeral.status)}
                                                </span>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-white">{supGeral.name}</p>
                                                <p className="text-[10px] text-slate-400">
                                                    {supGeral.supervisoresArea.length} supervisor(es) de área
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <span className={`px-2 py-1 rounded-lg text-xs font-bold bg-${color}-500/20 text-${color}-400`}>
                                                    {supGeral.submittedCount}/{supGeral.totalServers}
                                                </span>
                                                <p className="text-[10px] text-slate-500 mt-1">{supGeral.completionRate.toFixed(0)}%</p>
                                            </div>
                                            <span className={`material-symbols-outlined text-gray-400 transition-transform ${isGeralExpanded ? 'rotate-180' : ''}`}>
                                                expand_more
                                            </span>
                                        </div>
                                    </button>

                                    {/* Supervisores de Área (Expanded) */}
                                    {isGeralExpanded && (
                                        <div className="border-t border-gray-800/50 bg-black/20 p-3 space-y-2">
                                            {supGeral.supervisoresArea.map(supArea => {
                                                const isAreaExpanded = expandedAreas.has(supArea.id);
                                                const areaColor = getStatusColor(supArea.status);

                                                return (
                                                    <div
                                                        key={supArea.id}
                                                        className={`rounded-xl border overflow-hidden ${supArea.status === 'complete'
                                                            ? 'border-emerald-500/20 bg-emerald-500/5'
                                                            : supArea.status === 'partial'
                                                                ? 'border-amber-500/20 bg-amber-500/5'
                                                                : 'border-red-500/20 bg-red-500/5'
                                                            }`}
                                                    >
                                                        {/* Supervisor Área Header */}
                                                        <button
                                                            onClick={() => toggleAreaExpanded(supArea.id)}
                                                            className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-all"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className={`material-symbols-outlined text-sm text-${areaColor}-400`}>
                                                                    {getStatusIcon(supArea.status)}
                                                                </span>
                                                                <span className="text-sm font-medium text-white">{supArea.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-${areaColor}-500/20 text-${areaColor}-400`}>
                                                                    {supArea.submittedCount}/{supArea.totalServers}
                                                                </span>
                                                                <span className={`material-symbols-outlined text-sm text-gray-500 transition-transform ${isAreaExpanded ? 'rotate-180' : ''}`}>
                                                                    expand_more
                                                                </span>
                                                            </div>
                                                        </button>

                                                        {/* Servidores (Expanded) */}
                                                        {isAreaExpanded && (
                                                            <div className="border-t border-gray-800/30 bg-black/10 p-2 space-y-1">
                                                                {supArea.servidores.map(servidor => (
                                                                    <div
                                                                        key={servidor.id}
                                                                        className={`flex items-center justify-between p-2 rounded-lg ${servidor.submitted
                                                                            ? 'bg-emerald-500/10'
                                                                            : 'bg-red-500/10'
                                                                            }`}
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            <div
                                                                                className="size-8 rounded-full bg-cover bg-center ring-1 ring-gray-700"
                                                                                style={{
                                                                                    backgroundImage: `url('https://ui-avatars.com/api/?name=${encodeURIComponent(servidor.name)}&background=${servidor.submitted ? '10b981' : 'ef4444'}&color=fff&size=64')`
                                                                                }}
                                                                            />
                                                                            <div>
                                                                                <p className="text-xs font-medium text-white">{servidor.name}</p>
                                                                                <p className="text-[10px] text-slate-500">Mat: {servidor.matricula}</p>
                                                                            </div>
                                                                        </div>
                                                                        <span className={`px-2 py-1 rounded text-[9px] font-bold ${servidor.submitted
                                                                            ? 'bg-emerald-500/20 text-emerald-400'
                                                                            : 'bg-red-500/20 text-red-400'
                                                                            }`}>
                                                                            {servidor.submitted ? '✓ ENVIADO' : '⏳ PENDENTE'}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </main>
        </div>
    );
};

export default SubmissionMonitoring;
