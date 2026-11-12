import { DashboardCliente } from "@/components/dashboard/DashboardCliente";
import { SemEmpresa } from "@/components/voob/SemEmpresa";
import { contextoDoRadar } from "@/lib/empresa-ativa";

export default async function Home() {
  const c = await contextoDoRadar();
  // 13/11/2026 (white label): conta de cliente sem empresa no Radar (ou o Voob CRM fora do ar e nada mais para mostrar).
  if (!c.ativa) return <SemEmpresa erro={c.erroCrm} nome={c.pessoa?.nome ?? null} />;
  return <DashboardCliente empresa={c.ativa} empresas={c.empresas} pessoa={c.pessoa?.nome ?? null} equipe={c.equipe} />;
}
