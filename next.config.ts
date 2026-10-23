import type { NextConfig } from "next";

const SEGURANCA = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Gera um servidor Node enxuto em .next/standalone (usado pela imagem Docker do servidor do Lavacar).
  // A Vercel ignora esta opção, então o projeto continua funcionando lá também.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Ninguém coloca o Radar dentro de outra página...
        source: "/((?!chatwoot/|login).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }, ...SEGURANCA],
      },
      {
        // ...exceto o nosso Chatwoot, na aba "Modelos" (Dashboard App), e a tela de login que ela abre sem sessão.
        source: "/chatwoot/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://chat.lavacar.app" }, ...SEGURANCA],
      },
      {
        source: "/login",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://chat.lavacar.app" }, ...SEGURANCA],
      },
    ];
  },
};

export default nextConfig;
