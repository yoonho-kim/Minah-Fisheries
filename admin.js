const adminConfig = window.MINAH_SUPABASE || {};
const authForm = document.querySelector("#adminAuthForm");
const authStatus = document.querySelector("#adminAuthStatus");
const adminStatus = document.querySelector("#adminStatus");
const loginSection = document.querySelector("#adminLogin");
const dashboardSection = document.querySelector("#adminDashboard");
const list = document.querySelector("#reservationList");
const refreshButton = document.querySelector("#refreshReservations");
const logoutButton = document.querySelector("#adminLogout");
const reservationTable = adminConfig.reservationTable || "reservation_requests";

const adminClient = adminConfig.url && adminConfig.anonKey && window.supabase
  ? window.supabase.createClient(adminConfig.url, adminConfig.anonKey)
  : null;

function setText(el, message, tone = "muted") {
  el.textContent = message;
  el.dataset.tone = tone;
}

function formatDateTime(date, time) {
  return `${date || "날짜 미정"} ${time || ""}`.trim();
}

function statusLabel(status) {
  const labels = {
    new: "새 문의",
    contacted: "연락 완료",
    confirmed: "예약 확정",
    canceled: "취소",
  };
  return labels[status] || status || "새 문의";
}

function renderReservations(items) {
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = '<article class="admin-card"><p>아직 접수된 예약 문의가 없습니다.</p></article>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "admin-card";

    const requestedAt = new Intl.DateTimeFormat("ko-KR", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(item.created_at));

    const header = document.createElement("header");
    const titleBox = document.createElement("div");
    const name = document.createElement("strong");
    const detail = document.createElement("span");
    const badge = document.createElement("span");

    name.textContent = item.name;
    detail.textContent = `${formatDateTime(item.visit_date, item.visit_time)} · ${item.guests}`;
    badge.className = "admin-badge";
    badge.textContent = statusLabel(item.status);
    titleBox.append(name, detail);
    header.append(titleBox, badge);

    const details = document.createElement("dl");
    [
      ["연락처", item.phone],
      ["관심 메뉴", item.menu_interest || "방문 후 선택"],
      ["접수", requestedAt],
      ["요청사항", item.memo || "없음"],
    ].forEach(([label, value]) => {
      const group = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      group.append(dt, dd);
      details.append(group);
    });

    const actions = document.createElement("div");
    actions.className = "admin-card-actions";
    [
      ["contacted", "연락 완료"],
      ["confirmed", "예약 확정"],
      ["canceled", "취소"],
    ].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.status = value;
      button.dataset.id = item.id;
      button.textContent = label;
      actions.append(button);
    });

    card.append(header, details, actions);

    list.append(card);
  });
}

async function loadReservations() {
  if (!adminClient) {
    setText(authStatus, "Supabase 설정을 확인해주세요.", "error");
    return;
  }

  setText(adminStatus, "예약 목록을 불러오는 중입니다.");

  const { data, error } = await adminClient
    .from(reservationTable)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    setText(adminStatus, "예약 목록을 불러오지 못했습니다. 관리자 권한과 RLS 정책을 확인해주세요.", "error");
    renderReservations([]);
    return;
  }

  setText(adminStatus, "");
  renderReservations(data);
}

async function showSessionState() {
  if (!adminClient) return;

  const { data } = await adminClient.auth.getSession();
  const isLoggedIn = Boolean(data.session);

  loginSection.hidden = isLoggedIn;
  dashboardSection.hidden = !isLoggedIn;

  if (isLoggedIn) {
    await loadReservations();
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!adminClient) return;

  const email = new FormData(authForm).get("email");
  setText(authStatus, "로그인 링크를 보내는 중입니다.");

  const { error } = await adminClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href.split("#")[0],
    },
  });

  if (error) {
    setText(authStatus, "로그인 링크를 보내지 못했습니다.", "error");
    return;
  }

  setText(authStatus, "이메일로 받은 링크를 열면 예약 목록을 확인할 수 있습니다.", "success");
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-status]");
  if (!button || !adminClient) return;

  button.disabled = true;
  const { error } = await adminClient
    .from(reservationTable)
    .update({ status: button.dataset.status })
    .eq("id", button.dataset.id);

  button.disabled = false;

  if (error) {
    setText(adminStatus, "상태를 변경하지 못했습니다.", "error");
    return;
  }

  await loadReservations();
});

refreshButton.addEventListener("click", loadReservations);

logoutButton.addEventListener("click", async () => {
  await adminClient.auth.signOut();
  await showSessionState();
});

showSessionState();
