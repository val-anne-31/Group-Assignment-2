window.appState = {
  selectedCountries: [],
  selectedJobs: [],
  scatterTimeMode: "overall",
  selectedMonth: null,

  selectedScatter: null
};

window.updateState = function (patch) {
  Object.assign(appState, patch);

  window.dispatchEvent(
    new CustomEvent("stateChanged", { detail: appState })
  );
};
