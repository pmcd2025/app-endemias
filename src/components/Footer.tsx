import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer className="w-full py-4 px-6 bg-surface-dark/95 backdrop-blur-lg border-t border-border-dark/50 text-center text-text-secondary text-xs">
            <div className="max-w-7xl mx-auto space-y-1">
                <p>
                    <span className="font-semibold text-white/90">Versão 2.0.0</span>
                    <span className="mx-2 text-border-light">|</span>
                    <span>Desenvolvedor: <span className="text-primary font-medium">Elissandro Oliveira</span></span>
                </p>
                <p className="text-text-tertiary">
                    © {new Date().getFullYear()} Todos os direitos reservados - Divisão Endemias - Itabuna
                </p>
            </div>
        </footer>
    );
};

export default Footer;
