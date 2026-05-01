const config = window.MINAH_SUPABASE || {};
const form = document.querySelector("#reservationForm");
const statusEl = document.querySelector("#reservationStatus");
const hasSupabaseConfig = Boolean(config.url && config.anonKey && window.supabase);

const client = hasSupabaseConfig
  ? window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

function setReservationStatus(message, tone = "muted") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

if (!client) {
  setReservationStatus("Supabase 설정 후 예약 문의가 저장됩니다.");
  form.querySelector("button").disabled = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!client) return;

  const formData = new FormData(form);
  const payload = {
    name: clean(formData.get("name"), 40),
    phone: clean(formData.get("phone"), 30),
    visit_date: clean(formData.get("visit_date"), 20),
    visit_time: clean(formData.get("visit_time"), 20),
    guests: clean(formData.get("guests"), 20),
    menu_interest: clean(formData.get("menu_interest"), 60),
    memo: clean(formData.get("memo"), 500),
  };

  if (!payload.name || !payload.phone || !payload.visit_date || !payload.visit_time || !payload.guests) {
    setReservationStatus("필수 항목을 모두 입력해주세요.", "error");
    return;
  }

  const button = form.querySelector("button");
  button.disabled = true;
  setReservationStatus("예약 문의를 저장하는 중입니다.");

  const { error } = await client.from(config.reservationTable || "reservation_requests").insert(payload);

  button.disabled = false;

  if (error) {
    setReservationStatus("예약 문의를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.", "error");
    return;
  }

  form.reset();
  setReservationStatus("예약 문의가 접수되었습니다. 확인 후 연락드릴게요.", "success");
});
