const STORAGE_KEY = "space-star-league-state-v2";
const USER_PICK_KEY = "space-star-league-user-pick-v2";
const BETTOR_KEY = "space-star-league-bettor-key-v2";
const COMMENT_KEY = "space-star-league-comment-key-v1";
const config = window.MINAH_SUPABASE || {};

const teams = {
  a: { name: "클라스 팀", subtitle: "전통강자", color: "blue" },
  b: { name: "광모 팀", subtitle: "도전자 87 대표 젊은 피", color: "red" },
};

const state = loadState();
let userPick = localStorage.getItem(USER_PICK_KEY);
const channel = "BroadcastChannel" in window ? new BroadcastChannel("space-star-league") : null;

const els = {
  aCount: document.querySelector("#team-a-count"),
  bCount: document.querySelector("#team-b-count"),
  aOdds: document.querySelector("#team-a-odds"),
  bOdds: document.querySelector("#team-b-odds"),
  ratioA: document.querySelector("#ratio-a"),
  ratioB: document.querySelector("#ratio-b"),
  meterA: document.querySelector("#meter-a"),
  meterB: document.querySelector("#meter-b"),
  total: document.querySelector("#total-count"),
  diamonds: document.querySelector("#diamond-count"),
  betAmount: document.querySelector("#bet-amount"),
  activity: document.querySelector("#activity-list"),
  commentForm: document.querySelector("#comment-form"),
  commentInput: document.querySelector("#comment-input"),
  userPick: document.querySelector("#user-pick"),
  buttons: [...document.querySelectorAll("[data-team]")],
  adminTrigger: document.querySelector("#admin-trigger"),
  passwordDialog: document.querySelector("#password-dialog"),
  passwordForm: document.querySelector("#password-form"),
  passwordInput: document.querySelector("#admin-password"),
  passwordCancel: document.querySelector("#password-cancel"),
  dialogStatus: document.querySelector("#dialog-status"),
  brandTitle: document.querySelector(".brand strong"),
  pageTitle: document.querySelector("#page-title"),
  teamAName: document.querySelector("#team-a-name"),
  teamBName: document.querySelector("#team-b-name"),
  teamASubtitle: document.querySelector("#team-a-subtitle"),
  teamBSubtitle: document.querySelector("#team-b-subtitle"),
  teamStripNames: [...document.querySelectorAll(".team-strip span")],
  betA: document.querySelector(".bet-a"),
  betB: document.querySelector(".bet-b"),
  finalA: document.querySelector("#team-a-final"),
  finalB: document.querySelector("#team-b-final"),
  deadlineLabel: document.querySelector("#deadline-label"),
  liveDot: document.querySelector(".live-dot"),
};

let adminTapCount = 0;
let adminTapTimer;
let countdownTimer;
let isSubmitting = false;

render();
seedActivity();
loadRemoteSummary();
loadWallet();
startCountdown();
window.setInterval(loadRemoteSummary, 2500);
window.setInterval(loadWallet, 5000);
loadComments();
window.setInterval(loadComments, 2500);

els.buttons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!isVotingActive()) {
      state.activity.unshift(makeActivity(isVotingClosed() ? "투표가 마감되었습니다." : "투표 시작 전입니다.", "system"));
      state.activity = state.activity.slice(0, 3);
      save();
      render();
      return;
    }

    const team = button.dataset.team;
    await submitBet(team);
  });
});

if (els.commentForm) {
  els.commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitComment();
  });
}

if (els.adminTrigger) {
  els.adminTrigger.addEventListener("click", () => {
    adminTapCount += 1;
    window.clearTimeout(adminTapTimer);

    if (adminTapCount >= 3) {
      adminTapCount = 0;
      openPasswordDialog();
      return;
    }

    adminTapTimer = window.setTimeout(() => {
      adminTapCount = 0;
    }, 900);
  });
}

if (els.passwordCancel) {
  els.passwordCancel.addEventListener("click", () => {
    els.passwordDialog.close();
  });
}

if (els.passwordForm) {
  els.passwordForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (els.passwordInput.value === "1234qwer") {
      sessionStorage.setItem("space-star-league-admin-ok", "yes");
      window.location.href = "league-admin.html";
      return;
    }

    els.dialogStatus.textContent = "패스워드가 올바르지 않습니다.";
    els.passwordInput.select();
  });
}

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  Object.assign(state, JSON.parse(event.newValue));
  render();
});

