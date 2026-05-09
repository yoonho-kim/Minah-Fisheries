const STORAGE_KEY = "space-star-league-state";
const USER_PICK_KEY = "space-star-league-user-pick";

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

els.buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const team = button.dataset.team;
    castBet(team, "내 배팅");
    localStorage.setItem(USER_PICK_KEY, team);
    userPick = team;
    broadcast();
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

setInterval(() => {
  const team = Math.random() > 0.48 ? "a" : "b";
  const labels = ["현장 관전자", "친구방 입장", "응원석", "대기실"];
  castBet(team, labels[Math.floor(Math.random() * labels.length)]);
  broadcast();
}, 5200);

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
    a: 34,
    b: 27,
    activity: [
      makeActivity("경기장이 열렸습니다.", "system"),
      makeActivity("초기 예측이 집계되었습니다.", "system"),
    ],
  };
}

function castBet(team, source) {
  if (userPick && source === "내 배팅" && userPick !== team) {
    state[userPick] = Math.max(0, state[userPick] - 1);
  }

  if (!(source === "내 배팅" && userPick === team)) {
    state[team] += 1;
  }

  const message =
    source === "내 배팅"
      ? `${teams[team].name}을 선택했습니다.`
      : `${source}에서 ${teams[team].name}에 배팅했습니다.`;
  state.activity.unshift(makeActivity(message, teams[team].color));
  state.activity = state.activity.slice(0, 7);
  save();
  render();
}

function render() {
  const total = state.a + state.b;
  const aRatio = total ? Math.round((state.a / total) * 100) : 50;
  const bRatio = 100 - aRatio;

  els.aCount.textContent = state.a;
  els.bCount.textContent = state.b;
  els.total.textContent = `총 ${total}표`;
  els.ratioA.textContent = aRatio;
  els.ratioB.textContent = bRatio;
  els.meterA.style.width = `${aRatio}%`;
  els.meterB.style.width = `${bRatio}%`;

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
