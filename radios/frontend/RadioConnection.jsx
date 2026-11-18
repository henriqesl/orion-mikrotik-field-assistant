import ConnectionForm from "../../shared/frontend/src/components/ConnectionForm.jsx";

export default function RadioConnection(props) {
  return (
    <ConnectionForm {...props} initialHost="" title="Conecte seu rádio">
      <p>
        Ligue o rádio com a alimentação adequada e conecte o computador à mesma rede.
        Escolha o equipamento encontrado abaixo ou informe o IP que ele já utiliza.
      </p>
      <details className="advanced-options">
        <summary>O rádio não apareceu?</summary>
        <p>
          Confira a alimentação, o cabo e a conexão de rede do computador.
          A descoberta pode estar desativada no MikroTik; se souber o IP, tente o acesso direto.
        </p>
        <p>
          Se ele aparecer sem IP, use Preparar por MAC. A preparação depende dos serviços
          permitidos no equipamento e das credenciais de acesso. Não precisa de internet.
        </p>
      </details>
    </ConnectionForm>
  );
}
