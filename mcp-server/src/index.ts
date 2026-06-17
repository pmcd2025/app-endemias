#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";

// Configuração do Supabase (usando as mesmas credenciais do app)
const supabaseUrl = "https://kcfhpgviahnycusjlonj.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZmhwZ3ZpYWhueWN1c2psb25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzczOTAsImV4cCI6MjA4MzUxMzM5MH0.rQU_macVvfiKycuG1loYai83YO2RvCut89eGusDeGTw";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const server = new Server(
  {
    name: "app-ponto-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Listar ferramentas disponíveis
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "listar_servidores",
        description: "Lista todos os servidores cadastrados no sistema",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "buscar_servidor",
        description: "Busca um servidor por nome ou matrícula",
        inputSchema: {
          type: "object",
          properties: {
            termo: {
              type: "string",
              description: "Nome ou matrícula do servidor",
            },
          },
          required: ["termo"],
        },
      },
      {
        name: "adicionar_servidor",
        description: "Adiciona um novo servidor ao sistema",
        inputSchema: {
          type: "object",
          properties: {
            matricula: {
              type: "string",
              description: "Matrícula do servidor (única)",
            },
            nome: {
              type: "string",
              description: "Nome completo do servidor",
            },
            admissao: {
              type: "string",
              description: "Data de admissão (formato YYYY-MM-DD)",
            },
            ferias_vencidas: {
              type: "number",
              description: "Número de dias de férias vencidas",
            },
          },
          required: ["matricula", "nome", "admissao"],
        },
      },
    ],
  };
});

// Manipular chamadas de ferramentas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "listar_servidores": {
        const { data, error } = await supabase.from("servidores").select("*").order("nome");
        if (error) throw error;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "buscar_servidor": {
        const { termo } = args as { termo: string };
        const { data, error } = await supabase
          .from("servidores")
          .select("*")
          .or(`nome.ilike.%${termo}%,matricula.ilike.%${termo}%`);
        if (error) throw error;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      case "adicionar_servidor": {
        const { matricula, nome, admissao, ferias_vencidas } = args as {
          matricula: string;
          nome: string;
          admissao: string;
          ferias_vencidas?: number;
        };
        const { data, error } = await supabase.from("servidores").insert([
          {
            matricula,
            nome,
            admissao,
            ferias_vencidas: ferias_vencidas || 0,
          },
        ]).select();
        if (error) throw error;
        return {
          content: [
            {
              type: "text",
              text: "Servidor adicionado com sucesso: " + JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Erro: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Servidor MCP do app_ponto está rodando...");
}

main().catch((error) => {
  console.error("Erro no servidor:", error);
  process.exit(1);
});
