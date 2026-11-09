import { comoFunilConvites } from "@/lib/convites-regras";
import { lerFunilConvites } from "@/lib/banco";
import { handleError } from "@/lib/http";

export const maxDuration = 30;

/** Funil "Do link à conta" (convites da Carol): ?dias=7|14|30. */
export async function GET(request: Request) {
  const d = Number(new URL(request.url).searchParams.get("dias"));
  const dias = [7, 14, 30].includes(d) ? d : 14;
  try {
    return Response.json(comoFunilConvites(await lerFunilConvites(dias)));
  } catch (e) {
    return handleError(e);
  }
}
