# 📋 Sistema de Ponto Semanal - PMCD Itabuna

Sistema web para gerenciamento de ponto semanal dos servidores da Vigilância em Saúde, desenvolvido com React, TypeScript e Supabase.

![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite&logoColor=white)

## ✨ Funcionalidades

### 📊 Dashboard
- Visão geral dos servidores ativos
- Monitoramento de faltas e atestados por semana epidemiológica
- Cards interativos com detalhamento em modais
- Indicadores de servidores em férias, afastados e inativos

### 👥 Gestão de Usuários
- Cadastro de usuários com diferentes níveis de acesso
- Upload de foto de perfil com armazenamento no Supabase Storage
- Hierarquia de roles:
  - **Administrador** - Acesso total ao sistema
  - **Supervisor Geral** - Gerencia todos os supervisores de área
  - **Supervisor de Área** - Gerencia servidores da sua área
  - **Servidor** - Visualização limitada
- Edição e exclusão de usuários com validações

### 👷 Gestão de Servidores
- Cadastro completo de servidores (Téc. Endemias, Supervisores)
- Tipos de vínculo: Efetivo ou Contrato
- Status: Ativo, Férias, Afastado, Inativo
- Vinculação hierárquica com supervisores de área
- Filtros avançados por supervisor, status e tipo de servidor

### ⏰ Registro de Ponto
- Registro organizado por semana epidemiológica
- **Visualização hierárquica colapsável** por Supervisor Geral → Supervisor de Área → Servidores
- Status diário configuráveis:
  - ✅ Normal
  - ❌ Falta Justificada / Sem Justificativa
  - 🏖️ Férias
  - 🎉 Folga de Aniversário
  - 🏛️ Feriado / Facultativo
- Controle de dias trabalhados automático
- Campo de produção semanal por servidor
- **Campo de observações** (até 800 caracteres)
- **Indicadores visuais de status**:
  - 🔵 Botão "Registrar" (sem registro)
  - 🟡 Badge "✓ Registrado" + Botão "Editar" (salvo)
  - 🟢 Badge "✓ Enviado" + Botão "Ver" (enviado)
- **Envio semanal** pelo Supervisor de Área com validações
- **Botão "Limpar Semana"** para correção de erros:
  - Admin: apaga todos os dados da semana
  - Supervisores: apaga apenas dados da sua equipe
- **Monitoramento de pendências** (Admin/Supervisor Geral):
  - Alerta de servidores sem envio por hierarquia

### 📈 Relatórios
- Relatórios por período e semana epidemiológica
- Filtros por supervisor e status de submissão
- **Visualização de observações** nos detalhes expandidos
- Exportação individual e em lote:
  - **PDF** - Relatório formatado para impressão
  - **Excel** - Planilha detalhada com dados completos
- Visualização de frequência e produção
- Edição e exclusão de registros

### 📊 Monitoramento de Envios (Admin)
- **Exclusivo para Administradores** - Acesso restrito ao Admin geral
- Visualização hierárquica de supervisores e status de envio
- **Seletor multi-semana** - Selecione uma ou várias semanas para análise
- **Painel de estatísticas**:
  - Total de servidores
  - Quantidade de enviados vs pendentes
  - Taxa de conclusão geral
- **Indicadores visuais por status**:
  - 🟢 Completo (100% enviados)
  - 🟡 Parcial (< 100% enviados)
  - 🔴 Pendente (0% enviados)
- **Filtros rápidos**: Todos, Pendentes, Completos
- Expansão de hierarquia para ver detalhes por servidor

### 🔐 Autenticação
- Login seguro com Supabase Auth
- Controle de sessão persistente
- Modal de perfil do usuário logado

## 🛠️ Tecnologias

| Categoria | Tecnologia | Versão |
|-----------|------------|--------|
| **Frontend** | React | 19.2.3 |
| **Linguagem** | TypeScript | 5.8.2 |
| **Estilização** | Tailwind CSS | 4.1.18 |
| **Build Tool** | Vite | 6.2.0 |
| **Roteamento** | React Router DOM | 7.12.0 |
| **Backend** | Supabase | 2.90.1 |
| **PDF** | jsPDF + AutoTable | 4.0.0 / 5.0.7 |
| **Excel** | SheetJS (xlsx) | 0.18.5 |

