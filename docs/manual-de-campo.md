# ORION — Rádios: manual de campo

## Preparar a bancada

Confirme alimentação, modelo e portas do injetor PoE. Conecte o computador por cabo e trabalhe com um rádio por vez, sem criar um segundo caminho Ethernet entre AP e Station. Internet não é necessária para o acesso local.

Tenha usuário e senha do RouterOS, nomes dos equipamentos, plano de IPs e dados do enlace. Todo endereço apresentado como exemplo ou sugestão pode ser alterado; ele não garante que o IP esteja livre. Não resete um equipamento configurado sem autorização.

## Acessar o primeiro rádio

Abra o ORION, confira o equipamento encontrado e clique em **Usar no ORION**. Informe as credenciais. Se souber o IP, também pode digitá-lo diretamente.

**IP não anunciado** não significa necessariamente ausência de IP. Se não houver um endereço conhecido, use **Preparar por MAC**: informe as credenciais, selecione a placa de rede do computador e confira a porta do MikroTik e o IP proposto. Clique em **Verificar configuração atual**, revise as alterações, marque a confirmação e use **Aplicar IP e conectar**.

A sessão MAC é temporária; o IP adicionado permanece no equipamento. A preparação depende dos serviços permitidos e das credenciais do rádio. Se falhar, use **Plano B: abrir o WinBox** ou peça ao responsável que prepare o acesso pela API.

A porta redirecionada do WinBox não substitui a porta da API. Para acesso remoto, use VPN ou um encaminhamento específico da API. Com API-SSL, a validação usa o certificado do MikroTik, não o certificado do instalador ORION.

## Configurar o AP

Na aba **Equipamento**, confira modelo e interfaces. Abra **Enlace**, mantenha **Par de rádios** e clique em **Configurar o AP primeiro**. Para várias Stations, escolha **AP com várias Stations** antes de continuar.

Preencha nome, SSID e senha do enlace. Confira frequência, largura do canal, país, portas cabeadas, bridge e IP de gerenciamento. Use parâmetros definidos para a instalação; configurações complexas devem ser revisadas pelo responsável.

Clique em **Revisar alterações**, confira cada mudança e digite `APLICAR`. Aguarde o backup, a aplicação e a releitura. Só use **Desconectar AP e configurar Station** depois da conferência dos campos.

## Configurar a Station

Mantenha o AP energizado e conecte o computador por cabo à Station. Acesse-a pelo ORION e abra **Enlace**. A sessão reaproveita SSID e senha do AP; confira o nome e o endereço deste segundo rádio.

Um IP existente pode ser preservado. Se houver uma sugestão, confirme se está livre. AP e Station precisam de endereços exclusivos; para comunicação direta por IP, use endereçamento compatível. Se o ORION indicar redes diferentes, confirme o roteamento com o responsável.

Se precisar localizar o AP, confirme o acesso por cabo antes de **Buscar APs**: a busca pode interromper o Wi-Fi. No driver `wireless`, **Selecionar e fixar** prepara o lock pelo MAC. Nos drivers `wifi`/`wifiwave2`, este fluxo não aplica lock por BSSID; use SSID e senha exclusivos e confira o MAC associado.

Revise e aplique. A sessão só avança após a releitura dos campos. Para multiponto, use **Desconectar e configurar outra Station** e repita com um IP exclusivo. Ao terminar, clique em **Concluir sessão e abrir os testes**.

O modo `station-bridge` depende da compatibilidade entre os MikroTiks e da família de driver. Não misture `wireless` com `wifi` nesse fluxo. Os dados da sessão ficam na memória; não feche o ORION durante a configuração dos dois lados.

## Ajustar um rádio existente

Use **Ajustar somente este rádio**, confira os valores carregados e altere apenas o necessário. Para conectar um cliente a um AP já existente, escolha **Conectar a AP existente**. Esse caminho não altera o AP remoto.

Não trate **Configuração enviada** como prova de funcionamento. Se a releitura falhar, use **Conferir novamente sem reaplicar**. Uma aplicação interrompida pode deixar alterações parciais.

## Testar e alinhar

Na aba **Testes**, confira o MAC remoto e a autorização. Se houver várias Stations, verifique cada uma. O resumo da sessão permite preencher o IP do outro lado, mas o teste só começa ao clicar em **Testar conexão**.

Teste o IP do rádio remoto e depois um equipamento além dele. O ping parte do MikroTik conectado: uma resposta confirma acesso ao destino, não o caminho utilizado nem a capacidade máxima do enlace. Gateway e internet só entram na validação quando fizerem parte da instalação.

Inicie o alinhamento, mova um eixo por vez e acompanhe o sinal. Com várias Stations, escolha qual acompanhar pelo som. Se a leitura falhar, aguarde a atualização antes de continuar. Repita um teste mais longo após fixar a antena.

## Recuperar e entregar

Se perder acesso, aguarde a reconfiguração da interface, confira o IP do computador, cabo e PoE. Tente o novo IP e o anterior preservado. Se necessário, use WinBox por MAC. Não reaplique sem reler o equipamento; a restauração do backup é manual.

Se o ORION não confirmar a identidade física do MikroTik, confira possíveis IPs duplicados e reconecte ao equipamento correto. Não contorne esse aviso para continuar configurando.

Antes de entregar, confirme comunicação, acesso de recuperação e backup no dispositivo. Registre nomes e IPs conforme o procedimento da empresa e confira cabos, aterramento, vedação e fixação.

As telas **Rede básica** e **LoRa** pertencem ao workspace [RouterBoards](../routerboards/README.md), não ao fluxo de rádios.
