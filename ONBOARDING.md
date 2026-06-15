# Guia de uso — qa-memory

**qa-memory** é uma memória de produto para QA. Você alimenta ela com tasks do Jira, páginas do Confluence e especificações — ela devolve planos de teste focados, scores de risco e análise de impacto antes de qualquer merge.

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|------------|--------------|
| Node.js | ≥ 20 |
| pnpm | qualquer |
| uv (Python) | qualquer |
| Claude Code | qualquer |

---

## Instalação (uma vez só)

```powershell
# Windows
git clone https://github.com/JeanSantos89/QA-memory.git
cd QA-memory
pwsh -File scripts/install.ps1
```

```bash
# macOS / Linux
git clone https://github.com/JeanSantos89/QA-memory.git
cd QA-memory
./scripts/install.sh
```

O script instala tudo, inicializa o banco local em `.qa-memory/` e imprime o snippet de configuração para colar no Claude Code.

---

## Conectar ao Claude Code

Cole o snippet gerado pelo install no `.mcp.json` do seu projeto:

```json
{
  "mcpServers": {
    "qa-memory": {
      "command": "node",
      "args": ["/caminho/para/QA-memory/packages/mcp-server/dist/index.js"],
      "env": {
        "QA_MEMORY_DB": "/caminho/para/QA-memory/.qa-memory/qa-memory.db",
        "QA_MEMORY_LLM": "anthropic",
        "QA_MEMORY_LLM_MODEL": "claude-haiku-4-5-20251001"
      }
    }
  }
}
```

Reinicie o Claude Code. Se aparecer `qa-memory` na lista de MCPs, está pronto.

---

## Workflows do dia a dia

### 1 — Alimentar a memória com uma task

**Quando usar:** você acabou de refinar uma task com a PM ou leu uma spec nova.

**O que falar para o Claude:**
> *"Leia a task ONM-456 e salve as regras de produto na memória."*

ou, se já colou o conteúdo no chat:
> *"Guarda isso na memória como regras do fluxo de cancelamento."*

**O que acontece:** Claude lê a task, estrutura como behaviors + regras e persiste no banco local. Sem custo de LLM adicional se o conteúdo já estiver no contexto.

---

### 2 — Gerar plano de testes para uma task

**Quando usar:** você recebeu uma task para testar e quer um plano estruturado rapidamente.

**O que falar para o Claude:**
> *"Cria um plano de testes para a ONM-789 — considera o que foi adicionado e o que pode regredir."*

**O que você recebe:**
- **Casos novos** — o que a task adiciona/muda, happy path + edge cases
- **Regressivo** — o que a memória sinaliza que pode quebrar, ordenado por criticidade e histórico de incidentes

---

### 3 — Consultar risco de uma área

**Quando usar:** antes de aprovar um PR ou quando alguém pergunta "é seguro mexer aqui?".

**O que falar para o Claude:**
> *"Qual o risco de mexer no fluxo de pagamento do checkout?"*

**O que você recebe:** score de risco (0–1), behaviors da área, regras relevantes e incidentes registrados com data e severidade.

---

### 4 — Analisar impacto de uma mudança

**Quando usar:** a PM quer mudar uma regra de negócio e você precisa saber o que pode quebrar.

**O que falar para o Claude:**
> *"O que quebra se a gente permitir cancelamento gratuito até 5 minutos após o restaurante aceitar?"*

**O que você recebe:** o que pode quebrar, o que observar nos testes e quais regras existentes conflitam com a mudança.

---

### 5 — Registrar um incidente

**Quando usar:** encontrou um bug em produção ou em testes de regressão — especialmente em área que já deveria ser conhecida.

**O que falar para o Claude:**
> *"O badge de status do pedido não atualizou depois do cancelamento — registra isso como incidente P1."*

**O que acontece:** o score de risco daquela área sobe. Próximos planos de teste vão destacar esse ponto automaticamente.

---

### 6 — Revisar a memória (curadoria)

**Quando usar:** de tempos em tempos, para garantir que as regras inferidas pelo Claude estão corretas.

**O que falar para o Claude:**
> *"Lista as regras que ainda precisam de confirmação do QA."*

O Claude mostra a lista de regras com `confidence < 1.0`. Você confirma as corretas:
> *"Confirma a regra X como válida."*

Isso promove a regra para `qa_override = true, confidence = 1.0` — ela passa a ter peso maior nas análises.

---

## Níveis de criticidade

| Nível | Quando usar |
|-------|------------|
| **P0** | Crítico / financeiro (pagamento, dados do usuário) |
| **P1** | Fluxo principal (pedido, entrega, notificações) |
| **P2** | Funcionalidade secundária |
| **P3** | Cosmético / UX |

---

## Dúvidas frequentes

**"O Claude não encontrou nada para a área X."**
A memória só sabe o que foi alimentado. Alimente com as tasks e specs da área antes de pedir análise.

**"Quero usar sem chave de API da Anthropic."**
Configure `QA_MEMORY_LLM=ollama` com `qwen2.5:14b` rodando localmente.

**"Meus dados vão para a nuvem?"**
Não. O banco fica em `.qa-memory/` (git-ignored). Os embeddings rodam localmente. Só o LLM de extração faz chamada externa, e você controla qual usar.

**"Como conecto em outro projeto?"**
Copie o `.mcp.json` para a raiz do projeto e aponte `QA_MEMORY_DB` para o mesmo banco — a memória é compartilhada entre projetos se você quiser.

---

## Referência rápida de prompts

| O que fazer | Prompt |
|-------------|--------|
| Salvar task | `"Salva a ONM-XXX na memória"` |
| Plano de testes | `"Plano de testes para a ONM-XXX"` |
| Risco de área | `"Qual o risco de mexer em [área]?"` |
| Impacto de mudança | `"O que quebra se [mudança]?"` |
| Registrar bug | `"Registra incidente P1: [descrição]"` |
| Revisar memória | `"Lista regras pendentes de confirmação"` |
| Confirmar regra | `"Confirma a regra [X] como válida"` |
