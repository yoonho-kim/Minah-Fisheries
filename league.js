const STORAGE_KEY = "space-star-league-state-v2";
const USER_PICK_KEY = "space-star-league-user-pick-v2";
const BETTOR_KEY = "space-star-league-bettor-key-v2";
const config = window.MINAH_SUPABASE || {};

const teams = {
  a: { name: "클라스 팀", color: "blue" },
  b: { name: "광모 팀", color: "red" },
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
  activity: document.querySelector("#activity-list"),
  userPick: document.querySelector("#user-pick"),
  buttons: [...document.querySelectorAll("[data-team]")],
};

render();
seedActivity();
loadRemoteSummary();

els.buttons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (userPick) {
      state.activity.unshift(makeActivity("이미 배팅했습니다. IP당 1회만 참여할 수 있습니다.", "system"));
      state.activity = state.activity.slice(0, 7);
      save();
      render();
      return;
    }

    const team = button.dataset.team;
    await submitBet(team);
  });
});

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
        return parsed;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return {
    a: 0,
    b: 0,
    activity: [makeActivity("배팅이 초기화되었습니다.", "system")],
  };
}

function castBet(team, source) {
  state[team] += 1;

  const message =
    source === "내 배팅"
      ? `${teams[team].name}을 선택했습니다.`
      : `${source}에서 ${teams[team].name}에 배팅했습니다.`;
  state.activity.unshift(makeActivity(message, teams[team].color));
  state.activity = state.activity.slice(0, 7);
  save();
  render();
}

async function submitBet(team) {
  setButtonsDisabled(true);

  try {
    if (config.leagueVoteEndpoint) {
      const response = await fetch(config.leagueVoteEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchSlug: config.leagueMatchSlug || "space-star-league-main",
          bettorKey: getBettorKey(),
          team,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (payload.vote) {
        applyServerCounts(payload.vote);
      }

      if (response.status === 409 || payload.vote?.already_voted) {
        userPick = payload.vote?.selected_team || userPick;
        if (userPick) localStorage.setItem(USER_PICK_KEY, userPick);
        state.activity.unshift(makeActivity("이미 배팅했습니다. IP당 1회만 참여할 수 있습니다.", "system"));
        state.activity = state.activity.slice(0, 7);
        save();
        render();
        return;
      }

      if (!response.ok) throw new Error(payload.error || "vote_failed");

      localStorage.setItem(USER_PICK_KEY, team);
      userPick = team;
      state.activity.unshift(makeActivity(`${teams[team].name}을 선택했습니다.`, teams[team].color));
      state.activity = state.activity.slice(0, 7);
      save();
      render();
      broadcast();
      return;
    }

    castBet(team, "내 배팅");
    localStorage.setItem(USER_PICK_KEY, team);
    userPick = team;
    broadcast();
  } catch {
    state.activity.unshift(makeActivity("서버 배팅 연결을 확인해주세요.", "system"));
    state.activity = state.activity.slice(0, 7);
    render();
  } finally {
    setButtonsDisabled(false);
  }
}

function render() {
  const total = state.a + state.b;
  const aRatio = total ? Math.round((state.a / total) * 100) : 0;
  const bRatio = total ? 100 - aRatio : 0;
  const aMeter = total ? aRatio : 50;
  const bMeter = total ? bRatio : 50;

  els.aCount.textContent = state.a;
  els.bCount.textContent = state.b;
  els.total.textContent = `총 ${total}표`;
  els.ratioA.textContent = aRatio;
  els.ratioB.textContent = bRatio;
  els.meterA.style.width = `${aMeter}%`;
  els.meterB.style.width = `${bMeter}%`;

  els.aOdds.textContent = calcOdds(total, state.a);
  els.bOdds.textContent = calcOdds(total, state.b);
  els.userPick.textContent = userPick ? `내 선택: ${teams[userPick].name}` : "아직 배팅하지 않았습니다.";

  els.buttons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.team === userPick);
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
    button.disabled = disabled;
  });
}
