# ORION Network Engine

Componente nativo do ORION para transformar amostras reais de latência em métricas reproduzíveis. Ele não lê RSSI, ruído ou SNR: esses valores continuam vindo do RouterOS.

## Métricas

- perda e disponibilidade: relação entre pacotes enviados e respostas;
- jitter: média da diferença absoluta entre respostas consecutivas;
- p95 e p99: interpolação linear sobre as latências ordenadas;
- pico: amostra acima de `média + max(5 ms, 3 × jitter)`;
- estabilidade: nota calculada de 0 a 100, penalizada por perda (até 65 pontos), jitter (20), cauda p95 (10) e proporção de picos (5).

A nota é uma interpretação do ORION, não um dado fornecido pelo MikroTik. As demais métricas são valores calculados a partir das amostras recebidas.

## Interface

```powershell
orion-network-engine.exe analyze --sent 5 --samples "1,2,3,4,52"
```

O resultado é emitido como um único objeto JSON em `stdout`. Entradas inválidas são explicadas em `stderr` e retornam código de saída `2`.