if (channel) {
  channel.addEventListener("message", (event) => {
    if (event.data?.type !== "state") return;
    Object.assign(state, event.data.state);
    render();
  });
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Number.isFinite(parsed.a) && Number.isFinite(parsed.b) && Array.isArray(parsed.activity)) {
        parsed.diamonds = Number.isFinite(parsed.diamonds) ? parsed.diamonds : 10;
        return parsed;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return {
    a: 0,
    b: 0,
    diamonds: 10,
    closesAt: null,
    status: "scheduled",
    activity: [],
  };
}

function castBet(team, source) {
  state[team] += 1;

  const message =
    source === "내 배팅"
      ? `${teams[team].name}을 선택했습니다.`
      : `${source}에서 ${teams[team].name}에 배팅했습니다.`;
  state.activity.unshift(makeActivity(message, teams[team].color));
  state.activity = state.activity.slice(0, 3);
  save();
  render();
}

async function submitBet(team) {
  isSubmitting = true;
  setButtonsDisabled(true);
  const amount = getBetAmount();

  if (amount > state.diamonds) {
    showNoticePopup(`보유 다이아가 부족합니다. 현재 ${state.diamonds} DIA를 가지고 있습니다.`);
    isSubmitting = false;
    setButtonsDisabled(false);
    return;
  }

  try {
    if (config.leagueVoteEndpoint) {
      const response = await fetch(config.leagueVoteEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.anonKey || "",
        },
        body: JSON.stringify({
          matchSlug: config.leagueMatchSlug || "space-star-league-main",
          bettorKey: getBettorKey(),
          team,
          amount,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (payload.vote?.diamond_balance !== undefined) {
        applyWallet(payload.vote.diamond_balance);
      }

      if (payload.error === "voting_closed") {
        state.status = "locked";
        state.activity.unshift(makeActivity("투표가 마감되었습니다.", "system"));
        state.activity = state.activity.slice(0, 3);
        await loadRemoteSummary();
        save();
        render();
        return;
      }

      if (payload.error === "insufficient_diamonds") {
        await loadRemoteSummary();
        save();
        render();
        showNoticePopup("보유 다이아가 부족합니다.");
        return;
      }

      if (response.status === 409 || payload.vote?.already_voted) {
        await loadRemoteSummary();
        userPick = payload.vote?.selected_team || userPick;
        if (userPick) localStorage.setItem(USER_PICK_KEY, userPick);
        save();
        render();
        showNoticePopup("배팅을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      if (!response.ok) throw new Error(payload.error || "vote_failed");

      if (!payload.vote) throw new Error("unexpected_vote_response");

      await loadRemoteSummary();
      localStorage.setItem(USER_PICK_KEY, team);
      userPick = team;
      save();
      render();
      showNoticePopup(`${teams[team].name}에 ${amount} DIA를 배팅했습니다.`);
      broadcast();
      return;
    }

    castBet(team, "내 배팅");
    localStorage.setItem(USER_PICK_KEY, team);
    userPick = team;
    broadcast();
  } catch (error) {
    const message =
      error.message === "unexpected_vote_response"
        ? "투표 저장 함수 코드를 업데이트해주세요."
        : "서버 배팅 연결을 확인해주세요.";
    state.activity.unshift(makeActivity(message, "system"));
    state.activity = state.activity.slice(0, 3);
    render();
  } finally {
    isSubmitting = false;
    setButtonsDisabled(false);
  }
}

function render() {
  const total = state.a + state.b;
  const aRatio = total ? Math.round((state.a / total) * 100) : 0;
  const bRatio = total ? 100 - aRatio : 0;
  const aMeter = total ? aRatio : 50;
  const bMeter = total ? bRatio : 50;

  if (els.aCount) els.aCount.textContent = state.a;
  if (els.bCount) els.bCount.textContent = state.b;
  els.total.textContent = total;
  if (els.diamonds) els.diamonds.textContent = formatNumber(state.diamonds);
  if (els.betAmount) els.betAmount.max = Math.max(1, state.diamonds);
  els.ratioA.textContent = aRatio;
  els.ratioB.textContent = bRatio;
  els.meterA.style.width = `${aMeter}%`;
  els.meterB.style.width = `${bMeter}%`;

  els.aOdds.textContent = calcOdds(total, state.a);
  els.bOdds.textContent = calcOdds(total, state.b);
  els.userPick.textContent = isVotingClosed()
    ? "투표가 마감되었습니다."
    : !isVotingActive()
      ? "투표 시작 전입니다."
      : userPick
      ? `내 선택: ${teams[userPick].name}`
      : "아직 배팅하지 않았습니다.";
  renderMatchText();
  renderDeadline();
  renderClosedStats(aRatio, bRatio);

  els.buttons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.team === userPick);
    button.hidden = !isVotingActive();
    button.disabled = !isVotingActive() || isSubmitting;
  });

  els.activity.innerHTML = state.activity
    .map(
      (item) => `
        <li>
          <span>${item.text}</span>
          <time>${item.time}</time>
        </li>
      `
    )
    .join("");
}

async function submitComment() {
  const body = els.commentInput.value.trim();
  if (!body || !config.leagueCommentEndpoint) return;

  if (state.diamonds < 1) {
    showNoticePopup("댓글을 남기려면 다이아 1개가 필요합니다.");
    return;
  }

  els.commentInput.value = "";

  try {
    const response = await fetch(config.leagueCommentEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey || "",
      },
      body: JSON.stringify({
        matchSlug: config.leagueMatchSlug || "space-star-league-main",
        commenterKey: getCommentKey(),
        body,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (payload.comment?.diamond_balance !== undefined) {
      applyWallet(payload.comment.diamond_balance);
    }

    if (payload.error === "insufficient_diamonds") {
      showNoticePopup("댓글을 남기려면 다이아 1개가 필요합니다.");
      return;
    }
    if (!response.ok) throw new Error("comment_failed");
    await loadComments();
    showNoticePopup("댓글 작성으로 다이아 1개가 소모되었습니다.");
  } catch {
    showNoticePopup("댓글 저장을 확인해주세요.");
  }
}

async function loadComments() {
  if (!config.url || !config.anonKey) return;

  const slug = config.leagueMatchSlug || "space-star-league-main";
  const endpoint = `${config.url}/rest/v1/league_comments?match_slug=eq.${encodeURIComponent(slug)}&select=body,created_at&order=created_at.desc&limit=3`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
    });
    const rows = await response.json();
    if (!response.ok) return;
    state.activity = rows.map((row) => ({
      text: row.body,
      time: new Intl.DateTimeFormat("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(row.created_at)),
    }));
    save();
    render();
  } catch {
    // Keep the current comments if the comments table has not been created yet.
  }
}

async function loadWallet() {
  if (!config.leagueVoteEndpoint) return;

  try {
    const response = await fetch(config.leagueVoteEndpoint, {
      method: "GET",
      headers: {
        apikey: config.anonKey || "",
      },
    });
    const payload = await response.json();
    if (!response.ok) return;
    applyWallet(payload.diamonds);
    save();
    render();
  } catch {
    // Keep the last known wallet display if the endpoint is not ready yet.
  }
}

async function loadRemoteSummary() {
  if (!config.url || !config.anonKey || !config.leagueSummaryView) return;

  const slug = config.leagueMatchSlug || "space-star-league-main";
  const endpoint = `${config.url}/rest/v1/${config.leagueSummaryView}?slug=eq.${encodeURIComponent(slug)}&select=*`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
    });
    const rows = await response.json();
    if (!response.ok || !rows?.[0]) return;
    applyServerCounts(rows[0]);
    save();
    render();
  } catch {
    // Keep the local display if the remote DB has not been initialized yet.
  }
}

