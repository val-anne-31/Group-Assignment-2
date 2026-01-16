(function () {
  const container = d3.select("#scatter-container");
  const tooltip = d3.select("#tooltip");

  if (!window.appState.scatterTimeMode) window.appState.scatterTimeMode = "overall";
  if (typeof window.appState.selectedScatter === "undefined") window.appState.selectedScatter = null;

  const chart = d3.select("#chart");
  const remoteColor = d3.scaleOrdinal([0, 50, 100], ["#1f77b4", "#ffbf00", "#2ca02c"]);
  const remoteLabel = d => d === 0 ? "On-site" : d === 50 ? "Hybrid" : "Remote";

  let dataAll;

  d3.csv("ai_job_dataset.csv", d3.autoType).then(data => {
    data.forEach(d => {
      const dt = new Date(d.posting_date);
      if (!isNaN(dt)) d.month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    });
    dataAll = data;
    initSelectors();
    drawLegend();
    draw();
  });

  function initSelectors() {
    d3.select("#jobSelect").selectAll("option")
      .data([...new Set(dataAll.map(d => d.job_title))].sort())
      .join("option").text(d => d);

    d3.select("#countrySelectScatter").selectAll("option")
      .data([...new Set(dataAll.map(d => d.company_location))].sort())
      .join("option").text(d => d);

    d3.selectAll("#jobSelect, #countrySelectScatter").on("change", pushState);
    d3.select("#jobSearch").on("input", () => filterOptions("jobSearch", "jobSelect"));
    d3.select("#countrySearch").on("input", () => filterOptions("countrySearch", "countrySelectScatter"));
    d3.select("#jobAll").on("click", () => selectAll("jobSelect", true));
    d3.select("#jobNone").on("click", () => selectAll("jobSelect", false));
    d3.select("#countryAll").on("click", () => selectAll("countrySelectScatter", true));
    d3.select("#countryNone").on("click", () => selectAll("countrySelectScatter", false));

    d3.selectAll("input[name=timeMode]").on("change", function () {
      updateState({ scatterTimeMode: this.value });
    });
  }

  function filterOptions(inputId, selectId) {
    const q = document.getElementById(inputId).value.toLowerCase();
    Array.from(document.getElementById(selectId).options)
      .forEach(o => o.style.display = o.value.toLowerCase().includes(q) ? "" : "none");
  }

  function selectAll(selectId, value) {
    Array.from(document.getElementById(selectId).options)
      .forEach(o => o.selected = value);
    pushState();
  }

  function pushState() {
    updateState({
      selectedJobs: [...jobSelect.selectedOptions].map(o => o.value),
      selectedCountries: [...countrySelectScatter.selectedOptions].map(o => o.value)
    });
  }

  window.addEventListener("stateChanged", draw);

  function isSameScatterSelection(sel, d) {
    if (!sel) return false;
    return sel.salary_usd === d.salary_usd && sel.job_title === d.job_title && sel.month === d.month;
  }

  function draw() {
    chart.selectAll("*").remove();

    const monthLabel = d3.select("#currentMonthLabel");
    if (appState.scatterTimeMode === "month" && appState.selectedMonth) monthLabel.text(`(${appState.selectedMonth})`);
    else monthLabel.text("");

    const data = dataAll.filter(d =>
      (!appState.selectedJobs.length || appState.selectedJobs.includes(d.job_title)) &&
      (!appState.selectedCountries.length || appState.selectedCountries.includes(d.company_location)) &&
      (appState.scatterTimeMode !== "month" || !appState.selectedMonth || d.month === appState.selectedMonth)
    );

    const w = chart.node().clientWidth;
    const h = 420;
    const m = { top: 20, right: 20, bottom: 60, left: 70 };

    const svg = chart.append("svg").attr("width", w).attr("height", h);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    if (!data.length) {
      g.append("text")
        .attr("x", (w - m.left - m.right) / 2)
        .attr("y", (h - m.top - m.bottom) / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("fill", "#666")
        .text("No data for current selection");
      return;
    }

    const x = d3.scaleLinear().domain(d3.extent(data, d => d.years_experience)).nice().range([0, w - m.left - m.right]);
    const y = d3.scaleLinear().domain(d3.extent(data, d => d.salary_usd)).nice().range([h - m.top - m.bottom, 0]);

    g.append("g").attr("transform", `translate(0,${y.range()[0]})`).call(d3.axisBottom(x));
    g.append("g").call(d3.axisLeft(y));

    g.append("text").attr("x", (w - m.left - m.right) / 2).attr("y", h - m.top - 20).attr("text-anchor", "middle")
      .style("font-size", "12px").style("font-weight", "bold").text("Experience (years)");
    g.append("text").attr("transform", "rotate(-90)").attr("x", -(h - m.top - m.bottom) / 2).attr("y", -50)
      .attr("text-anchor", "middle").style("font-size", "12px").style("font-weight", "bold").text("Salary (USD)");

    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", d => x(d.years_experience))
      .attr("cy", d => y(d.salary_usd))
      .attr("r", 5)
      .attr("fill", d => remoteColor(d.remote_ratio))
      .attr("opacity", 0.75)
      .attr("stroke", d => isSameScatterSelection(appState.selectedScatter, d) ? "#111" : "none")
      .attr("stroke-width", d => isSameScatterSelection(appState.selectedScatter, d) ? 2 : 0)
      .on("mouseover", (e, d) => tooltip.style("display", "block").html(`
        <strong>${d.job_title}</strong><br>
        ${d.company_location}<br>
        Month: ${d.month || "-"}<br>
        Experience: ${d.years_experience} yrs<br>
        Salary: $${d.salary_usd}<br>
        Remote: ${remoteLabel(d.remote_ratio)}<br>
        <em>Click to filter map by salary (±5%) + same month</em>
      `))
      .on("mousemove", e => tooltip.style("left", e.pageX + 8 + "px").style("top", e.pageY + 8 + "px"))
      .on("mouseout", () => tooltip.style("display", "none"))
      .on("click", (e, d) => {
        const same = isSameScatterSelection(appState.selectedScatter, d);

        updateState({
          selectedScatter: same ? null : {
            salary_usd: d.salary_usd,
            job_title: d.job_title,
            month: d.month || null
          }
        });
      });

    svg.on("dblclick", () => updateState({ selectedScatter: null }));
  }

  function drawLegend() {
    const legend = d3.select("#scatterLegend");
    const items = [{ v: 0, label: "On-site" }, { v: 50, label: "Hybrid" }, { v: 100, label: "Remote" }];
    const row = legend.selectAll("div").data(items).join("div").style("display", "flex").style("align-items", "center");
    row.append("div").style("width", "12px").style("height", "12px").style("border-radius", "50%").style("margin-right", "6px").style("background", d => remoteColor(d.v));
    row.append("span").style("font-size", "12px").text(d => d.label);
  }
})();
