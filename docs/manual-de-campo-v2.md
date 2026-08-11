# ORION Field V2 — Manual de preparação de um enlace

Este procedimento prepara dois rádios MikroTik para formar um enlace transparente: um **AP** e uma **Station**.

## Resultado esperado

Ao final:

- o AP e a Station usam o mesmo SSID, senha, frequência e largura de canal;
- as interfaces Ethernet e Wi-Fi ficam na mesma bridge;
- cada rádio usa o IP de gerenciamento definido no plano da instalação;
- o computador consegue testar um rádio a partir do outro lado do enlace.

> **Não existem IPs obrigatórios no ORION.** Todos os endereços devem ser escolhidos de acordo com a rede do cliente ou com o plano de endereçamento da empresa. Os IPs `192.168.88.x` e `192.168.50.x` aparecem somente como exemplos.

> **Importante:** internet não é necessária para configurar ou testar o enlace. O computador e os rádios precisam apenas estar conectados localmente.

## Antes de começar

Separe:

- dois rádios compatíveis e suas fontes/injetores PoE corretos;
- um computador Windows com ORION e WinBox;
- dois cabos Ethernet;
- a senha aprovada para os usuários RouterOS;
- SSID, senha WPA2 e frequência definidos para o enlace;
- etiquetas para marcar **AP** e **STATION**.

Confira o modelo e a tensão PoE antes de energizar. Nunca conecte a porta PoE destinada ao rádio diretamente na placa de rede do computador.

Durante a preparação, trabalhe com **um rádio por vez**. Não conecte os dois lados Ethernet do enlace ao mesmo switch: quando o enlace sem fio subir, isso pode formar um loop de camada 2.

## Definir o endereçamento antes de configurar

Preencha esta tabela antes de ligar os equipamentos. A coluna **Exemplo** serve apenas para mostrar o formato e não deve ser copiada automaticamente.

| Variável usada no manual | Preencher com | Exemplo apenas |
|---|---|---|
| `<REDE_PREPARACAO>` | Rede temporária usada na bancada | `192.168.88.0/24` |
| `<IP_PC_PREPARACAO>` | IP do computador nessa rede | `192.168.88.10` |
| `<IP_RECUPERACAO_AP>/<PREFIXO_PREPARACAO>` | IP temporário exclusivo do AP | `192.168.88.2/24` |
| `<IP_RECUPERACAO_ST>/<PREFIXO_PREPARACAO>` | IP temporário exclusivo da Station | `192.168.88.3/24` |
| `<REDE_GERENCIAMENTO>` | Rede definitiva de gerenciamento | `192.168.50.0/24` |
| `<IP_PC_GERENCIAMENTO>` | IP do computador na rede definitiva | `192.168.50.10` |
| `<IP_AP>/<PREFIXO_GERENCIAMENTO>` | IP definitivo exclusivo do AP | `192.168.50.2/24` |
| `<IP_STATION>/<PREFIXO_GERENCIAMENTO>` | IP definitivo exclusivo da Station | `192.168.50.3/24` |
| `<GATEWAY>` | Gateway da rede, se existir | `192.168.50.1` |

Os quatro IPs dos equipamentos devem ser exclusivos. O AP e a Station não podem receber o mesmo endereço. Os IPs temporários também devem ser diferentes porque o ORION os preserva como caminho de recuperação.

Nos comandos abaixo, tudo que estiver entre `<` e `>` deve ser substituído pelo valor planejado, removendo também os sinais `<` e `>`. Não cole um comando enquanto ainda houver um marcador desse tipo.

## 1. Decidir se o rádio pode ser apagado

### Rádio novo, de laboratório ou liberado para implantação

Use a preparação limpa deste manual. Ela evita que DHCP, NAT, firewall ou configurações de fábrica interfiram no enlace.

### Rádio retirado de uma instalação

**Não resete sem autorização.** Fotografe a etiqueta, registre o local e preserve um backup. A V2 não remove automaticamente DHCP, NAT, firewall, rotas ou IPs anteriores. Um equipamento reutilizado deve ser limpo por um responsável antes de seguir o fluxo de rádio novo.

## 2. Preparar o computador

1. Desative temporariamente Wi-Fi, VPN e outras interfaces que possam alcançar `<REDE_PREPARACAO>` ou `<REDE_GERENCIAMENTO>` por outro caminho.
2. Conecte a porta **Data/LAN** do injetor PoE ao computador e a porta **PoE/Data+Power** ao rádio.
3. Configure manualmente a Ethernet do computador como:
   - IP: `<IP_PC_PREPARACAO>`
   - máscara: a correspondente ao prefixo escolhido
   - gateway: deixe vazio
   - DNS: deixe vazio
4. Abra o WinBox e aguarde o rádio aparecer em **Neighbors**.