function applyServerCounts(data) {
  state.a = Number(data.team_a_bets ?? state.a);
  state.b = Number(data.team_b_bets ?? state.b);

  if (Number(data.total_bets ?? state.a + state.b) === 0) {
    userPick = null;
    localStorage.removeItem(USER_PICK_KEY);
  }

  if (data.title) {
    state.title = data.title;
  }

  if (data.team_a_name) {
    teams.a.name = data.team_a_name;
  }

  if (data.team_b_name) {
    teams.b.name = data.team_b_name;
  }

  if (data.team_a_subtitle !== undefined) {
    teams.a.subtitle = data.team_a_subtitle || "";
  }

  if (data.team_b_subtitle !== undefined) {
    teams.b.subtitle = data.team_b_subtitle || "";
  }

  if (data.closes_at !== undefined) {
    state.closesAt = data.closes_at;
  }

  if (data.status) {
    state.status = data.status;
  }

  if (data.diamond_balance !== undefined) {
    applyWallet(data.diamond_balance);
  }
}

function applyWallet(value) {
  const diamonds = Number(value);
  if (!Number.isFinite(diamonds)) return;
  state.diamonds = Math.max(0, Math.floor(diamonds));
}

function getBetAmount() {
  const value = Number(els.betAmount?.value || 1);
  const amount = Number.isFinite(value) ? Math.floor(value) : 1;
  const safeAmount = Math.max(1, Math.min(1000, amount));
  if (els.betAmount) els.betAmount.value = String(safeAmount);
  return safeAmount;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(Number(value) || 0);
}

