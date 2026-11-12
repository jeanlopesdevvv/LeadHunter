import { DashboardCliente } from "@/components/dashboard/DashboardCliente";
import { disponiveis, empresaAtiva } from "@/lib/empresa-ativa";

export default async function Home() {
  const empresa = await empresaAtiva();
  return <DashboardCliente empresa={empresa} empresas={disponiveis()} />;
}
