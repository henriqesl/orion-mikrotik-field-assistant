# ORION Field — Manual de campo

Guia rápido para preparar routers e enlaces MikroTik.

## Antes de começar

- IPs exibidos pelo ORION são sugestões, não valores obrigatórios.
- Internet não é necessária para configuração local.
- Não resete um equipamento configurado sem autorização.
- Em bancada, trabalhe com um rádio por vez e evite loops Ethernet.
- Confirme modelo, alimentação e portas do injetor PoE.
- Tenha o plano de IPs, usuário RouterOS, SSID, senha, frequência e largura.

## Conectar

1. Conecte o computador ao MikroTik por Ethernet.
2. Abra o ORION e aguarde a descoberta local.
3. Com IP disponível, clique em **Usar no ORION** e informe o acesso.
4. Se aparecer **Sem IP**, clique em **Preparar por MAC**.
5. Confirme porta, placa de rede e IP temporário; depois use **Verificar configuração atual**.
6. Clique em **Aplicar IP e conectar**.

O IP temporário é editável. O MAC é usado somente nessa preparação; o gerenciamento continua pela API IPv4. Se falhar, use **Plano B: abrir o WinBox** e confira a API do RouterOS.

## Router novo

Na aba **Rede básica**:

1. escolha DHCP ou IP fixo para a WAN;
2. confirme a interface WAN;
3. defina bridge, IP e portas da LAN;
4. escolha NAT, DHCP Server, pool e serviços;
5. revise, digite `APLICAR` e confirme.

O ORION cria um backup antes da escrita. Se a LAN mudar, conecte o computador a uma porta selecionada e use o novo IP.

## Router configurado

A configuração atual é carregada; WAN, LAN e DNS começam protegidos.

- mantenha **Manter rede LAN atual** quando não houver mudança de topologia;
- altere somente o solicitado pela ordem de serviço;
- confira cada item da prévia;
- preserve os acessos necessários para recuperação.

## Enlace AP + Station

Planeje nomes e IPs exclusivos. SSID, senha WPA2, frequência e largura devem ser iguais nos dois lados.

### AP

1. Conecte somente o AP e abra **Configuração do rádio**.
2. Preencha SSID e uma senha WPA2 de pelo menos oito caracteres; clique em **Usar estes dados para configurar o par AP + Station**.
3. Confirme função, enlace, bridge e IP de gerenciamento.
4. Revise, aplique e aguarde a reconexão.
5. Clique em **Desconectar AP e configurar Station**.

### Station

1. Mantenha o AP energizado, mas conecte o computador por cabo somente à Station, sem criar um segundo caminho Ethernet entre eles.
2. Acesse-a pelo ORION e confirme os dados reaproveitados da sessão.
3. Confira o IP exclusivo da Station; a sugestão não garante que o endereço esteja livre.
4. Para localizar o AP, confirme o acesso por cabo e clique em **Buscar APs**. A busca interrompe o Wi-Fi temporariamente.
5. No driver `wireless`, use **Selecionar e fixar** e confira o MAC do AP na prévia. Para remover o vínculo, escolha remover o lock criado pelo ORION.
6. Revise e aplique. Confirme a associação ao AP esperado após a reconexão.

Os dados do par ficam somente na memória enquanto o ORION estiver aberto. `station-bridge` exige MikroTiks compatíveis e a mesma família de driver nos dois lados.

Drivers `wifi`/`wifiwave2` não têm lock por BSSID neste fluxo: use SSID e senha exclusivos. Regras de conexão personalizadas devem ser revisadas pelo responsável no WinBox.

## LoRa

Abra **LoRa**, aguarde a leitura das proteções salvas e marque somente as desejadas. **Reiniciar dispositivo** é opcional e não é ativado automaticamente. Revise e aplique; depois aguarde o intervalo escolhido e confira o funcionamento. A confirmação de gravação não substitui esse teste no gateway.

## Validar

1. Energize os dois lados sem criar loop Ethernet.
2. Confirme a associação da Station no AP.
3. Verifique sinal, taxas negociadas e tráfego atual.
4. Execute o teste rápido entre os IPs de gerenciamento.
5. Faça o alinhamento movendo um eixo por vez.
6. Execute o teste estável após o alinhamento.

Valide gateway e internet somente quando fizerem parte da instalação.

## Se perder o acesso

1. Aguarde o Wi-Fi ou a bridge reiniciar.
2. Confirme o IP atual do computador.
3. Tente o novo IP e depois o IP anterior preservado.
4. Confira cabo, PoE e interface conectada.
5. Tente o WinBox pelo MAC.
6. Não reaplique sem reler o equipamento.

Se o enlace não associar, compare função, SSID, senha, frequência, largura e driver.

## Entrega

- [ ] Identidade, função e IPs registrados
- [ ] Acesso de recuperação confirmado
- [ ] Backup criado
- [ ] Associação e comunicação aprovadas
- [ ] Alinhamento concluído
- [ ] Cabos, aterramento, vedação e fixação conferidos