Se o equipamento não aparecer, revise alimentação, cabos, placa Ethernet e permissão do WinBox no Firewall do Windows.

## 3. Obter uma base limpa

Esta etapa apaga a configuração. Execute somente em equipamento autorizado.

### Se o rádio ainda possui configuração de fábrica

1. Entre pelo MAC no WinBox.
2. Use o usuário `admin` e a senha da etiqueta. Em modelos antigos, a senha inicial pode estar vazia.
3. Abra **New Terminal**.
4. Execute:

```routeros
/system reset-configuration no-defaults=yes
```

5. Confirme com `y` e aguarde o rádio reiniciar.
6. Localize novamente o equipamento em **Neighbors** e entre pelo MAC.

### Se o rádio já está sem configuração

Não é necessário resetar novamente. Entre pelo MAC no WinBox e prossiga.

Se nem o acesso por MAC funcionar e o equipamento estiver autorizado para ser apagado, faça o reset físico conforme o manual do modelo. Não mantenha o botão pressionado além da indicação correta, pois alguns modelos entram em outros modos de recuperação.

## 4. Preparar o AP para o ORION

No terminal do AP, execute **uma vez**, substituindo os marcadores de rede e as duas senhas:

```routeros
/interface bridge add name=bridge-field protocol-mode=rstp comment="ORION Field"
/interface bridge port add bridge=bridge-field interface=ether1 comment="ORION Field - acesso"
/ip address add address=<IP_RECUPERACAO_AP>/<PREFIXO_PREPARACAO> interface=bridge-field comment="ORION Field - recuperacao AP"
/ip service enable api
/ip service set api port=8728 address=<REDE_PREPARACAO>,<REDE_GERENCIAMENTO>
/user group add name=orion-field policy=read,write,test,sensitive,api
/user add name=orion group=orion-field password="SENHA_FORTE_DO_ORION"
/user set admin password="SENHA_FORTE_DO_ADMIN"
```

Se a interface Ethernet do equipamento não se chamar `ether1`, pare e confirme o nome em **Interfaces** antes de executar o segundo comando.

Feche o WinBox. No ORION, conecte usando:

- IP: `<IP_RECUPERACAO_AP>`
- usuário: `orion`
- senha: a definida acima
- opções avançadas: mantenha API padrão, porta `8728`, sem TLS

## 5. Configurar o AP no ORION

No cartão **Configurar enlace**, preencha:

- Função: **AP**
- Nome: `ORION-AP-LOCAL`
- SSID: o nome definido para o enlace
- Senha WPA2: a senha definida para o enlace
- Frequência: a frequência autorizada no planejamento
- Largura: **20 MHz** para a primeira ativação
- IP de gerenciamento: `<IP_AP>/<PREFIXO_GERENCIAMENTO>`
- Gateway: `<GATEWAY>`, ou deixe vazio em um enlace isolado
- Bridge: `bridge-field`
- Interface Wi-Fi: confirme a interface apresentada pelo equipamento
- Interface Ethernet: `ether1`

Clique em **Revisar alterações**, leia todos os alertas, digite `APLICAR` e confirme.

O ORION criará um backup e tentará reconectar em `<IP_AP>`. Para acessar o IP definitivo, altere temporariamente o computador para `<IP_PC_GERENCIAMENTO>` com o prefixo correto. O AP continuará acessível por `<IP_RECUPERACAO_AP>` como recuperação.

Depois de confirmar o acesso, desligue o AP e marque fisicamente **AP**.

## 6. Preparar e configurar a Station

Volte o computador para `<IP_PC_PREPARACAO>` com o prefixo correto, conecte somente a Station e repita as etapas de base limpa.

No terminal da Station, execute **uma vez**:

```routeros
/interface bridge add name=bridge-field protocol-mode=rstp comment="ORION Field"
/interface bridge port add bridge=bridge-field interface=ether1 comment="ORION Field - acesso"
/ip address add address=<IP_RECUPERACAO_ST>/<PREFIXO_PREPARACAO> interface=bridge-field comment="ORION Field - recuperacao Station"
/ip service enable api
/ip service set api port=8728 address=<REDE_PREPARACAO>,<REDE_GERENCIAMENTO>
/user group add name=orion-field policy=read,write,test,sensitive,api
/user add name=orion group=orion-field password="SENHA_FORTE_DO_ORION"
/user set admin password="SENHA_FORTE_DO_ADMIN"
```

Conecte o ORION em `<IP_RECUPERACAO_ST>` e configure:

- Função: **Station**
- Nome: `ORION-ST-REMOTO`
- SSID: exatamente o mesmo do AP
- Senha WPA2: exatamente a mesma do AP
- Frequência: exatamente a mesma do AP
- Largura: exatamente a mesma do AP
- IP de gerenciamento: `<IP_STATION>/<PREFIXO_GERENCIAMENTO>`
- Gateway: `<GATEWAY>`, ou deixe vazio em um enlace isolado
- Bridge: `bridge-field`
- Interface Wi-Fi: confirme a interface apresentada
- Interface Ethernet: `ether1`