function calcOdds(total, count) {
  if (!count) return "대기";
  return `${Math.max(1.01, total / count).toFixed(2)} : 1`;
}

function makeActivity(text, tone) {
  return {
    text,
    tone,
    time: new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date()),
  };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function broadcast() {
  if (channel) channel.postMessage({ type: "state", state });
}

function seedActivity() {
  save();
  render();
}

function getBettorKey() {
  const saved = localStorage.getItem(BETTOR_KEY);
  if (saved) return saved;

  const key = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(BETTOR_KEY, key);
  return key;
}

function setButtonsDisabled(disabled) {
  els.buttons.forEach((button) => {
    button.disabled = disabled || !isVotingActive();
  });
}

function renderMatchText() {
  const title = state.title || "우주 스타 리그";
  if (els.brandTitle) els.brandTitle.textContent = title;
  if (els.pageTitle) els.pageTitle.textContent = `${title}: ${teams.a.name} VS ${teams.b.name}`;
  if (els.teamAName) els.teamAName.textContent = teams.a.name;
  if (els.teamBName) els.teamBName.textContent = teams.b.name;
  if (els.teamASubtitle) els.teamASubtitle.textContent = teams.a.subtitle;
  if (els.teamBSubtitle) els.teamBSubtitle.textContent = teams.b.subtitle;
  if (els.teamStripNames[0]) els.teamStripNames[0].textContent = teams.a.name;
  if (els.teamStripNames[1]) els.teamStripNames[1].textContent = teams.b.name;
  if (els.betA) els.betA.textContent = `${stripTeamSuffix(teams.a.name)} 선택`;
  if (els.betB) els.betB.textContent = `${stripTeamSuffix(teams.b.name)} 선택`;
  document.title = `${title} | ${teams.a.name} VS ${teams.b.name}`;
}

function stripTeamSuffix(name) {
  return name.replace(/\s*팀$/, "");
}

function openPasswordDialog() {
  if (!els.passwordDialog) return;
  els.dialogStatus.textContent = "";
  els.passwordInput.value = "";
  els.passwordDialog.showModal();
  window.setTimeout(() => els.passwordInput.focus(), 50);
}

function showNoticePopup(message) {
  window.alert(message);
}

function isVotingClosed() {
  if (state.status && ["locked", "settled", "canceled"].includes(state.status)) return true;
  if (!state.closesAt) return false;
  return Date.now() >= Date.parse(state.closesAt);
}

function isVotingActive() {
  return state.status === "open" && !isVotingClosed();
}

function renderDeadline() {
  if (!els.deadlineLabel) return;

  if (state.status === "scheduled") {
    els.deadlineLabel.textContent = "대기중";
    els.adminTrigger.classList.remove("is-deadline", "is-closed");
    if (els.liveDot) els.liveDot.hidden = true;
    return;
  }

  if (!state.closesAt) {
    els.deadlineLabel.textContent = "LIVE";
    els.adminTrigger.classList.remove("is-deadline", "is-closed");
    if (els.liveDot) els.liveDot.hidden = false;
    return;
  }

  if (isVotingClosed()) {
    els.deadlineLabel.textContent = "투표마감";
    els.adminTrigger.classList.add("is-closed");
    els.adminTrigger.classList.remove("is-deadline");
    if (els.liveDot) els.liveDot.hidden = true;
    return;
  }

  els.deadlineLabel.textContent = formatRemaining(Date.parse(state.closesAt) - Date.now());
  els.adminTrigger.classList.add("is-deadline");
  els.adminTrigger.classList.remove("is-closed");
  if (els.liveDot) els.liveDot.hidden = true;
}

function renderClosedStats(aRatio, bRatio) {
  const closed = !isVotingActive();
  if (els.finalA) {
    els.finalA.hidden = !closed;
    els.finalA.textContent = `${state.a}표 · ${aRatio}%`;
  }
  if (els.finalB) {
    els.finalB.hidden = !closed;
    els.finalB.textContent = `${state.b}표 · ${bRatio}%`;
  }
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${String(minutes).padStart(2, "0")}분`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startCountdown() {
  window.clearInterval(countdownTimer);
  countdownTimer = window.setInterval(() => {
    render();
  }, 1000);
}

function getCommentKey() {
  const saved = localStorage.getItem(COMMENT_KEY);
  if (saved) return saved;

  const key = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(COMMENT_KEY, key);
  return key;
}
