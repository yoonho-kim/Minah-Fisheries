const ADMIN_PASSWORD = "1234qwer";
const ADMIN_SESSION_KEY = "space-star-league-admin-ok";
const config = window.MINAH_SUPABASE || {};

const els = {
  form: document.querySelector("#match-form"),
  title: document.querySelector("#match-title"),
  teamA: document.querySelector("#team-a-name-input"),
  teamASubtitle: document.querySelector("#team-a-subtitle-input"),
  teamB: document.querySelector("#team-b-name-input"),
  teamBSubtitle: document.querySelector("#team-b-subtitle-input"),
  closeMinutes: document.querySelector("#close-minutes"),
  start: document.querySelector("#start-match"),
  end: document.querySelector("#end-match"),
  winner: document.querySelector("#winner-team"),
  settle: document.querySelector("#settle-match"),
  reset: document.querySelector("#reset-bets"),
  status: document.querySelector("#admin-status"),
  summary: document.querySelector("#admin-summary"),
};

if (sessionStorage.getItem(ADMIN_SESSION_KEY) !== "yes") {
  window.location.replace("index.html");
}

loadSummary();

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("저장 중입니다...");

  const payload = {
    p_admin_password: ADMIN_PASSWORD,
    p_match_slug: config.leagueMatchSlug || "space-star-league-main",
    p_title: els.title.value.trim(),
    p_team_a_name: els.teamA.value.trim(),
    p_team_a_subtitle: els.teamASubtitle.value.trim(),
    p_team_b_name: els.teamB.value.trim(),
    p_team_b_subtitle: els.teamBSubtitle.value.trim(),
    p_close_minutes: els.closeMinutes.value ? Number(els.closeMinutes.value) : null,
  };

  try {
    const result = await callRpc("admin_update_league_match", payload);
    applySummary(result?.[0]);
    setStatus("설정을 저장했습니다.");
  } catch (error) {
    setStatus(`저장 실패: ${error.message}`);
  }
});

els.reset.addEventListener("click", async () => {
  const confirmed = window.confirm("모든 배팅 기록과 댓글을 초기화할까요?");
  if (!confirmed) return;

  setStatus("초기화 중입니다...");

  try {
    const result = await callRpc("admin_reset_league_bets", {
      p_admin_password: ADMIN_PASSWORD,
      p_match_slug: config.leagueMatchSlug || "space-star-league-main",
    });
    applySummary(result?.[0]);
    localStorage.removeItem("space-star-league-state-v2");
    localStorage.removeItem("space-star-league-user-pick-v2");
    setStatus("모든 배팅과 댓글을 초기화했습니다.");
  } catch (error) {
    setStatus(`초기화 실패: ${error.message}`);
  }
});

els.start.addEventListener("click", async () => {
  setStatus("새 투표를 시작하고 배팅/댓글을 초기화하는 중입니다...");

  try {
    const result = await callRpc("admin_start_league_match", {
      p_admin_password: ADMIN_PASSWORD,
      p_match_slug: config.leagueMatchSlug || "space-star-league-main",
    });
    applySummary(result?.[0]);
    localStorage.removeItem("space-star-league-state-v2");
    localStorage.removeItem("space-star-league-user-pick-v2");
    setStatus("새 투표를 시작하고 배팅/댓글을 초기화했습니다.");
  } catch (error) {
    setStatus(`시작 실패: ${error.message}`);
  }
});

els.end.addEventListener("click", async () => {
  const confirmed = window.confirm("투표를 종료할까요?");
  if (!confirmed) return;

  setStatus("투표를 종료하는 중입니다...");

  try {
    const result = await callRpc("admin_end_league_match", {
      p_admin_password: ADMIN_PASSWORD,
      p_match_slug: config.leagueMatchSlug || "space-star-league-main",
    });
    applySummary(result?.[0]);
    setStatus("투표를 종료했습니다.");
  } catch (error) {
    setStatus(`종료 실패: ${error.message}`);
  }
});

els.settle.addEventListener("click", async () => {
  const confirmed = window.confirm("선택한 승자로 정산하고 다이아를 지급할까요?");
  if (!confirmed) return;

  setStatus("승자 정산 중입니다...");

  try {
    const result = await callRpc("admin_settle_league_match", {
      p_admin_password: ADMIN_PASSWORD,
      p_match_slug: config.leagueMatchSlug || "space-star-league-main",
      p_winner_team: els.winner.value,
    });
    applySummary(result?.[0]);
    setStatus("승자 정산을 완료했습니다.");
  } catch (error) {
    setStatus(`정산 실패: ${error.message}`);
  }
});

async function loadSummary() {
  if (!config.url || !config.anonKey || !config.leagueSummaryView) {
    setStatus("Supabase 설정을 확인해주세요.");
    return;
  }

  const slug = config.leagueMatchSlug || "space-star-league-main";
  const matchEndpoint = `${config.url}/rest/v1/league_matches?slug=eq.${encodeURIComponent(slug)}&select=slug,title,team_a_name,team_a_subtitle,team_b_name,team_b_subtitle,status,winner_team,starts_at,closes_at,close_minutes`;
  const summaryEndpoint = `${config.url}/rest/v1/${config.leagueSummaryView}?slug=eq.${encodeURIComponent(slug)}&select=*`;

  try {
    const [matchRows, summaryRows] = await Promise.all([fetchRows(matchEndpoint), fetchRows(summaryEndpoint)]);
    const matchData = matchRows?.[0];
    const summaryData = summaryRows?.[0];

    if (!matchData && !summaryData) {
      throw new Error("match_not_found");
    }

    applySummary({
      ...(summaryData || {}),
      ...(matchData || {}),
    });
    setStatus("");
  } catch (error) {
    setStatus(`불러오기 실패: ${error.message}`);
  }
}

async function fetchRows(endpoint) {
  const response = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });
  const rows = await response.json();
  if (!response.ok) throw new Error(rows.message || "fetch_failed");
  return rows;
}

async function callRpc(name, payload) {
  const endpoint = `${config.url}/rest/v1/rpc/${name}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || name);
  return data;
}

function applySummary(data) {
  if (!data) return;
  els.title.value = data.title || "";
  els.teamA.value = data.team_a_name || "";
  els.teamASubtitle.value = data.team_a_subtitle || "";
  els.teamB.value = data.team_b_name || "";
  els.teamBSubtitle.value = data.team_b_subtitle || "";
  els.closeMinutes.value = data.close_minutes ? String(data.close_minutes) : "";
  if (els.winner?.options?.[0]) els.winner.options[0].textContent = `${data.team_a_name || "A팀"} 승리`;
  if (els.winner?.options?.[1]) els.winner.options[1].textContent = `${data.team_b_name || "B팀"} 승리`;
  const closeText = data.closes_at ? ` · 마감 ${formatDateTime(data.closes_at)}` : "";
  const statusText = data.status === "open" ? "진행중" : data.status === "locked" ? "마감" : data.status === "settled" ? "정산완료" : "대기";
  els.summary.textContent = `${statusText} · 전체 ${Number(data.total_bets || 0)}표 · A ${Number(data.team_a_bets || 0)}표 · B ${Number(data.team_b_bets || 0)}표${closeText}`;
}

function setStatus(message) {
  els.status.textContent = message;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
