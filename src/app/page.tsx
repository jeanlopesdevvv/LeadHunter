import { DashboardCliente } from "@/components/dashboard/DashboardCliente";
import { disponiveis, empresaAtiva } from "@/lib/empresa-ativa";
import { pessoaDaSessao } from "@/lib/voob/pessoas";

export default async function Home() {
  const [empresa, pessoa] = await Promise.all([empresaAtiva(), pessoaDaSessao()]);
  return <DashboardCliente empresa={empresa} empresas={disponiveis()} pessoa={pessoa?.nome ?? null} />;
}
