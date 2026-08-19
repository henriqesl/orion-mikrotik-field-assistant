# Instalação interna do ORION Field

Este procedimento vale somente para computadores autorizados pela BIONIC.

## 1. Conferir o certificado

Abra `BIONIC-ORION-Trust.cer`, acesse **Detalhes** e confira a impressão digital:

`98F799C35B462B4B7E174DF937D061181FF14F76`

## 2. Confiar no publicador

Instale o certificado para o usuário atual duas vezes, selecionando manualmente estes repositórios:

1. **Autoridades de Certificação Raiz Confiáveis**;
2. **Editores Confiáveis**.

O arquivo `.cer` contém somente a chave pública. Nunca aceite um arquivo `.pfx` ou uma chave privada enviado junto com o ORION.

## 3. Instalar

Execute `ORION-Field-0.6.0-x64-Setup.exe` e confirme que o Windows mostra **BIONIC ORION Internal Code Signing** como publicador.

Depois da instalação, abra **ORION Field** pelo atalho da Área de Trabalho ou pelo menu Iniciar.
