(function () {
  const container = d3.select("#map");
  const tooltip = d3.select("#tooltip");
  const WIDTH = 900, HEIGHT = 460;
  const svg = container.append("svg").attr("width", "100%").attr("height", HEIGHT).attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  const projection = d3.geoEqualEarth();
  const path = d3.geoPath(projection);

  const SALARY_TOLERANCE_PCT = 0.05; // ±5%

  function salaryInRange(vSalary, targetSalary) {
    if (targetSalary == null || !isFinite(targetSalary)) return true;
    if (vSalary == null || !isFinite(vSalary)) return false;

    const min = targetSalary * (1 - SALARY_TOLERANCE_PCT);
    const max = targetSalary * (1 + SALARY_TOLERANCE_PCT);
    return vSalary >= min && vSalary <= max;
  }

  d3.select("#map-container").insert("div", ":first-child").html(`
    Month: <strong id="monthLabel"></strong>
    <input type="range" id="monthSlider" min="0" value="0" style="width:300px">
    <button id="playPause">Play</button>
    <div id="legend"></div>
    <div id="scatterHint" style="margin-top:6px;font-size:12px;color:#555"></div>
  `);

  const slider = d3.select("#monthSlider");
  const monthLabel = d3.select("#monthLabel");
  const playBtn = d3.select("#playPause");
  const scatterHint = d3.select("#scatterHint");

  const details = d3.select("#map-container").append("div").attr("id", "details")
    .style("margin-top", "8px").style("background", "#fafafa").style("border", "1px solid #ddd")
    .style("padding", "8px").style("font-size", "12px");

  Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
    d3.csv("ai_job_dataset.csv", d3.autoType)
  ]).then(([world, jobs]) => {
    jobs.forEach(d => {
      d.countryNorm = (d.company_location || "").toLowerCase();
      const dt = new Date(d.posting_date);
      if (!isNaN(dt)) d.month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    });

    const valid = jobs.filter(d => d.month);
    const months = [...new Set(valid.map(d => d.month))].sort();
    slider.attr("max", months.length - 1);

    updateState({ selectedMonth: months[0] });

    const countries = topojson.feature(world, world.objects.countries).features;
    countries.forEach(d => d.countryNorm = (d.properties.name || "").toLowerCase());
    projection.fitSize([WIDTH, HEIGHT], { type: "FeatureCollection", features: countries });
    const g = svg.append("g");

    function scatterFilterOk(v) {
      const sel = appState.selectedScatter;
      if (!sel) return true;

      const targetSalary = sel.salary_usd;
      const targetJob = sel.job_title;
      const targetMonth = sel.month; 

      return (
        salaryInRange(v.salary_usd, targetSalary) &&
        v.job_title === targetJob &&
        (!targetMonth || v.month === targetMonth) 
      );
    }

    const paths = g.selectAll("path").data(countries).join("path")
      .attr("d", path).attr("stroke", "#999").attr("fill", "#eee")
      .on("mousemove", (e, d) => {
        const r = valid.filter(v =>
          v.countryNorm === d.countryNorm &&
          (!appState.selectedJobs.length || appState.selectedJobs.includes(v.job_title)) &&
          (appState.scatterTimeMode !== "month" || v.month === appState.selectedMonth) &&
          scatterFilterOk(v)
        );

        tooltip.style("display", "block")
          .style("left", e.pageX + 10 + "px")
          .style("top", e.pageY + 10 + "px")
          .html(`
            <strong>${d.properties.name}</strong><br>
            Jobs: ${r.length}<br>
            Remote: ${Math.round(d3.mean(r, d => d.remote_ratio) || 0)}%
          `);
      })
      .on("mouseout", () => tooltip.style("display", "none"))
      .on("click", (e, d) => {
        const c = d.properties.name;
        const next = appState.selectedCountries.includes(c)
          ? appState.selectedCountries.filter(x => x !== c)
          : [...appState.selectedCountries, c];
        updateState({ selectedCountries: next });
      });

    function updateMap() {
      const month = months[+slider.node().value];
      if (appState.scatterTimeMode === "month" && appState.selectedMonth !== month) {
        updateState({ selectedMonth: month });
      }

      monthLabel.text(appState.scatterTimeMode === "month" ? (appState.selectedMonth || month) : "Overall");

      const sel = appState.selectedScatter;
      if (sel) {
        const min = Math.round(sel.salary_usd * (1 - SALARY_TOLERANCE_PCT));
        const max = Math.round(sel.salary_usd * (1 + SALARY_TOLERANCE_PCT));
        scatterHint.html(
          `Scatter selection: <strong>${sel.job_title}</strong>, Salary <strong>$${min} – $${max}</strong> (±5%), Month <strong>${sel.month || "-"}</strong>
           &nbsp;(<a href="#" id="clearScatterSel">clear</a>)`
        );
        d3.select("#clearScatterSel").on("click", (e) => {
          e.preventDefault();
          updateState({ selectedScatter: null });
        });
      } else {
        scatterHint.text("Click a point in the scatterplot to filter the map by salary (±5%) and the same month.");
      }

      const filtered = valid.filter(v =>
        (!appState.selectedJobs.length || appState.selectedJobs.includes(v.job_title)) &&
        (!appState.selectedCountries.length || appState.selectedCountries.includes(v.company_location)) &&
        (appState.scatterTimeMode !== "month" || v.month === appState.selectedMonth) &&
        scatterFilterOk(v)
      );

      const countsByCountry = d3.rollup(filtered, v => v.length, d => d.countryNorm);
      const nonZeroCounts = Array.from(countsByCountry.values()).filter(d => d > 0);
      const maxJobs = d3.max(nonZeroCounts) || 1;
      const minJobs = d3.min(nonZeroCounts) || 0;
      const midJobs = Math.round((minJobs + maxJobs) / 2);
      const color = d3.scaleSequential().domain([minJobs, maxJobs]).interpolator(d3.interpolateYlGnBu);
      drawLegend(d3.select("#legend").node(), color, minJobs, midJobs, maxJobs);

      paths.transition().duration(300).attr("fill", d => {
        const count = countsByCountry.get(d.countryNorm) || 0;
        return count > 0 ? color(count) : "#eee";
      });

      updateDetails(filtered, sel);
    }

    function updateDetails(filtered, sel) {
      const scatterActive = !!sel;

      if (!appState.selectedCountries.length && !scatterActive) {
        details.html("<em>No country selected</em>");
        return;
      }

      let countriesToShow;
      if (appState.selectedCountries.length) {
        countriesToShow = appState.selectedCountries;
      } else {
        countriesToShow = [...new Set(filtered.map(d => d.company_location))].sort();
      }

      let filterLine = "";
      if (sel) {
        const min = Math.round(sel.salary_usd * (1 - SALARY_TOLERANCE_PCT));
        const max = Math.round(sel.salary_usd * (1 + SALARY_TOLERANCE_PCT));
        filterLine = `<div style="margin-top:6px;color:#444">
          Filter: <strong>${sel.job_title}</strong>, Salary <strong>$${min} – $${max}</strong> (±5%), Month <strong>${sel.month || "-"}</strong>
        </div>`;
      }

      details.html(`
        <strong>${appState.scatterTimeMode === "month" ? (appState.selectedMonth || "") : "Overall"}</strong>
        ${filterLine}
        <table style="width:100%;margin-top:6px;border-collapse:collapse">
          <tr><th align="left">Country</th><th>Jobs</th><th>Ø Salary</th><th>Remote %</th></tr>
          ${countriesToShow.map(c => {
            const r = filtered.filter(v => v.countryNorm === c.toLowerCase());
            return `<tr>
              <td>${c}</td>
              <td align="center">${r.length}</td>
              <td align="center">$${Math.round(d3.mean(r, d => d.salary_usd) || 0)}</td>
              <td align="center">${Math.round(d3.mean(r, d => d.remote_ratio) || 0)}%</td>
            </tr>`;
          }).join("")}
        </table>
      `);
    }

    slider.on("input", () => {
      const month = months[+slider.node().value];
      if (appState.scatterTimeMode === "month") updateState({ selectedMonth: month });
      updateMap();
    });

    let timer = null, playing = false;
    playBtn.on("click", () => {
      playing = !playing;
      playBtn.text(playing ? "Pause" : "Play");
      if (playing) {
        timer = d3.interval(() => {
          slider.node().value = (+slider.node().value + 1) % months.length;
          const month = months[+slider.node().value];
          if (appState.scatterTimeMode === "month") updateState({ selectedMonth: month });
          updateMap();
        }, 900);
      } else timer?.stop();
    });

    window.addEventListener("stateChanged", updateMap);
    updateMap();
  });

  function drawLegend(container, scale, min, mid, max) {
    container.innerHTML = "";
    const svg = d3.create("svg").attr("width", 260).attr("height", 50);
    svg.append("text").attr("x", 10).attr("y", 10).style("font-size", "11px").text(`Min: ${min}`);
    svg.append("text").attr("x", 120).attr("y", 10).style("font-size", "11px").attr("text-anchor", "middle").text(`Mid: ${mid}`);
    svg.append("text").attr("x", 250).attr("y", 10).style("font-size", "11px").attr("text-anchor", "end").text(`Max: ${max}`);
    const grad = svg.append("defs").append("linearGradient").attr("id", "grad");
    for (let i = 0; i <= 8; i++) grad.append("stop").attr("offset", `${i * 12.5}%`).attr("stop-color", scale(min + (i / 8) * (max - min)));
    svg.append("rect").attr("x", 10).attr("y", 20).attr("width", 240).attr("height", 12).attr("fill", "url(#grad)");
    container.appendChild(svg.node());
  }
})();
