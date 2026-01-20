export const ROLE_LABELS: Record<string, string> = {
    'super_admin': 'Administrador',
    'gestor': 'Gestor',
    'supervisor_geral': 'Supervisor Geral',
    'supervisor_area': 'Supervisor de Área',
    'servidor': 'Servidor'
};

export const ROLE_DB_VALUES: Record<string, string> = {
    'Administrador': 'super_admin',
    'Gestor': 'gestor',
    'Supervisor Geral': 'supervisor_geral',
    'Supervisor de Área': 'supervisor_area',
    'Servidor': 'servidor'
};

// Papéis que podem ser selecionados ao cadastrar novos usuários
export const ASSIGNABLE_ROLES = ['Gestor', 'Supervisor Geral', 'Supervisor de Área', 'Servidor'];
