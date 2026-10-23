import { ModelosChatwoot } from "@/components/modelos/ModelosChatwoot";

export const metadata = { title: "Modelos · Radar Lavacar" };

/** Aba "Modelos" do Chatwoot (Dashboard App). Também abre direto: radar.lavacar.app/chatwoot/modelos. */
export default function ModelosPage() {
  return <ModelosChatwoot />;
}
