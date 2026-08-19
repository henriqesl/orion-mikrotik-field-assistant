# ORION — MikroTik Field Assistant

O ORION simplifica a configuração, o monitoramento e o diagnóstico de enlaces MikroTik para equipes de campo.

> Configure. Monitore. Valide.

## ORION Field V6

A V6 transforma o ORION em um aplicativo Windows x64 independente e adiciona diagnóstico nativo:

- aplicativo desktop Tauri para Windows 10 e Windows 11;
- FastAPI empacotado e iniciado automaticamente;
- instalador NSIS com WebView2 offline;
- ORION Network Engine em C++ para jitter, p95, p99, picos e estabilidade;
- ping executado pelo próprio MikroTik, preservando o ponto real da medição;
- instância única: abrir o ORION novamente apenas restaura a janela existente;
- encerramento conjunto do aplicativo e do backend, sem deixar a porta local ocupada.

RSSI, ruído e SNR continuam sendo lidos do RouterOS quando o equipamento os fornece. O motor C++ não inventa nem estima métricas de rádio.

## ORION Field V5

A V5 fecha o fluxo local de campo em uma única aplicação:

- inicialização pelo `start-orion.cmd`, em `http://127.0.0.1:8765`;
- descoberta de MikroTiks na LAN por MNDP;
- abertura assistida do WinBox pelo MAC;
- seleção e memorização do executável oficial do WinBox pela própria interface;
- configuração direta de enlace e rede básica;
- configuração LoRa com watchdogs de interface, LNS e WAN;
- prévia, confirmação explícita e backup antes das alterações;
- modo demonstração para navegar sem um MikroTik disponível.

O ORION não armazena credenciais, instalações ou dados de técnicos. A aplicação continua local e sem banco de dados.

### Acesso a um equipamento sem IP

1. Conecte o computador e o MikroTik à mesma rede local.
2. Abra o ORION e aguarde o equipamento aparecer na descoberta LAN.
3. Clique em **Abrir via MAC**. Se necessário, localize o `winbox.exe` pela própria tela; o ORION memorizará o caminho.
4. Entre no equipamento pela janela oficial do WinBox.
5. Em **IP → Addresses**, defina um endereço válido na porta Ethernet e, em **IP → Services**, habilite `api`.
6. O ORION detectará o novo IP, preencherá o endereço e permitirá continuar pela API.

O acesso MAC é usado somente para a preparação inicial. A leitura e a configuração direta continuam sendo feitas pela API IP do RouterOS.

### LoRa

Na aba **LoRa**, o ORION confirma a existência de `/iot lora` antes de oferecer os watchdogs. Ele altera somente scripts e agendamentos identificados como ORION; a configuração do servidor LoRaWAN permanece intacta.

## ORION Field V4

A V4 introduziu as configurações gerais na tela **Rede básica**, com:

- WAN por DHCP Client ou IP fixo;
- bridge e endereço da LAN;
- seleção de portas LAN;
- DHCP Server automático para os dispositivos da LAN;
- pool DHCP automático ou definido manualmente;
- servidores DNS;
- NAT opcional;
- controle individual de SSH, WinBox, WebFig, Telnet e FTP;
- bloqueio preventivo de interfaces desativadas e conflitos de nomes;
- pré-visualização e confirmação explícita;
- backup automático antes da aplicação;
- preservação das regras preexistentes.

As portas LAN são alteradas por último, depois que o novo endereço de acesso já foi criado. A sessão atual ainda pode cair, e o técnico deverá reconectar pelo IP configurado para a LAN.

### Configurar uma rede básica

1. Conecte ao MikroTik e abra **Rede básica**.
2. Escolha se a WAN receberá o endereço por DHCP ou usará IP fixo.
3. Confirme a interface WAN, as portas LAN e o endereço da LAN.
4. Clique em **Revisar configuração** e confira a prévia e os alertas.
5. Digite `APLICAR`. O ORION cria um backup e envia a configuração.
6. Conecte o computador a uma porta LAN e aguarde a validação do novo acesso.

