import "./chatwoot.css";

/** Abas do Chatwoot (Dashboard Apps): visual próprio, igual ao das abas "📤 Enviar Template" e "Agendamentos". */
export default function ChatwootLayout({ children }: LayoutProps<"/chatwoot">) {
  return <div className="cw">{children}</div>;
}
