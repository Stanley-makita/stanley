const questions = [
  {
    key: "produto",
    title: "Qual produto?",
    options: ["SBPE", "MCMV", "Pró-Cotista", "Recursos Livres", "CDI"],
  },
  {
    key: "interveniente_quitante",
    title: "Existe Interveniente Quitante?",
    options: [
      { label: "Não", value: false },
      { label: "Sim", value: true },
    ],
  },
  {
    key: "banco_iq",
    title: "Qual banco?",
    when: (answers) => answers.interveniente_quitante === true,
    options: ["Caixa", "Itaú", "Santander", "Bradesco", "Outro"],
  },
  {
    key: "fgts",
    title: "Utiliza FGTS?",
    options: [
      { label: "Sim", value: true },
      { label: "Não", value: false },
    ],
  },
  {
    key: "tipo_imovel",
    title: "Imóvel",
    options: ["Novo", "Usado"],
  },
  {
    key: "operacao",
    title: "Operação",
    options: ["Individual", "Empreendimento"],
  },
  {
    key: "sistema",
    title: "Sistema de amortização",
    options: ["SAC", "PRICE"],
  },
  {
    key: "taxa",
    title: "Taxa",
    options: ["Balcão", "Reduzida"],
  },
];

const state = {
  answers: {},
  steps: [],
  index: 0,
  minuta: null,
};

const home = document.querySelector("#home");
const wizard = document.querySelector("#wizard");
const result = document.querySelector("#result");
const errorBox = document.querySelector("#errorBox");
const startButton = document.querySelector("#startButton");
const backButton = document.querySelector("#backButton");
const questionTitle = document.querySelector("#questionTitle");
const stepCounter = document.querySelector("#stepCounter");
const options = document.querySelector("#options");
const minutaName = document.querySelector("#minutaName");
const copyPath = document.querySelector("#copyPath");
const openButton = document.querySelector("#openButton");
const copyButton = document.querySelector("#copyButton");
const newButton = document.querySelector("#newButton");

startButton.addEventListener("click", startWizard);
backButton.addEventListener("click", goBack);
openButton.addEventListener("click", generateAndOpen);
copyButton.addEventListener("click", generateAndOpen);
newButton.addEventListener("click", startWizard);

function startWizard() {
  state.answers = {};
  state.minuta = null;
  state.index = 0;
  state.steps = visibleQuestions();
  copyPath.textContent = "";
  hideError();
  show("wizard");
  renderQuestion();
}

function visibleQuestions() {
  return questions.filter((question) => !question.when || question.when(state.answers));
}

function renderQuestion() {
  state.steps = visibleQuestions();
  const question = state.steps[state.index];
  questionTitle.textContent = question.title;
  stepCounter.textContent = `${state.index + 1} de ${state.steps.length}`;
  options.innerHTML = "";
  backButton.style.visibility = state.index === 0 ? "hidden" : "visible";

  question.options.forEach((option) => {
    const normalized = normalizeOption(option);
    const button = document.createElement("button");
    button.className = "option";
    button.type = "button";
    button.textContent = normalized.label;
    button.addEventListener("click", () => answerQuestion(question.key, normalized.value));
    options.appendChild(button);
  });
}

function answerQuestion(key, value) {
  state.answers[key] = value;
  if (key === "interveniente_quitante" && value === false) {
    state.answers.banco_iq = null;
  }

  state.steps = visibleQuestions();
  if (state.index < state.steps.length - 1) {
    state.index += 1;
    renderQuestion();
    return;
  }

  findMinuta();
}

function goBack() {
  if (state.index === 0) return;
  state.index -= 1;
  renderQuestion();
}

async function findMinuta() {
  hideError();
  const response = await postJson("/api/minutas/encontrar", state.answers);
  state.minuta = response;
  minutaName.textContent = response.nome;
  show("result");
}

async function generateAndOpen() {
  hideError();
  setBusy(true);
  try {
    const response = await postJson("/api/minutas/gerar", state.answers);
    state.minuta = response;
    minutaName.textContent = response.nome;
    copyPath.textContent = `Cópia gerada: ${response.copia}`;
  } finally {
    setBusy(false);
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();

  if (!response.ok) {
    showError(data.erro || "Não foi possível concluir a operação.");
    throw new Error(data.erro || "Erro na requisição");
  }

  return data;
}

function normalizeOption(option) {
  if (typeof option === "object") return option;
  return { label: option, value: option };
}

function show(screen) {
  home.classList.toggle("hidden", screen !== "home");
  wizard.classList.toggle("hidden", screen !== "wizard");
  result.classList.toggle("hidden", screen !== "result");
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function setBusy(isBusy) {
  openButton.disabled = isBusy;
  copyButton.disabled = isBusy;
}