Revise, digite `APLICAR` e confirme. Depois, altere o computador para `<IP_PC_GERENCIAMENTO>` e teste o acesso a `<IP_STATION>`.

Marque fisicamente o equipamento como **STATION**.

## 7. Fazer o enlace subir na bancada

1. Energize os dois rádios.
2. Não ligue as duas portas Ethernet ao mesmo switch.
3. Posicione os rádios com alguns metros de separação e evite apontar antenas de alto ganho diretamente uma para a outra a curta distância.
4. Conecte o computador ao lado do AP e use `<IP_PC_GERENCIAMENTO>` com o prefixo correto.
5. No ORION, abra `<IP_AP>` e aguarde a Station aparecer na tabela de registro.
6. Execute um ping para `<IP_STATION>`.
7. Conecte o computador ao lado da Station, abra `<IP_STATION>` e execute ping para `<IP_AP>`.

O enlace básico está funcional quando:

- AP e Station aparecem associados;
- o ORION mostra o peer autorizado;
- os dois IPs definitivos respondem através do enlace;
- não há perda relevante no teste curto;
- sinal e taxas aparecem estáveis.

## 8. Instalação e alinhamento

1. Instale o AP e a Station com visada adequada e fixação segura.
2. Confirme novamente polarização, frequência e largura planejadas.
3. Abra o **Modo alinhamento** do ORION.
4. Movimente um eixo por vez e aguarde a leitura estabilizar.
5. Aperte a fixação gradualmente, conferindo se o sinal não mudou.
6. Execute ping entre `<IP_AP>` e `<IP_STATION>`.
7. Execute a validação de gateway/internet somente se o enlace estiver conectado a uma rede que realmente possua gateway.

Não aumente a largura do canal apenas para obter uma taxa nominal maior. Mantenha 20 MHz quando estabilidade e imunidade a interferência forem prioritárias.

## 9. Se algo der errado

### O ORION não conecta

- confirme o IP manual do computador;
- teste primeiro o IP definitivo e depois o IP de recuperação;
- confira cabos, PoE e LEDs;
- abra o WinBox por MAC;
- em **IP > Services**, confirme que `api` está habilitada na porta `8728`;
- confirme que a rede do computador está permitida no campo **Available From**;
- confirme o usuário `orion` e seu grupo.

### AP e Station não associam

Confira, nos dois lados:

- SSID idêntico;
- senha idêntica;
- frequência idêntica;
- largura idêntica;
- AP configurado como AP e remoto como Station;
- interfaces Wi-Fi habilitadas;
- mesma família de driver. `wifi` deve formar `station-bridge` com `wifi`; `wireless` com `wireless`.

### A conexão caiu ao aplicar

Isso pode ocorrer quando a interface muda de bridge ou o Wi-Fi reinicia. Aguarde alguns segundos, ajuste o IP do computador e tente:

- AP definitivo: `<IP_AP>`
- AP recuperação: `<IP_RECUPERACAO_AP>`
- Station definitiva: `<IP_STATION>`
- Station recuperação: `<IP_RECUPERACAO_ST>`

Se nenhum responder, entre pelo MAC no WinBox. Não aplique a configuração repetidamente sem conferir o estado do rádio.

## Checklist de entrega

- [ ] Equipamentos etiquetados como AP e Station
- [ ] Senhas registradas no local aprovado pela empresa
- [ ] API restrita às redes de gerenciamento
- [ ] AP acessível no IP definitivo registrado no plano
- [ ] Station acessível no IP definitivo registrado no plano
- [ ] SSID, senha, frequência e largura iguais
- [ ] Peer autorizado nos dois lados
- [ ] Ping AP → Station aprovado
- [ ] Ping Station → AP aprovado
- [ ] Alinhamento concluído
- [ ] Cabos, aterramento, vedação e fixação conferidos
- [ ] Backup criado pelo ORION anotado

## Referências oficiais

- [Configurações padrão do RouterOS](https://help.mikrotik.com/docs/spaces/ROS/pages/167706788/Default%20configurations)
- [Gerenciamento e reset de configuração](https://help.mikrotik.com/docs/spaces/ROS/pages/328155/Configuration%2BManagement)
- [Serviços e portas do RouterOS](https://help.mikrotik.com/docs/spaces/ROS/pages/103841820/Services)
- [Usuários, grupos e permissões](https://help.mikrotik.com/docs/spaces/ROS/pages/8978504/User)
- [MAC Server e MAC WinBox](https://help.mikrotik.com/docs/spaces/ROS/pages/98795539/MAC%2Bserver)
