# ORION Field V7.2 — validação de bancada

Este fluxo complementa os testes unitários com duas camadas:

1. routers RouterOS stateful simulados, que mantêm as alterações entre leitura, prévia e aplicação;
2. equipamentos MikroTik reais de laboratório, conectados pela mesma API usada pelo ORION.

Nunca habilite gravações em equipamento de cliente ou produção.

## O que os routers simulados cobrem

- RouterBOARD genérica com IP fixo e rota padrão pela interface Wi-Fi;
- router de cinco portas com WAN DHCP, bridge LAN, NAT, DHCP Server e pool personalizado;
- rádio reconhecido com AP/Station, `station-bridge`, bridge e IP de gerenciamento;
- gateway LoRa com scripts e agendamentos ligados e desligados;
- várias portas Ethernet na mesma bridge;
- serviços SSH, WinBox, HTTPS, Telnet, FTP e HTTP alternados e relidos;
- interface removida entre revisar e aplicar;
- cabo/conexão interrompida durante a última movimentação de porta;
- criação do backup antes da primeira alteração;
- garantia de que nenhum comando `/user` seja executado.

Executar somente essas simulações:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests\test_stateful_field_scenarios.py -vv
```

## Preparar a bancada física

Use MikroTiks que possam ser restaurados por MAC ou resetados sem impacto externo. Para cada equipamento:

- conecte o computador também por cabo;
- confirme acesso pelo MAC no WinBox;
- deixe a API ativa e restrita à rede da bancada;
- use um usuário exclusivo de laboratório;
- exporte a configuração e crie um backup manual inicial;
- anote a interface usada para acessar o equipamento;
- não use dados ou senhas de clientes.

Copie [orion-physical-lab.example.json](orion-physical-lab.example.json) para um arquivo local ignorado pelo Git:

```powershell
Copy-Item .\docs\orion-physical-lab.example.json .\.vscode\orion-physical-lab.json
$env:ORION_LAB_ROUTER_PASSWORD = "SENHA_SOMENTE_DA_BANCADA"
```

Os endereços do exemplo são ilustrativos. Preencha os IPs, interfaces, bridges e redes realmente usados na bancada.

## Rodada segura, somente leitura

```powershell
.\scripts\run-physical-lab-tests.ps1 `
  -ConfigPath .\.vscode\orion-physical-lab.json
```

Essa rodada executa:

- conexão e autenticação na API;
- identificação do modelo e capacidades;
- leitura de Wi-Fi, Ethernet, bridges, endereços e rotas;
- detecção da WAN atual;
- validação independente de gateway, ARP e internet;
- pings definidos no arquivo da bancada.

## Rodada com gravação

O arquivo precisa conter `dedicated_lab: true`, um `recovery_plan` e os ciclos em `write_cycles`.

```powershell
.\scripts\run-physical-lab-tests.ps1 `
  -ConfigPath .\.vscode\orion-physical-lab.json `
  -EnableWrites
```

Para cada ciclo, o executor:

1. relê o equipamento;
2. gera a prévia;
3. aplica com confirmação e backup;
4. aguarda o equipamento responder;
5. relê o estado salvo;
6. compara os campos definidos em `expect_network` ou `expect_device`.

O executor não restaura automaticamente o backup. A restauração automática poderia reiniciar o equipamento no momento errado; siga o `recovery_plan` definido para a bancada.

## Fatores externos para misturar na validação

Execute cada falha somente depois de confirmar o acesso por MAC:

| Situação | Ação na bancada | Resultado esperado |
|---|---|---|
| Cabo removido | Desconectar durante monitoramento | ORION mostra perda de acesso e volta após reconectar |
| Interface desaparece | Renomear ou desativar uma porta depois da prévia | Aplicação bloqueada antes do backup/mudança |
| AP indisponível | Desligar temporariamente o AP da Station | Associação fica desconectada sem condenar toda a configuração do router |
| DHCP externo indisponível | Desligar o servidor DHCP de uplink | WAN aparece sem lease; configuração local permanece |
| Gateway sem ICMP | Bloquear somente ping no gateway | ARP e internet continuam avaliados separadamente |
| Internet sem ICMP | Bloquear ping externo | Não declarar toda a topologia incorreta |
| Senha errada | Tentar autenticar com credencial inválida | Erro de autenticação, sem alteração |
| API desativada | Manter apenas WinBox ativo | ORION explica que WinBox e API são serviços distintos |
| Porta externa WinBox | Redirecionar uma porta somente para TCP 8291 | WinBox funciona; ORION deve falhar de forma explicativa |
| Porta externa API | Redirecionar outra porta para TCP 8728/8729 | ORION conecta informando essa porta em Opções avançadas |
| LNS LoRa indisponível | Interromper o destino LNS | Estado desconectado e proteção observável sem perder configuração |
| Reinício | Reiniciar o equipamento de bancada | ORION reconecta e relê o estado persistido |

## IP e porta externa

WinBox e API são serviços diferentes:

- porta externa `9000` encaminhada para `8291`: serve somente ao WinBox;
- porta externa `9001` encaminhada para `8728`: pode servir à API comum;
- porta externa `9002` encaminhada para `8729`: pode servir à API-SSL.

No ORION, informe somente o IP em **Endereço IP** e a porta externa da API em **Opções avançadas → Porta da API**. Não informe `IP:porta` dentro do campo de IP.

Para uso remoto real, prefira uma VPN de gerenciamento. Não publique a API comum diretamente na internet.
