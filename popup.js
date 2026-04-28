const openingPopup = document.querySelector("#openingPopup");

if (openingPopup) {
  const closePopup = () => {
    openingPopup.classList.add("is-hidden");
    window.setTimeout(() => {
      openingPopup.remove();
    }, 220);
  };

  openingPopup.addEventListener("click", closePopup);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopup();
    }
  });
}
