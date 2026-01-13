import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { ROLE_DB_VALUES, ROLE_LABELS } from '../lib/constants';

type User = Database['public']['Tables']['users']['Row'];

interface SupervisorOption {
    id: string;
    name: string;
}

interface EditUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSave: (updatedUser: User) => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, onSave }) => {
    const [formData, setFormData] = useState<Partial<User>>({});
    const [roleLabel, setRoleLabel] = useState('');
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Hierarquia
    const [supervisoresGerais, setSupervisoresGerais] = useState<SupervisorOption[]>([]);
    const [supervisoresArea, setSupervisoresArea] = useState<SupervisorOption[]>([]);
    const [selectedSupervisorGeral, setSelectedSupervisorGeral] = useState('');
    const [selectedSupervisorArea, setSelectedSupervisorArea] = useState('');

    useEffect(() => {
        if (user && isOpen) {
            setFormData(user);
            setRoleLabel(ROLE_LABELS[user.role] || user.role);
            setSelectedSupervisorGeral(user.supervisor_geral_id || '');
            setSelectedSupervisorArea(user.supervisor_area_id || '');
            setAvatarPreview(user.avatar_url || null);
            fetchSupervisoresGerais();
            if (user.supervisor_geral_id) {
                fetchSupervisoresArea(user.supervisor_geral_id);
            }
        }
    }, [user, isOpen]);

    const fetchSupervisoresGerais = async () => {
        try {
            const { data } = await (supabase.from('users') as any)
                .select('id, name')
                .eq('role', 'supervisor_geral')
                .order('name');
            setSupervisoresGerais(data || []);
        } catch (err) {
            console.error('Erro ao buscar supervisores gerais:', err);
        }
    };

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
        setSelectedSupervisorGeral(id);
        setSelectedSupervisorArea('');
        if (id) fetchSupervisoresArea(id);
        else setSupervisoresArea([]);
    };

    const handleImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        // Validar tipo de arquivo
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione apenas arquivos de imagem.');
            return;
        }

        // Validar tamanho (máximo 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('A imagem deve ter no máximo 2MB.');
            return;
        }

        setUploadingImage(true);

        try {
            // Gerar nome único para o arquivo
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            // Upload para Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) {
                console.error('Erro no upload:', uploadError);
                alert('Erro ao fazer upload da imagem. Verifique se o bucket "avatars" existe no Supabase Storage.');
                return;
            }

            // Obter URL pública
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setAvatarPreview(publicUrl);
            setFormData({ ...formData, avatar_url: publicUrl });

        } catch (err) {
            console.error('Erro no upload:', err);
            alert('Erro ao fazer upload da imagem.');
        } finally {
            setUploadingImage(false);
        }
    };

    const getAvatarUrl = () => {
        if (avatarPreview) return avatarPreview;
        if (formData.name) return `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name)}&background=3b82f6&color=fff&size=150`;
        return 'https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff&size=150';
    };

    if (!isOpen || !user) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        const dbRole = ROLE_DB_VALUES[roleLabel] || roleLabel;

        onSave({
            ...user,
            ...formData,
            role: dbRole,
            supervisor_geral_id: selectedSupervisorGeral || null,
            supervisor_area_id: selectedSupervisorArea || null
        } as User);
        setSaving(false);
    };

    const showSupervisorGeralSelect = roleLabel === 'Supervisor de Área' || roleLabel === 'Servidor';
    const showSupervisorAreaSelect = roleLabel === 'Servidor';

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-[#1c2127] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-[#1c2127] z-10">
                    <h2 className="text-lg font-bold text-white">Editar Usuário</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Avatar Upload */}
                    <div className="flex flex-col items-center gap-3">
                        <div
                            onClick={handleImageClick}
                            className="relative cursor-pointer group"
                        >
                            <div
                                className="size-24 rounded-full bg-cover bg-center ring-4 ring-gray-700 group-hover:ring-primary transition-all"
                                style={{ backgroundImage: `url('${getAvatarUrl()}')` }}
                            />
                            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                {uploadingImage ? (
                                    <div className="size-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span className="material-symbols-outlined text-white text-2xl">photo_camera</span>
                                )}
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                        <p className="text-[10px] text-slate-500">Clique para alterar a foto</p>
                    </div>

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
                        <label className="text-xs font-medium text-slate-400">Email</label>
                        <input
                            type="email"
                            value={formData.email || ''}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Perfil/Função</label>
                        <select
                            value={roleLabel}
                            onChange={(e) => {
                                setRoleLabel(e.target.value);
                                if (e.target.value === 'Supervisor Geral') {
                                    setSelectedSupervisorGeral('');
                                    setSelectedSupervisorArea('');
                                }
                            }}
                            className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                        >
                            {Object.keys(ROLE_DB_VALUES).map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                    {/* Seleção de Supervisor Geral */}
                    {showSupervisorGeralSelect && (
                        <div className="space-y-1.5 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                            <label className="text-xs font-medium text-blue-400 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">account_tree</span>
                                Supervisor Geral
                            </label>
                            <select
                                value={selectedSupervisorGeral}
                                onChange={(e) => handleSupervisorGeralChange(e.target.value)}
                                className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                            >
                                <option value="">Selecione...</option>
                                {supervisoresGerais.map(sup => (
                                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Seleção de Supervisor de Área */}
                    {showSupervisorAreaSelect && selectedSupervisorGeral && (
                        <div className="space-y-1.5 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                            <label className="text-xs font-medium text-green-400 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">person</span>
                                Supervisor de Área
                            </label>
                            <select
                                value={selectedSupervisorArea}
                                onChange={(e) => setSelectedSupervisorArea(e.target.value)}
                                className="w-full bg-black/20 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all [&>option]:bg-[#1c2127]"
                            >
                                <option value="">Selecione...</option>
                                {supervisoresArea.map(sup => (
                                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

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
                            disabled={saving || uploadingImage}
                            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-light transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
                        >
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditUserModal;
