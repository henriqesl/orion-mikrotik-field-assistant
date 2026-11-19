export default function ConnectionHelp({ status, code }) {
  const guidance = code === "BACKEND_UNREACHABLE"
    ? "O serviço local não respondeu. Confirme que o ORION está aberto; no modo web, reinicie pelo start-orion.cmd."
    : status === 401 ? "Confira o usuário e a senha do MikroTik. Se ele veio de fábrica, confira também a etiqueta do equipamento."
      : status === 504 ? "Confira o cabo, o IP e a rede do computador. O equipamento pode estar acessível no WinBox e ainda não responder pela API."
        : status === 422 ? "Revise os campos indicados. Informe o endereço e a porta da API separadamente."
          : "Confira se a API está habilitada e permitida para este computador. Uma porta do WinBox não substitui a porta da API. Em caso de erro de certificado, revise o API-SSL sem desativar a validação.";
  return <p>{guidance}</p>;
}
