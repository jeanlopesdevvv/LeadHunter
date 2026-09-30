/** Onde a preferência de aparência fica guardada no navegador ("claro" | "escuro"; sem valor = automático). */
export const CHAVE_TEMA = "radar:tema";

/**
 * Roda antes da página aparecer (no <head>), para não piscar claro antes de ficar escuro.
 * Mesma regra de `aplicarTema` em components/tema.tsx.
 */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE_TEMA}");var e=t==="escuro"||(t!=="claro"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",e?"dark":"light");}catch(_){}})();`;
