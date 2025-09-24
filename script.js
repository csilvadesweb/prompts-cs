// ---------- Persistence ----------
const LS_KEY_DATA = "promptlib:data";
const LS_KEY_CFG  = "promptlib:cfg";
const LS_KEY_FAVS = "promptlib:favs";

function loadLS(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{ return fallback; }
}
function saveLS(key, obj){
  try{ localStorage.setItem(key, JSON.stringify(obj)); }catch{}
}

// ---------- Data Seeds ----------
const defaultSeeds = (() => {
  const personas = ["Advogado Consumerista", "Copywriter", "Social Media", "Professor de Tecnologia", "Especialista em SEO", "Mentor de Carreira", "Programador", "Nutricionista"];
  const temas = ["Marketing", "Criação de Conteúdo", "Desenvolvimento Web", "Negócios", "Direito", "Educação", "Saúde e Bem-Estar", "Produtividade"];
  const tipos = ["Carrossel Instagram", "Tweet/Thread", "Post LinkedIn", "Reels/TikTok", "Legenda", "Vídeo Longo", "Título de Blog", "E-mail"];
  const base = [];
  let id = 1;
  for (let p = 0; p < personas.length; p++) {
    for (let i = 0; i < 8; i++) {
      const tema = temas[(p + i) % temas.length];
      const tipo = tipos[(p + i) % tipos.length];
      base.push({
        id: id++,
        titulo: `${tipo} • ${tema} • ${personas[p]} • #${i+1}`,
        persona: personas[p],
        tema,
        tipo,
        tags: [personas[p], tema, tipo].map(t => t.toLowerCase()),
        prompt: `Atue como ${personas[p]} e produza um ${tipo.toLowerCase()} sobre "${tema}".
- Público: iniciante a intermediário
- Tom: claro, prático e persuasivo
- Entregue: 5 variações + CTA final.
Use bullets e exemplos do mercado brasileiro.`
      });
    }
  }
  return base;
})();

let DATA = loadLS(LS_KEY_DATA, defaultSeeds);
let FAVS = new Set(loadLS(LS_KEY_FAVS, []));

// ---------- State ----------
let state = Object.assign({
  tab: "persona",
  query: "",
  primary: "Todos",
  secondary: "Todos",
  pageSize: 30,
  page: 1,
  onlyFav: false,
  theme: "dark",
  tagFilters: [] // tags ativas
}, loadLS(LS_KEY_CFG, {}));

// ---------- Elements ----------
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

const countEl = $("#count");
const tabs = $$(".tab");
const primarySelect = $("#primarySelect");
const secondarySelect = $("#secondarySelect");
const primaryLabel = $("#primaryLabel");
const searchInput = $("#search");
const pageSize = $("#pageSize");
const onlyFav = $("#onlyFav");
const list = $("#list");
const prev = $("#prev");
const next = $("#next");
const pageInfo = $("#pageInfo");
const chips = $("#chips");
const cardTpl = $("#cardTemplate");

const btnExport = $("#btnExport");
const fileInput = $("#fileInput");
const btnGen = $("#btnGen");
const genQty = $("#genQty");
const btnTheme = $("#btnTheme");
const btnFavView = $("#btnFavView");
const btnClear = $("#btnClear");

