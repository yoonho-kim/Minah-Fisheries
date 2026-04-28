const config = window.MINAH_SUPABASE || {};
const statusEl = document.querySelector("#guestbookStatus");
const listEl = document.querySelector("#messageList");
const formEl = document.querySelector("#guestbookForm");
const hasSupabaseConfig = Boolean(config.url && config.anonKey && window.supabase);

const fallbackMessages = [
  {
    name: "민아수산",
    message: "축하 인사 기능은 Supabase 프로젝트 URL과 anon key를 넣으면 바로 열립니다.",
    created_at: new Date().toISOString(),
  },
];

const client = hasSupabaseConfig
  ? window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sanitize(value) {
  return String(value || "").trim();
}

function setStatus(message, tone = "muted") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function renderMessages(messages) {
  listEl.innerHTML = "";

  messages.forEach((item) => {
    const card = document.createElement("article");
    card.className = "message-card";

    const message = document.createElement("p");
    message.textContent = item.message;

    const meta = document.createElement("footer");
    meta.textContent = `${item.name} · ${formatDate(item.created_at)}`;

    card.append(message, meta);
    listEl.append(card);
  });
}

async function loadMessages() {
  if (!client) {
    renderMessages(fallbackMessages);
    setStatus("Supabase 설정값을 넣으면 누구나 축하 인사를 남길 수 있습니다.");
    formEl.querySelector("button").disabled = true;
    return;
  }

  const { data, error } = await client
    .from(config.table)
    .select("name,message,created_at")
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    setStatus("축하 인사를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.", "error");
    return;
  }

  renderMessages(data.length ? data : fallbackMessages);
  setStatus("");
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!client) return;

  const formData = new FormData(formEl);
  const name = sanitize(formData.get("name")).slice(0, 40);
  const message = sanitize(formData.get("message")).slice(0, 500);

  if (!name || !message) {
    setStatus("이름과 축하 인사를 모두 적어주세요.", "error");
    return;
  }

  const button = formEl.querySelector("button");
  button.disabled = true;
  setStatus("축하 인사를 남기는 중입니다.");

  const { error } = await client.from(config.table).insert({ name, message });

  button.disabled = false;

  if (error) {
    setStatus("저장하지 못했습니다. 잠시 후 다시 시도해주세요.", "error");
    return;
  }

  formEl.reset();
  setStatus("따뜻한 인사가 남겨졌습니다.", "success");
  await loadMessages();
});

loadMessages();
