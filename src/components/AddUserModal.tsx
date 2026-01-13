import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ROLE_DB_VALUES, ASSIGNABLE_ROLES } from '../lib/constants';

interface AddUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (user: {
        name: string;
        role: string;
        email: string;
        password?: string;
        supervisor_geral_id?: string;
        supervisor_area_id?: string;
    }) => void;
}

interface SupervisorOption {
    id: string;
    name: string;
}

const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [roleLabel, setRoleLabel] = useState('Supervisor Geral');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Hierarquia
    const [supervisoresGerais, setSupervisoresGerais] = useState<SupervisorOption[]>([]);
    const [supervisoresArea, setSupervisoresArea] = useState<SupervisorOption[]>([]);
    const [selectedSupervisorGeral, setSelectedSupervisorGeral] = useState('');
    const [selectedSupervisorArea, setSelectedSupervisorArea] = useState('');
    const [loadingSupervisors, setLoadingSupervisors] = useState(false);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setName('');
            setRoleLabel('Supervisor Geral');
            setEmail('');
            setPassword('');
            setSelectedSupervisorGeral('');
            setSelectedSupervisorArea('');
            fetchSupervisoresGerais();
        }
    }, [isOpen]);

    // Fetch Supervisores de Área quando Supervisor Geral é selecionado
    useEffect(() => {
        if (selectedSupervisorGeral) {
            fetchSupervisoresArea(selectedSupervisorGeral);
        } else {
            setSupervisoresArea([]);
            setSelectedSupervisorArea('');
        }
    }, [selectedSupervisorGeral]);

    const fetchSupervisoresGerais = async () => {
        setLoadingSupervisors(true);
        try {
            const { data, error } = await (supabase
                .from('users') as any)
                .select('id, name')
                .eq('role', 'supervisor_geral')
                .order('name');

            if (!error && data) {
                setSupervisoresGerais(data);
            }
        } catch (err) {
            console.error('Erro ao buscar supervisores gerais:', err);
        } finally {
            setLoadingSupervisors(false);
        }
    };

    const fetchSupervisoresArea = async (supervisorGeralId: string) => {
        try {
            const { data, error } = await (supabase
                .from('users') as any)
                .select('id, name')
                .eq('role', 'supervisor_area')
                .eq('supervisor_geral_id', supervisorGeralId)
                .order('name');

            if (!error && data) {
                setSupervisoresArea(data);
            }
        } catch (err) {
            console.error('Erro ao buscar supervisores de área:', err);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const dbRole = ROLE_DB_VALUES[roleLabel] || 'servidor';

        // Validações de hierarquia
        if (dbRole === 'supervisor_area' && !selectedSupervisorGeral) {
            alert('Supervisor de Área deve estar vinculado a um Supervisor Geral.');
            return;
        }

        if (dbRole === 'servidor' && (!selectedSupervisorGeral || !selectedSupervisorArea)) {
            alert('Servidor deve estar vinculado a um Supervisor Geral e um Supervisor de Área.');
            return;
        }

        onSave({
            name,
            role: dbRole,
            email,
            password,
            supervisor_geral_id: selectedSupervisorGeral || undefined,
            supervisor_area_id: selectedSupervisorArea || undefined
        });
        onClose();
    };

    const showSupervisorGeralSelect = roleLabel === 'Supervisor de Área' || roleLabel === 'Servidor';
    const showSupervisorAreaSelect = roleLabel === 'Servidor';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-[#1c2127] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-[#1c2127] z-10">
                    <h2 className="text-lg font-bold text-white">Adicionar Usuário</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Nome Completo</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all placeholder:text-gray-600"
                            placeholder="Ex: João da Silva"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Perfil/Função</label>
                        <select
                            value={roleLabel}
                            onChange={(e) => {
                                setRoleLabel(e.target.value);
                                setSelectedSupervisorGeral('');
                                setSelectedSupervisorArea('');
                            }}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                        >
                            {ASSIGNABLE_ROLES.map(label => (
                                <option key={label} value={label}>{label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Seleção de Supervisor Geral */}
                    {showSupervisorGeralSelect && (
                        <div className="space-y-1.5 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                            <label className="text-xs font-medium text-blue-400 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">account_tree</span>
                                Supervisor Geral (Obrigatório)
                            </label>
                            <select
                                value={selectedSupervisorGeral}
                                onChange={(e) => setSelectedSupervisorGeral(e.target.value)}
                                required
                                className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                            >
                                <option value="">Selecione o Supervisor Geral...</option>
                                {supervisoresGerais.map(sup => (
                                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                                ))}
                            </select>
                            {supervisoresGerais.length === 0 && !loadingSupervisors && (
                                <p className="text-[10px] text-amber-500">Nenhum Supervisor Geral cadastrado.</p>
                            )}
                        </div>
                    )}

                    {/* Seleção de Supervisor de Área */}
                    {showSupervisorAreaSelect && selectedSupervisorGeral && (
                        <div className="space-y-1.5 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                            <label className="text-xs font-medium text-green-400 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">person</span>
                                Supervisor de Área (Obrigatório)
                            </label>
                            <select
                                value={selectedSupervisorArea}
                                onChange={(e) => setSelectedSupervisorArea(e.target.value)}
                                required
                                className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
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

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all placeholder:text-gray-600"
                            placeholder="Ex: usuario@sistema.com"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Senha</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all placeholder:text-gray-600"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border border-gray-800 rounded-xl text-slate-300 font-medium hover:bg-white/5 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-light transition-colors shadow-lg shadow-primary/20"
                        >
                            Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddUserModal;
