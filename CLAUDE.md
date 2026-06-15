# Workspace — qa-memory conectado

qa-memory MCP está disponível neste workspace. Dois padrões automáticos abaixo.
Seguir sem precisar ser pedido — detectar pela mensagem do usuário.

---

## Padrão 1 — Alimentar memória com Jira / Confluence / texto

**Gatilho:** usuário cola conteúdo de uma task, página ou spec E menciona salvar, memorizar,
alimentar, "jogar na memória", "guarda isso", ou similar.

**Fluxo (zero LLM extra):**
1. Ler o conteúdo já presente na mensagem (não buscar externamente se já está aqui).
2. Se precisar buscar no Jira/Confluence: usar as tools MCP do Atlassian para trazer o conteúdo.
3. Estruturar o conhecimento extraído como behaviors + rules.
4. Chamar `feed_to_memory` com o JSON estruturado.
   - NUNCA usar `add_to_memory` neste fluxo — ele chama LLM interno (caro).
   - `feed_to_memory` = zero LLM extra, só escrita no DB + embedding local.
5. Confirmar o que foi persistido (N behaviors, N rules).

**Como estruturar:**
- Behavior = uma funcionalidade/área do produto (ex: "Cancelamento de pedido").
- Regra = uma restrição, condição ou comportamento esperado (ex: "Cancelamento gratuito até 5min após aceite").
- Criticality: P0 = crítico/financeiro, P1 = fluxo principal, P2 = secundário, P3 = cosmético.
- Confidence: 0.7 para inferência segura, 1.0 + qa_override=true para regra confirmada pelo QA.
- source.type: "jira" | "confluence" | "conversation". source.label: chave da task (ex: "ONM-123").

---

## Padrão 2 — Plano de testes para uma task

**Gatilho:** usuário cola ou menciona uma task Jira E pede plano de testes, casos de teste,
o que testar, estratégia de testes, ou similar.

**Fluxo:**
1. Identificar as áreas/funcionalidades que a task toca.
2. Para cada área relevante: chamar `query_risk` → obtém risk score + behaviors + regras existentes.
3. Se a task descreve uma mudança de comportamento: chamar `analyze_impact` com a mudança em texto.
4. Gerar o plano de testes em duas seções:
   - **Funcionalidades novas** — o que a task adiciona/muda, casos felizes + edge cases.
   - **Regressivo** — behaviors e regras que `query_risk`/`analyze_impact` sinalizaram como impactados;
     focar nos de maior criticality e nos que já tiveram incidentes (⚠ broke:).

**Formato do plano:**
- Seção "Novos": casos de teste do que foi pedido.
- Seção "Regressivo": o que pode quebrar baseado na memória, por área (criticality primeiro).
- Incluir a razão do risco para cada item regressivo (vem dos reasons[] do query_risk).

---

## Regras gerais

- NUNCA chamar `add_to_memory` quando `feed_to_memory` resolve (o conteúdo já está em contexto).
- `add_to_memory` só quando a fonte é uma URL pública ou arquivo local que Claude não consegue ler.
- Não spawnar subagentes para estes fluxos — Claude faz inline.
- Uma chamada MCP por área no query_risk (não uma por regra).
