# 📋 Sistema de Ponto Semanal - PMCD Itabuna

Sistema web para gerenciamento de ponto semanal dos servidores da Vigilância em Saúde, desenvolvido com React, TypeScript e Supabase.

## ✨ Funcionalidades

### 📊 Dashboard
- Visão geral dos servidores ativos
- Monitoramento de faltas e atestados
- Estatísticas por semana epidemiológica
- Cards interativos com detalhamento

### 👥 Gestão de Usuários
- Cadastro de usuários com diferentes níveis de acesso
- Upload de foto de perfil
- Hierarquia: Administrador > Supervisor Geral > Supervisor de Área > Servidor
- Edição e exclusão de usuários

### 👷 Gestão de Servidores
- Cadastro completo de servidores (Téc. Endemias, Supervisores)
- Vínculo (Efetivo/Contrato) e status (Ativo, Férias, Afastado)
- Vinculação hierárquica com supervisores
- Filtros por supervisor e status

### ⏰ Registro de Ponto
- Registro por semana epidemiológica
- Status diário: Normal, Falta, Férias, Folga, Atestado, etc.
- Controle de dias trabalhados
- Envio semanal de registros pelo Supervisor de Área

### 📈 Relatórios
- Relatórios por período
- Exportação de dados
- Análises de produtividade

## 🛠️ Tecnologias

- **Frontend:** React 19, TypeScript, TailwindCSS 4
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Build:** Vite
- **Roteamento:** React Router DOM 7

## 📁 Estrutura do Projeto

```
src/
├── components/           # Componentes reutilizáveis
│   ├── AddUserModal.tsx     # Modal de adicionar usuário
│   ├── EditUserModal.tsx    # Modal de editar usuário
│   ├── EditServerModal.tsx  # Modal de editar servidor
│   ├── Layout.tsx           # Layout principal
│   └── SupervisorsModal.tsx # Modal de supervisores
├── contexts/             # Contextos React
│   └── AuthContext.tsx      # Gerenciamento de autenticação
├── lib/                  # Utilitários e configurações
│   ├── supabase.ts          # Cliente Supabase
│   ├── database.types.ts    # Tipos TypeScript do banco
│   └── constants.ts         # Constantes da aplicação
├── pages/                # Páginas da aplicação
│   ├── Dashboard.tsx        # Painel principal
│   ├── Login.tsx            # Tela de login
│   ├── Users.tsx            # Gestão de usuários
│   ├── Servers.tsx          # Gestão de servidores
│   ├── Ponto.tsx            # Registro de ponto
│   └── Reports.tsx          # Relatórios
├── App.tsx               # Componente principal e rotas
├── index.tsx             # Entrada da aplicação
└── index.css             # Estilos globais
```

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+
- Conta no Supabase (para backend)

### Instalação

1. Clone o repositório:
```bash
git clone <url-do-repositorio>
cd app_ponto
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente em `.env.local`:
```env
VITE_SUPABASE_URL=sua_url_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anon
```

4. Execute em modo desenvolvimento:
```bash
npm run dev
```

5. Acesse em `http://localhost:5173`

### Build para Produção

```bash
npm run build
npm run preview
```

## 🔐 Configuração do Supabase

### Tabelas Necessárias
- `users` - Usuários do sistema
- `servers` - Servidores cadastrados
- `time_entries` - Registros de ponto
- `absences` - Faltas e atestados

### Storage Buckets
- `avatars` - Fotos de perfil (público)
- `documents` - Documentos anexados (privado)

### Edge Functions
- `create-user` - Criação de usuários com autenticação

## 📱 Responsividade

O sistema foi desenvolvido com foco em dispositivos móveis (mobile-first), mas funciona perfeitamente em tablets e desktops.

## 👨‍💻 Desenvolvimento

### Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia servidor de desenvolvimento |
| `npm run build` | Gera build de produção |
| `npm run preview` | Visualiza build de produção |

## 📄 Licença

Projeto desenvolvido para a Prefeitura Municipal de Itabuna - Vigilância em Saúde.

---

<div align="center">
  <strong>🏥 Vigilância em Saúde - PMCD Itabuna</strong>
</div>
