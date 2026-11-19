import ConnectionForm from "../../shared/frontend/src/components/ConnectionForm.jsx";
import Icon from "../../shared/frontend/src/components/Icon.jsx";
import "./radio.css";

export default function RadioConnection(props) {
  return (
    <ConnectionForm {...props} initialHost="" title="Conecte seu rádio">
      <ol className="radio-access-steps" aria-label="Primeiro acesso">
        <li><Icon name="ethernet" /><span>Conecte por cabo</span></li>
        <li><Icon name="radio" /><span>Escolha o rádio</span></li>
        <li><Icon name="shield" /><span>Informe o acesso</span></li>
      </ol>
      <details className="advanced-options">
        <summary>O rádio não apareceu?</summary>
        <p>
          Confira a alimentação, o cabo e a conexão de rede do computador.
          A descoberta pode estar desativada no MikroTik; se souber o IP, tente o acesso direto.
        </p>
        <p>
          Se ele aparecer com IP não anunciado, use Preparar por MAC ou informe um IP conhecido.
          A preparação depende dos serviços
          permitidos no equipamento e das credenciais de acesso. Não precisa de internet.
        </p>
      </details>
    </ConnectionForm>
  );
}
