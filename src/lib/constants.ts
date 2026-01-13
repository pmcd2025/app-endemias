export const ROLE_LABELS: Record<string, string> = {
    'super_admin': 'Administrador',
    'supervisor_geral': 'Supervisor Geral',
    'supervisor_area': 'Supervisor de Área',
    'servidor': 'Servidor'
};

export const ROLE_DB_VALUES: Record<string, string> = {
    'Administrador': 'super_admin',
    'Supervisor Geral': 'supervisor_geral',
    'Supervisor de Área': 'supervisor_area',
    'Servidor': 'servidor'
};

// Papéis que podem ser selecionados ao cadastrar novos usuários
export const ASSIGNABLE_ROLES = ['Supervisor Geral', 'Supervisor de Área', 'Servidor'];
