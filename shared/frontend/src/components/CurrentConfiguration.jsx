function CurrentConfiguration({ items = [] }) {
  if (!items.length) return null;

  return (
    <details className="current-configuration" open>
      <summary>
        <span>Configuração atual detectada</span>
        <small>{items.length} {items.length === 1 ? "item" : "itens"}</small>
      </summary>
      <div className="current-configuration__grid">
        {items.map((item, index) => (
          <article key={`${item.area}-${item.field}-${index}`}>
            <span>{item.area}</span>
            <strong>{item.field}</strong>
            <small>{item.value}</small>
          </article>
        ))}
      </div>
    </details>
  );
}

export default CurrentConfiguration;
