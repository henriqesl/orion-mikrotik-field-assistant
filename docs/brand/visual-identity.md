# ORION — Identidade visual

## Conceito

O símbolo do ORION combina a letra **O**, órbitas e três nós de conexão. Ele representa leitura, comunicação e validação de equipamentos em campo. A construção evita elementos genéricos como roteadores, escudos e o ícone tradicional de Wi-Fi.

## Personalidade

- precisa, sem parecer fria;
- técnica, sem ser complicada;
- confiável para uso operacional;
- direta e legível em ambientes de campo.

## Cores

| Token | Cor | Uso |
|---|---|---|
| Obsidian | `#08111F` | fundo principal |
| Deep panel | `#0D1929` | cartões e navegação |
| Elevated panel | `#122238` | elementos elevados |
| Orbit blue | `#2F7DF6` | ação principal e seleção |
| Signal cyan | `#35D0E2` | dados ao vivo e conectividade |
| Polar white | `#F4F7FB` | texto principal |
| Steel | `#A7B6CA` | texto secundário |
| Muted | `#71839B` | metadados |
| Success | `#2CCB7F` | aprovado e disponível |
| Warning | `#F3B544` | atenção |
| Danger | `#F05D73` | falha e ação destrutiva |

As cores de estado têm significado fixo. Azul não representa sucesso; verde não representa ação comum.

## Tipografia

- **Manrope Variable:** títulos, navegação, formulários e textos.
- **JetBrains Mono Variable:** IP, MAC, frequência, taxas e valores técnicos.

As fontes são empacotadas no frontend e não dependem de internet.

## Diretrizes de interface

- contraste alto para leitura externa;
- hierarquia com poucas variações de tamanho;
- cartões com bordas discretas e sem efeitos decorativos excessivos;
- dados técnicos em fonte monoespaçada;
- textos curtos e orientados à ação;
- azul para ações, ciano para telemetria e cores semânticas apenas para estados.

## Ativos

- `frontend/src/assets/orion-mark.svg`: símbolo usado pela aplicação;
- `frontend/public/favicon.svg`: ícone do navegador;
- o nome ORION deve ser composto em Manrope, não convertido em imagem.
