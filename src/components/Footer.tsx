import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer className="w-full py-4 px-6 bg-[#1c2127] border-t border-gray-800 text-center text-gray-400 text-xs">
            <div className="max-w-7xl mx-auto space-y-1">
                <p>
                    <span className="font-semibold text-gray-300">Versão 2.0.0</span>
                    <span className="mx-2">|</span>
                    <span>Desenvolvedor: <span className="text-primary">Elissandro Oliveira</span></span>
                </p>
                <p>
                    © {new Date().getFullYear()} Todos os direitos reservados - Divisão Endemias - Itabuna
                </p>
            </div>
        </footer>
    );
};

export default Footer;
