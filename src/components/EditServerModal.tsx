import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Tables } from '../lib/database.types';

type Server = Tables<'servers'>;

interface EditServerModalProps {
    isOpen: boolean;
    onClose: () => void;
    server: Server | null;
    onSave: (updatedServer: Server) => void;
    supervisoresGerais: { id: string; name: string }[];
}

const EditServerModal: React.FC<EditServerModalProps> = ({ isOpen, onClose, server, onSave, supervisoresGerais }) => {
    const [formData, setFormData] = useState<Partial<Server>>({});
    const [saving, setSaving] = useState(false);
    const [supervisoresArea, setSupervisoresArea] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        if (server) {
            setFormData(server);
            if (server.supervisor_geral_id) {
                fetchSupervisoresArea(server.supervisor_geral_id);
            }
        }
    }, [server]);

    const fetchSupervisoresArea = async (supervisorGeralId: string) => {
        try {
            const { data } = await (supabase.from('users') as any)
                .select('id, name')
                .eq('role', 'supervisor_area')
                .eq('supervisor_geral_id', supervisorGeralId)
                .order('name');
            setSupervisoresArea(data || []);
        } catch (err) {
            console.error('Erro ao buscar supervisores de área:', err);
        }
    };

    const handleSupervisorGeralChange = (id: string) => {
        setFormData(prev => ({ ...prev, supervisor_geral_id: id, supervisor_area_id: null })); // Reset area supervisor
        if (id) {
            fetchSupervisoresArea(id);
        } else {
            setSupervisoresArea([]);
        }
    };

    if (!isOpen || !server) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        // Simulate API call delay if needed or just pass back
        // The actual update will happen in the parent
        onSave({ ...server, ...formData } as Server);
        setSaving(false);
    };

    const statusOptions = [
        { value: 'active', label: 'Ativo' },
        { value: 'inactive', label: 'Inativo' },
        { value: 'vacation', label: 'Férias' },
        { value: 'leave', label: 'Afastado' }
    ];

    const funcaoOptions = ['Téc. Endemias', 'Supervisor de Área', 'Supervisor Geral'];
    const vinculoOptions = ['Efetivo', 'Contrato'];

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-[#1c2127] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <h2 className="text-lg font-bold text-white">Editar Servidor</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Nome Completo</label>
                        <input
                            type="text"
                            value={formData.name || ''}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Matrícula</label>
                        <input
                            type="text"
                            value={formData.matricula || ''}
                            onChange={(e) => setFormData({ ...formData, matricula: e.target.value })}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Status</label>
                        <select
                            value={formData.status || 'active'}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                        >
                            {statusOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Função</label>
                        <select
                            value={formData.role || ''}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                        >
                            {funcaoOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Vínculo</label>
                        <select
                            value={formData.vinculo || ''}
                            onChange={(e) => setFormData({ ...formData, vinculo: e.target.value })}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                        >
                            {vinculoOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                    {/* Supervisor Geral */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Supervisor Geral</label>
                        <select
                            value={formData.supervisor_geral_id || ''}
                            onChange={(e) => handleSupervisorGeralChange(e.target.value)}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                        >
                            <option value="">Selecione...</option>
                            {supervisoresGerais.map(sup => (
                                <option key={sup.id} value={sup.id}>{sup.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Supervisor de Área */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Supervisor de Área</label>
                        <select
                            value={formData.supervisor_area_id || ''}
                            onChange={(e) => setFormData({ ...formData, supervisor_area_id: e.target.value })}
                            disabled={!formData.supervisor_geral_id}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127] disabled:opacity-50"
                        >
                            <option value="">Selecione...</option>
                            {supervisoresArea.map(sup => (
                                <option key={sup.id} value={sup.id}>{sup.name}</option>
                            ))}
                        </select>
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
                            disabled={saving}
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

export default EditServerModal;
