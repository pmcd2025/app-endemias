import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { userProfile, user } = useAuth();
    const [uploadingImage, setUploadingImage] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Update avatar preview when userProfile changes
    useEffect(() => {
        if (userProfile?.avatar_url) {
            setAvatarPreview(userProfile.avatar_url);
        }
    }, [userProfile]);

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
            const fileExt = file.name.split('.').pop();
            const fileName = `avatar_${user.id}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload para Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) {
                console.error('Erro no upload:', uploadError);
                alert('Erro ao fazer upload da imagem. Verifique se o bucket "avatars" existe.');
                return;
            }

            // Obter URL pública
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setAvatarPreview(publicUrl);

            // Atualizar perfil do usuário
            const { error: updateError } = await (supabase.from('users') as any)
                .update({ avatar_url: publicUrl })
                .eq('id', userProfile?.id);

            if (updateError) {
                console.error('Erro ao atualizar perfil:', updateError);
                alert('Erro ao salvar a URL da imagem no perfil.');
            }

        } catch (err) {
            console.error('Erro inesperado:', err);
            alert('Ocorreu um erro inesperado ao fazer upload da imagem.');
        } finally {
            setUploadingImage(false);
        }
    };

    const getAvatarUrl = () => {
        if (avatarPreview) return avatarPreview;
        if (userProfile?.name) return `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.name)}&background=3b82f6&color=fff&size=150`;
        return 'https://ui-avatars.com/api/?name=User&background=3b82f6&color=fff&size=150';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-[#1c2127] border border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <h2 className="text-lg font-bold text-white">Meu Perfil</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 flex flex-col items-center gap-4">
                    {/* Avatar Upload */}
                    <div className="relative cursor-pointer group" onClick={handleImageClick}>
                        <div
                            className="size-32 rounded-full bg-cover bg-center ring-4 ring-gray-700 group-hover:ring-primary active:ring-primary transition-all shadow-xl"
                            style={{ backgroundImage: `url('${getAvatarUrl()}')` }}
                        />
                        {/* Ícone de câmera - sempre visível no mobile, hover no desktop */}
                        <div className="absolute bottom-0 right-0 size-10 rounded-full bg-primary flex items-center justify-center shadow-lg border-2 border-[#1c2127] hover:bg-primary/80 active:scale-95 transition-all">
                            {uploadingImage ? (
                                <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <span className="material-symbols-outlined text-white text-xl">photo_camera</span>
                            )}
                        </div>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="user"
                        onChange={handleImageChange}
                        className="hidden"
                    />

                    <div className="text-center space-y-1">
                        <h3 className="text-xl font-bold text-white">{userProfile?.name}</h3>
                        <p className="text-sm text-gray-400">{userProfile?.role}</p>
                        <p className="text-xs text-gray-500">{userProfile?.email}</p>
                    </div>

                    {/* Botão Alterar Foto - visível no mobile */}
                    <button
                        onClick={handleImageClick}
                        disabled={uploadingImage}
                        className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-gray-700 rounded-xl text-sm font-medium text-gray-300 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-lg">edit</span>
                        {uploadingImage ? 'Enviando...' : 'Alterar Foto'}
                    </button>

                    <p className="text-[10px] text-center text-gray-600">
                        Formatos: .jpg, .png (Máx 2MB)
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;
