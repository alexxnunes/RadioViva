# Especificação Arquitetural — RadioViva

## 1. Visão Geral
**RadioViva** (`radioviva@alexander`) é um Cinnamon Applet para Linux Mint com foco exclusivo nas rádios de todo o Brasil, contendo mais de 1.600 emissoras catalogadas por regiões, estados e gêneros.

## 2. Stack de Linguagens e Componentes
- **JavaScript (GJS)**: Linguagem oficial e nativa de extensões e applets do Cinnamon (`imports.ui.applet`, `imports.gi.St`, `imports.gi.Clutter`). Responsável por toda a interface gráfica do painel, menus e janelas.
- **MPV (C / Daemon de Áudio)**: Executado em modo background daemon (`--idle=yes --no-video --input-ipc-server=/run/user/$UID/radioviva.sock`), controlado assincronamente pelo applet via IPC JSON.
- **Python 3**: Utilitários de catalogação, validação e teste de integridade dos streams de áudio.
- **CSS3**: Estilos customizados para o painel, player card e badges regionais.

## 3. Estrutura de Diretórios
- `src/`: Código-fonte do applet Cinnamon.
  - `metadata.json`: Definição e metadados do applet.
  - `applet.js`: Ponto de entrada do applet.
  - `stylesheet.css`: Estilização visual.
  - `settings-schema.json`: Janela de configurações do Cinnamon.
  - `core/`: Módulos de player, gravação, timer e catálogo.
  - `data/`: Base de dados das 1.600+ rádios do Brasil em JSON.
- `scripts/`: Scripts de instalação, desinstalação e atualização do catálogo.
- `tests/`: Testes automatizados de streams e comandos IPC.