## 📁 Estrutura do Projeto

```
app_ponto/
├── public/                  # Arquivos estáticos
├── src/
│   ├── components/          # Componentes reutilizáveis
│   │   ├── AddUserModal.tsx    # Modal para adicionar usuário
│   │   ├── EditUserModal.tsx   # Modal para editar usuário
│   │   ├── EditServerModal.tsx # Modal para editar servidor
│   │   ├── Layout.tsx          # Layout principal com sidebar
│   │   ├── ProfileModal.tsx    # Modal de perfil do usuário
│   │   └── SupervisorsModal.tsx # Modal de supervisores e técnicos
│   ├── contexts/            # Contextos React
│   │   └── AuthContext.tsx     # Gerenciamento de autenticação
│   ├── lib/                 # Utilitários e configurações
│   │   ├── supabase.ts         # Cliente Supabase configurado
│   │   ├── database.types.ts   # Tipos TypeScript do banco
│   │   └── constants.ts        # Constantes da aplicação
│   ├── pages/               # Páginas da aplicação
│   │   ├── Dashboard.tsx       # Painel principal com estatísticas
│   │   ├── Login.tsx           # Tela de autenticação
│   │   ├── Users.tsx           # Gestão de usuários
│   │   ├── Servers.tsx         # Gestão de servidores
│   │   ├── Ponto.tsx           # Registro de ponto semanal
│   │   ├── Reports.tsx         # Relatórios e exportações
│   │   └── SubmissionMonitoring.tsx # Monitoramento de envios (Admin)
│   ├── App.tsx              # Componente principal e rotas
│   ├── index.tsx            # Entrada da aplicação
│   └── index.css            # Estilos globais Tailwind
├── .env.example             # Exemplo de variáveis de ambiente
├── index.html               # HTML principal
├── package.json             # Dependências e scripts
├── tsconfig.json            # Configuração TypeScript
├── vite.config.ts           # Configuração Vite
└── vercel.json              # Configuração de deploy Vercel
```

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Conta no [Supabase](https://supabase.com) (para backend)

### Instalação

1. **Clone o repositório:**
```bash
git clone <url-do-repositorio>
cd app_ponto
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Configure as variáveis de ambiente:**

Copie o arquivo de exemplo e preencha com suas credenciais:
```bash
cp .env.example .env.local
```

Edite `.env.local`:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon_publica
```

4. **Execute em modo desenvolvimento:**
```bash
npm run dev
```

5. **Acesse no navegador:**
```
http://localhost:5173
```

### Build para Produção

```bash
# Gerar build otimizado
npm run build

# Visualizar build localmente
npm run preview
```

## 🔐 Configuração do Supabase

### Tabelas Necessárias

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários do sistema com roles e hierarquia |
| `servers` | Servidores cadastrados (técnicos, supervisores) |
| `time_entries` | Registros de ponto diário |
| `absences` | Faltas e atestados |
| `weekly_submissions` | Controle de envios semanais |

### Storage Buckets

| Bucket | Visibilidade | Uso |
|--------|--------------|-----|
| `avatars` | Público | Fotos de perfil dos usuários |
| `documents` | Privado | Documentos anexados (atestados, etc.) |

### Edge Functions

| Função | Descrição |
|--------|-----------|
| `create-user` | Criação de usuários com autenticação automática |

## 📱 Responsividade

O sistema foi desenvolvido com abordagem **mobile-first**, garantindo excelente experiência em:
- 📱 Smartphones
- 📲 Tablets
- 💻 Desktops

## 👨‍💻 Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia servidor de desenvolvimento com hot reload |
| `npm run build` | Gera build otimizado para produção |
| `npm run preview` | Visualiza o build de produção localmente |

## 🌐 Deploy

O projeto está configurado para deploy na **Vercel**. O arquivo `vercel.json` contém as configurações necessárias para:
- Rewrite de rotas SPA
- Headers de cache otimizados

## 📄 Licença

Projeto desenvolvido para a **Prefeitura Municipal de Itabuna** - Vigilância em Saúde.

---

<div align="center">
  <strong>🏥 Vigilância em Saúde - PMCD Itabuna</strong>
  <br>
  <sub>Desenvolvido com ❤️ para a saúde pública</sub>
</div>