// ---------- Utils ----------
function uniq(arr){ return [...new Set(arr)]; }
function normalize(s){ return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function matchesQuery(item, q){
  if(!q) return true;
  const hay = normalize(`${item.titulo} ${item.prompt} ${item.persona} ${item.tema} ${item.tipo} ${(item.tags||[]).join(" ")}`);
  return hay.includes(normalize(q));
}
function groupKey(){ return state.tab === "persona" ? "persona" : state.tab === "tema" ? "tema" : "tipo"; }
function otherKey(){ return state.tab === "persona" ? "tema" : state.tab === "tema" ? "tipo" : "persona"; }
function saveAll(){ saveLS(LS_KEY_DATA, DATA); saveLS(LS_KEY_CFG, state); saveLS(LS_KEY_FAVS, Array.from(FAVS)); }
function isFav(id){ return FAVS.has(id); }
function toggleFav(id){ if(FAVS.has(id)) FAVS.delete(id); else FAVS.add(id); saveLS(LS_KEY_FAVS, Array.from(FAVS)); }

// ---------- Theme ----------
function applyTheme(){
  document.documentElement.setAttribute("data-theme", state.theme === "light" ? "light" : "dark");
}
applyTheme();

// ---------- Rendering ----------
function renderSelects(){
  const gk = groupKey();
  const ok = otherKey();

  const primaryValues = ["Todos", ...uniq(DATA.map(x => x[gk])).sort()];
  const secondaryValues = ["Todos", ...uniq(DATA.map(x => x[ok])).sort()];

  primarySelect.innerHTML = primaryValues.map(v => `<option ${v===state.primary?"selected":""}>${v}</option>`).join("");
  secondarySelect.innerHTML = secondaryValues.map(v => `<option ${v===state.secondary?"selected":""}>${v}</option>`).join("");

  primaryLabel.textContent = state.tab==="persona" ? "Todas as Personas" :
                             state.tab==="tema" ? "Todos os Temas" : "Todos os Tipos de Post";
}

function renderChips(total, filtered){
  chips.innerHTML = "";
  const c1 = document.createElement("span"); c1.className="chip";
  c1.textContent = `Total: ${total}`;
  const c2 = document.createElement("span"); c2.className="chip";
  c2.textContent = `Filtrados: ${filtered}`;
  const c3 = document.createElement("span"); c3.className="chip";
  c3.textContent = `Exibindo: ${Math.min(state.pageSize, filtered)}`;
  chips.append(c1,c2,c3);

  // Tag filters ativos
  state.tagFilters.forEach(tag => {
    const t = document.createElement("span");
    t.className = "chip active";
    t.textContent = `#${tag}`;
    t.title = "Remover tag de filtro";
    t.addEventListener("click", () => {
      state.tagFilters = state.tagFilters.filter(x => x !== tag);
      state.page = 1; render();
    });
    chips.appendChild(t);
  });
}

function render(){
  // Filtragem
  const gk = groupKey();
  const ok = otherKey();

  let filtered = DATA.filter(d => matchesQuery(d, state.query));

  if(state.primary !== "Todos") filtered = filtered.filter(d => d[gk] === state.primary);
  if(state.secondary !== "Todos") filtered = filtered.filter(d => d[ok] === state.secondary);

  if(state.onlyFav) filtered = filtered.filter(d => isFav(d.id));

  if(state.tagFilters.length){
    filtered = filtered.filter(d => {
      const tags = (d.tags || []).map(x => normalize(x));
      return state.tagFilters.every(tag => tags.includes(normalize(tag)));
    });
  }

  // Paginação
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  if(state.page > pages) state.page = pages;
  const start = (state.page - 1) * state.pageSize;
  const slice = filtered.slice(start, start + state.pageSize);

  // Header info
  countEl.textContent = `${DATA.length} prompts`;

  // Chips
  renderChips(DATA.length, total);

  // Lista
  list.innerHTML = "";
  slice.forEach(item => {
    const node = cardTpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".title").textContent = item.titulo;
    node.querySelector(".meta").textContent = `${item.persona} • ${item.tema} • ${item.tipo}${isFav(item.id) ? " • ⭐ favorito" : ""}`;
    node.querySelector(".prompt").textContent = item.prompt;

    // Tags
    const tagrow = node.querySelector(".tagrow");
    (item.tags || []).forEach(tag => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = `#${tag}`;
      chip.addEventListener("click", () => {
        if(!state.tagFilters.includes(tag)){
          state.tagFilters.push(tag);
          state.page = 1; render();
        }
      });
      tagrow.appendChild(chip);
    });

    // Ações
    node.querySelector(".copy").addEventListener("click", async () => {
      await navigator.clipboard.writeText(item.prompt);
      const btn = node.querySelector(".copy");
      btn.textContent = "Copiado!";
      setTimeout(() => btn.textContent = "Copiar", 1400);
    });

    node.querySelector(".similar").addEventListener("click", () => {
      state.tab = "persona"; // foca por persona/tema
      state.primary = item.persona;
      state.secondary = item.tema;
      setActiveTab();
      state.page = 1;
      renderSelects();
      render();
    });

    const favBtn = node.querySelector(".fav");
    function paintFav(){ favBtn.textContent = isFav(item.id) ? "⭐ Desfavoritar" : "⭐ Favoritar"; }
    paintFav();
    favBtn.addEventListener("click", () => {
      toggleFav(item.id);
      paintFav();
      render(); // atualiza meta
    });

    list.appendChild(node);
  });

  // Pager
  pageInfo.textContent = `Página ${state.page} de ${pages}`;
  prev.disabled = state.page <= 1;
  next.disabled = state.page >= pages;

  // Persist
  saveLS(LS_KEY_CFG, state);
}

// ---------- Tabs ----------
function setActiveTab(){
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === state.tab));
}

// ---------- Events ----------
tabs.forEach(btn => btn.addEventListener("click", () => {
  state.tab = btn.dataset.tab;
  state.primary = "Todos";
  state.secondary = "Todos";
  setActiveTab();
  renderSelects();
  state.page = 1;
  render();
}));

