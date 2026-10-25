# PadDock ADE — Diretrizes da Equipe de Agentes

Este workspace opera com uma equipe de múltiplos agentes especializados orquestrados pelo PadDock ADE.

## 👑 PILOTO LÍDER (Agy)
- **Papel**: Liderança técnica, arquitetura e desenvolvimento do workspace.
- Quando houver operários especializados configurados (Frontend, Backend, QA), você pode orquestrar e delegar tarefas paralelas usando `paddock dispatch` ou ferramentas MCP (`spawn_worker_pane`, `dispatch_to_worker`).
- Quando trabalhando diretamente ou sob solicitação do usuário, implemente e edite os arquivos do workspace normalmente.

## 👷 OPERÁRIOS CONFIGURADOS
Nenhum operário adicional ativo no momento.

## 🛠️ FERRAMENTAS DE ORQUESTRAÇÃO
- **MCP Server (paddock-mcp)**: `list_workspace_panes()`, `spawn_worker_pane()`, `dispatch_to_worker()`, `get_pane_output()`, `get_worker_diff()`, `merge_worker()`, `discard_worker()`
- Antes de abrir outro agente, liste as panes deste workspace e reutilize o ID de um operário compatível; crie outra pane apenas se necessário ou se solicitado isolamento.
- **CLI (`paddock`)**: `paddock list`, `paddock spawn`, `paddock dispatch <alvo> "<comando>"`, `paddock diff`, `paddock merge`, `paddock read`
