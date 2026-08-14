# ORION — MikroTik Field Assistant

O ORION simplifica a configuração, o monitoramento e o diagnóstico de enlaces MikroTik para equipes de campo.

> Configure. Monitore. Valide.

## ORION Field V4 — em desenvolvimento

A V4 amplia o ORION para configurações gerais de rede. O primeiro perfil disponível é **Rede básica**, com:

- WAN por DHCP Client ou IP fixo;
- bridge e endereço da LAN;
- seleção de portas LAN;
- servidores DNS;
- NAT opcional;
- pré-visualização e confirmação explícita;
- backup automático antes da aplicação;
- preservação das regras preexistentes.

As portas LAN são alteradas por último, depois que o novo endereço de acesso já foi criado. A sessão atual ainda pode cair, e o técnico deverá reconectar pelo IP configurado para a LAN.

## ORION Field V3

A V3 conecta diretamente à API do RouterOS e oferece:

- configuração assistida de rádio como AP ou Station;
- identidade, SSID, senha WPA2, frequência, largura de canal, bridge, IP e gateway;
- suporte às pilhas `wifi`, `wifiwave2` e `wireless`;
- pré-visualização das alterações e confirmação explícita antes da escrita;
- backup binário automático antes da primeira alteração;
- preservação dos endereços IP preexistentes e tentativa de reconexão no novo IP;
- leitura de interfaces, registration table, sinal, taxas TX/RX e associação;
- monitoramento, alinhamento, ping, saúde ponderada e diagnóstico estrutural;
- alinhamento avançado com gráfico, melhor, média e pior sinal da sessão;
- som opcional que varia conforme o sinal;
- identidade visual própria, fontes locais e interface preparada para uso offline.

Não existe banco de dados. As credenciais e a senha do enlace permanecem somente na memória durante a conexão e não são devolvidas pelas respostas da API.

## Tecnologias

- React 19 e Vite no frontend;
- FastAPI no backend;
- `routeros-py` para a API binária do RouterOS;
- pytest para os testes do backend.

C++ não faz parte da V3. Ele só deverá ser considerado futuramente se houver uma necessidade concreta de desempenho, sockets ou diagnóstico avançado.

## Executar localmente

Requisitos: Node.js, Python 3.11 ou superior e um MikroTik com o serviço API habilitado. Para configurar, o usuário do RouterOS também precisa de permissão de escrita.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

O backend fica em `http://127.0.0.1:8000`.

### Frontend

Em outro terminal:

```powershell
cd frontend
npm ci
npm run dev
```

O frontend fica em `http://localhost:5174`. A porta é fixa; se estiver ocupada, o Vite exibirá um erro claro.

### Demonstração sem MikroTik

Informe `teste`, `demo` ou `192.0.2.1` no campo de endereço para navegar pelo ORION com um equipamento simulado. O modo fica identificado em toda a interface, funciona localmente mesmo sem o backend e nunca aplica configurações.

## Fluxo de configuração

O procedimento para preparar dois rádios está no [Manual de campo da V2](docs/manual-de-campo-v2.md).

1. Conecte o computador ao MikroTik por Ethernet.
2. Acesse o equipamento com um usuário RouterOS que possua leitura e escrita.
3. Preencha o cartão **Configurar enlace** como AP ou Station.
4. Clique em **Revisar alterações** e confira todos os itens e alertas.
5. Digite `APLICAR` e confirme. O ORION cria o backup antes de escrever.
6. Confirme a reconexão e execute os testes de alinhamento e conectividade.

Configure primeiro o AP e depois a Station com o mesmo SSID, senha, frequência e largura. `station-bridge` requer AP MikroTik e a mesma família de driver nos dois lados (`wifi` com `wifi`, ou `wireless` com `wireless`).

## Testes e build

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

```powershell
cd frontend
npm run build
npm audit --audit-level=high
```

## Modo offline

O arquivo `mikrotik-generator.html` continua sendo o ORION Setup offline. Ele gera scripts `.rsc` para Enlace, Rede básica e Gateway LoRa sem depender do backend.

## Limites conhecidos

- a primeira conexão ainda exige IPv4 e a API do RouterOS previamente habilitada;
- não há descoberta ou configuração por MAC, reset ou restauração automática do backup;
- o ORION não apaga IPs antigos automaticamente, para preservar uma rota de recuperação;
- frequências permitidas dependem do modelo, da regulamentação e do RouterOS;
- histórico e métricas da sessão existem somente enquanto a conexão atual estiver aberta;
- os testes automatizados usam clientes RouterOS simulados; a validação física continua obrigatória antes da entrega operacional.

## Identidade visual

O sistema de marca, cores, tipografia e uso dos ativos está documentado em [Identidade visual do ORION](docs/brand/visual-identity.md).
