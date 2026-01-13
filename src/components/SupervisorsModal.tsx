import React, { useState } from 'react';

interface Supervisor {
    id: number;
    name: string;
    role: string;
    avatar: string;
    status: 'online' | 'offline' | 'busy';
}

interface Technician {
    id: number;
    name: string;
    role: string;
    avatar: string;
    status: 'online' | 'offline' | 'busy';
}

const supervisors: Supervisor[] = [
    { id: 1, name: 'Ana Souza', role: 'Gerente Regional', avatar: 'https://i.pravatar.cc/150?u=1', status: 'online' },
    { id: 2, name: 'Carlos Antonio', role: 'Supervisor Geral', avatar: 'https://i.pravatar.cc/150?u=2', status: 'busy' },
    { id: 3, name: 'Marcos Oliveira', role: 'Coord. de Ponto', avatar: 'https://i.pravatar.cc/150?u=3', status: 'offline' },
    { id: 4, name: 'Fernanda Lima', role: 'Coord. de RH', avatar: 'https://i.pravatar.cc/150?u=4', status: 'online' },
];

const techniciansData: Record<number, Technician[]> = {
    1: [
        { id: 101, name: 'João Silva', role: 'Técnico de Endemias', avatar: 'https://i.pravatar.cc/150?u=101', status: 'online' },
        { id: 102, name: 'Maria Costa', role: 'Técnico de Endemias', avatar: 'https://i.pravatar.cc/150?u=102', status: 'busy' },
        { id: 103, name: 'Pedro Santos', role: 'Técnico de Endemias', avatar: 'https://i.pravatar.cc/150?u=103', status: 'offline' },
    ],
    2: [
        { id: 201, name: 'Julia Rocha', role: 'Técnico de Endemias', avatar: 'https://i.pravatar.cc/150?u=201', status: 'online' },
        { id: 202, name: 'Lucas Mendes', role: 'Técnico de Endemias', avatar: 'https://i.pravatar.cc/150?u=202', status: 'online' },
    ],
    3: [
        { id: 301, name: 'Bruno Alves', role: 'Técnico de Endemias', avatar: 'https://i.pravatar.cc/150?u=301', status: 'offline' },
    ],
    4: [],
};

interface SupervisorsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SupervisorsModal: React.FC<SupervisorsModalProps> = ({ isOpen, onClose }) => {
    const [selectedSupervisor, setSelectedSupervisor] = useState<Supervisor | null>(null);

    // Reset selection when modal closes
    React.useEffect(() => {
        if (!isOpen) {
            setSelectedSupervisor(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleClose = () => {
        setSelectedSupervisor(null);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={handleClose}>
            <div
                className="bg-[#1c2127] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        {selectedSupervisor && (
                            <button
                                onClick={() => setSelectedSupervisor(null)}
                                className="mr-2 text-gray-400 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-xl">arrow_back</span>
                            </button>
                        )}
                        <h2 className="text-lg font-bold text-white">
                            {selectedSupervisor ? selectedSupervisor.name : 'Supervisores'}
                        </h2>
                    </div>
                    <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-4 flex flex-col gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {selectedSupervisor ? (
                        <>
                            {techniciansData[selectedSupervisor.id]?.length > 0 ? (
                                techniciansData[selectedSupervisor.id].map((tech) => (
                                    <div key={tech.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                                        <div className="relative">
                                            <img src={tech.avatar} alt={tech.name} className="size-10 rounded-full object-cover" />
                                            <span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#1c2127] ${tech.status === 'online' ? 'bg-green-500' :
                                                    tech.status === 'busy' ? 'bg-red-500' : 'bg-gray-500'
                                                }`} />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors">{tech.name}</h3>
                                            <p className="text-xs text-slate-400">{tech.role}</p>
                                        </div>
                                        <button className="size-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-primary hover:text-white transition-colors">
                                            <span className="material-symbols-outlined text-lg">chat</span>
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <p>Nenhum técnico encontrado para esta equipe.</p>
                                </div>
                            )}
                        </>
                    ) : (
                        supervisors.map((supervisor) => (
                            <div
                                key={supervisor.id}
                                onClick={() => setSelectedSupervisor(supervisor)}
                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                            >
                                <div className="relative">
                                    <img src={supervisor.avatar} alt={supervisor.name} className="size-10 rounded-full object-cover" />
                                    <span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#1c2127] ${supervisor.status === 'online' ? 'bg-green-500' :
                                            supervisor.status === 'busy' ? 'bg-red-500' : 'bg-gray-500'
                                        }`} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors">{supervisor.name}</h3>
                                    <p className="text-xs text-slate-400">{supervisor.role}</p>
                                </div>
                                <button className="size-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-primary hover:text-white transition-colors">
                                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-gray-800 bg-[#151a20]">
                    <button onClick={handleClose} className="w-full py-2.5 rounded-xl bg-gray-800 text-white font-medium hover:bg-gray-700 transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SupervisorsModal;