searchInput.addEventListener("input", (e) => { state.query = e.target.value; state.page = 1; render(); });
primarySelect.addEventListener("change", (e) => { state.primary = e.target.value; state.page = 1; render(); });
secondarySelect.addEventListener("change", (e) => { state.secondary = e.target.value; state.page = 1; render(); });
pageSize.addEventListener("change", (e) => { state.pageSize = parseInt(e.target.value,10); state.page = 1; render(); });
prev.addEventListener("click", () => { state.page = Math.max(1, state.page-1); render(); });
next.addEventListener("click", () => { state.page = state.page+1; render(); });
onlyFav.addEventListener("change", (e) => { state.onlyFav = e.target.checked; state.page = 1; render(); });

// ---------- Theme Toggle ----------
btnTheme.addEventListener("click", () => {
  state.theme = state.theme === "light" ? "dark" : "light";
  applyTheme();
  saveLS(LS_KEY_CFG, state);
});

// ---------- Favoritos View toggle shortcut ----------
btnFavView.addEventListener("click", () => {
  state.onlyFav = !state.onlyFav;
  onlyFav.checked = state.onlyFav;
  state.page = 1;
  render();
});

// ---------- Import/Export ----------
btnExport.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "prompts.json";
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
});

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const text = await file.text();
    const json = JSON.parse(text);
    if(!Array.isArray(json)) throw new Error("JSON inválido: esperado um array de prompts.");
    DATA = json.map((x,i) => ({
      id: x.id ?? i+1,
      titulo: x.titulo ?? `Prompt #${i+1}`,
      persona: x.persona ?? "N/D",
      tema: x.tema ?? "N/D",
      tipo: x.tipo ?? "N/D",
      tags: Array.isArray(x.tags) ? x.tags : [x.persona, x.tema, x.tipo].filter(Boolean).map(s=>String(s).toLowerCase()),
      prompt: x.prompt ?? ""
    }));
    state.page = 1;
    renderSelects();
    render();
    saveLS(LS_KEY_DATA, DATA);
  }catch(err){
    alert("Falha ao importar JSON: " + err.message);
  }finally{
    e.target.value = "";
  }
});

// ---------- Generator ----------
function poolFromData(){
  const p = uniq(DATA.map(x => x.persona)).filter(Boolean);
  const t = uniq(DATA.map(x => x.tema)).filter(Boolean);
  const k = uniq(DATA.map(x => x.tipo)).filter(Boolean);
  return {
    personas: p.length ? p : ["Advogado Consumerista","Copywriter","Social Media","Professor de Tecnologia","Especialista em SEO","Mentor de Carreira","Programador","Nutricionista"],
    temas: t.length ? t : ["Marketing","Criação de Conteúdo","Desenvolvimento Web","Negócios","Direito","Educação","Saúde e Bem-Estar","Produtividade"],
    tipos: k.length ? k : ["Carrossel Instagram","Tweet/Thread","Post LinkedIn","Reels/TikTok","Legenda","Vídeo Longo","Título de Blog","E-mail"]
  };
}

function generateRandom(n=50){
  const pool = poolFromData();
  const nextIdStart = (DATA.reduce((m, x) => Math.max(m, x.id||0), 0) || 0) + 1;
  for(let i=0;i<n;i++){
    const persona = pool.personas[Math.floor(Math.random()*pool.personas.length)];
    const tema = pool.temas[Math.floor(Math.random()*pool.temas.length)];
    const tipo = pool.tipos[Math.floor(Math.random()*pool.tipos.length)];
    const id = nextIdStart + i;
    const titulo = `${tipo} • ${tema} • ${persona} • #${id}`;
    const prompt = `Atue como ${persona} e crie um ${tipo.toLowerCase()} sobre ${tema}. ` +
                   `Use linguagem clara, inclua 3 exemplos práticos do contexto brasileiro, ` +
                   `apresente um passo a passo e finalize com um CTA para conversão.`;
    const tags = [persona, tema, tipo].map(s=>s.toLowerCase());
    DATA.push({ id, titulo, persona, tema, tipo, tags, prompt });
  }
  saveLS(LS_KEY_DATA, DATA);
  renderSelects();
  render();
}

btnGen.addEventListener("click", () => {
  let n = parseInt(genQty.value, 10);
  if(isNaN(n) || n < 1) n = 1;
  if(n > 1000) n = 1000;
  generateRandom(n);
});

// ---------- Clear Library ----------
btnClear.addEventListener("click", () => {
  if(confirm("Tem certeza que deseja limpar toda a biblioteca? Isso removerá os prompts carregados (mantém favoritos).")){
    DATA = [];
    saveLS(LS_KEY_DATA, DATA);
    state.page = 1;
    renderSelects();
    render();
  }
});

// ---------- Init ----------
function init(){
  // Restore UI pieces
  onlyFav.checked = state.onlyFav;
  setActiveTab();
  renderSelects();
  render();
}
init();
