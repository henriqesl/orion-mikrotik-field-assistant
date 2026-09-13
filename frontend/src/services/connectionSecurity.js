export function withTls(form, enabled) {
  return { ...form, use_tls: enabled, verify_tls: true,
    port: [8728, 8729].includes(Number(form.port)) ? enabled ? 8729 : 8728 : form.port };
}

export function needsCertificateAcknowledgement(form, accepted) {
  return form.use_tls && !form.verify_tls && !accepted;
}