O endereço `192.168.50.1/24` é apenas uma sugestão do perfil. Ele pode ser substituído por qualquer rede válida adequada à instalação.

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
- Rust e Tauri no aplicativo desktop da V6;
- C++ no motor de métricas avançadas da V6;
- pytest para os testes do backend.

C++ não faz parte da lógica de formulários, configuração ou API. Ele permanece restrito ao processamento nativo de diagnóstico avançado.

## Executar localmente

Requisitos: Windows, Node.js, Python 3.11 ou superior e um MikroTik. Para a configuração direta, o serviço API precisa estar habilitado e o usuário do RouterOS deve ter permissão de escrita. O WinBox é opcional e necessário somente para a preparação assistida por MAC.

### Inicialização simplificada

No Windows, execute `start-orion.cmd`. O inicializador prepara as dependências quando necessário, compila a interface, inicia todo o ORION em `http://127.0.0.1:8765` e abre o navegador automaticamente.

Para escolher outra porta:

```powershell
.\scripts\start-orion.ps1 -Port 8877
```

O terminal deve permanecer aberto durante o uso. Fechá-lo encerra o ORION.

Na tela inicial, o ORION escuta os anúncios MNDP da rede local e lista os MikroTiks encontrados. Equipamentos com IP podem preencher a conexão diretamente. Para equipamentos em `0.0.0.0`, use **Abrir via MAC** e, se solicitado, selecione o executável oficial do WinBox. O caminho fica memorizado localmente; nenhum arquivo de configuração precisa ser copiado ou importado.

### Desenvolvimento

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

### Aplicativo desktop (V6)

Para desenvolver ou gerar o aplicativo Windows, instale também o Rust e a carga de trabalho **Desenvolvimento para desktop com C++** do Visual Studio Build Tools 2022.

```powershell
cd frontend
npm run desktop:dev
```

O comando prepara o backend empacotado e abre o ORION como aplicativo Tauri. Para gerar o instalador x64:

```powershell
npm run desktop:build
```

O instalador é criado em `frontend/src-tauri/target/release/bundle/nsis`. Depois de instalado, o usuário final não precisa instalar Node.js, Python, Rust ou Visual Studio. O backend inicia e encerra junto com o aplicativo e atende somente em `127.0.0.1:8765`.

Para o pacote interno assinado, instale o certificado BIONIC com chave privada no repositório pessoal da conta de build e execute:

```powershell
npm run desktop:build:signed
```

O comando localiza o certificado por assunto, assina os binários próprios e gera o NSIS com SHA-256 e timestamp. A chave privada nunca deve ser exportada para a pasta de entrega. Nos computadores da empresa, distribua apenas o certificado público `.cer` e instale-o em **Autoridades de Certificação Raiz Confiáveis** e **Editores Confiáveis** antes do ORION.

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

O arquivo `mikrotik-generator.html` continua sendo o ORION Setup offline. Ele gera scripts `.rsc` para Enlace, Rede básica e LoRa sem depender do backend.

## Limites conhecidos

- o instalador interno possui assinatura privada BIONIC; computadores que ainda não confiam no certificado podem exibir um aviso do Windows;
- a instalação foi validada no Windows 11 x64; ainda falta uma execução física em um Windows 10 x64 limpo;
- o acesso por MAC prepara o equipamento, mas a operação direta do ORION ainda acontece pela API IPv4;
- não há reset nem restauração automática do backup;
- o ORION não apaga IPs antigos automaticamente, para preservar uma rota de recuperação;
- frequências permitidas dependem do modelo, da regulamentação e do RouterOS;
- histórico e métricas da sessão existem somente enquanto a conexão atual estiver aberta;
- a proteção LoRa exige RouterOS 7, pacote IoT e uma interface compatível em `/iot lora`;
- a configuração LoRa ainda precisa de validação física no equipamento de destino;
- o seletor do WinBox e a detecção do novo IP ainda precisam de validação física com um MikroTik sem IP;
- os testes automatizados usam clientes RouterOS simulados; a validação física continua obrigatória antes da entrega operacional.

## Identidade visual

O sistema de marca, cores, tipografia e uso dos ativos está documentado em [Identidade visual do ORION](docs/brand/visual-identity.md).
